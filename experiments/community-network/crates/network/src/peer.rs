use crate::{
    model::*,
    moderation::{self, Preferences},
    store::*,
};
use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use iroh::{Endpoint, EndpointAddr, SecretKey, endpoint::presets};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::{
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::Semaphore;

pub struct Node {
    pub endpoint: Endpoint,
    pub(crate) admitted: std::sync::atomic::AtomicBool,
    pub(crate) relay: Option<iroh::RelayUrl>,
    pub(crate) direct_endpoint: Option<Endpoint>,
    pub key: SecretKey,
    pub root: PathBuf,
    pub store: Mutex<Store>,
    pub registry: String,
    pub client: reqwest::Client,
    pub(crate) membership_changed: Arc<tokio::sync::Notify>,
    last_direct_route: Mutex<Option<(EndpointAddr, std::time::Instant)>>,
    slots: Arc<Semaphore>,
    pub(crate) post_session: String,
    pub(crate) post_sync: tokio::sync::Mutex<()>,
    pub(crate) post_wake: Arc<tokio::sync::Notify>,
    pub(crate) history_refresh: tokio::sync::Mutex<()>,
    pub(crate) policy_refresh: tokio::sync::Mutex<()>,
    _profile_lock: std::fs::File,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub profile: Option<Profile>,
    pub participation: Participation,
    pub counters: Counters,
    pub active: bool,
    pub reason: String,
    pub registry: String,
    pub address: EndpointAddr,
    pub rooms: Vec<Room>,
    pub library: Vec<Signed<Record>>,
    pub preferences: Preferences,
    pub departed_rooms: Vec<Room>,
    pub hosting: Vec<String>,
    pub room_copies: std::collections::BTreeMap<String, crate::retention::RoomCopy>,
    pub post_storage: crate::replication::PostStorage,
}
impl Node {
    pub async fn start(root: PathBuf, registry: String) -> Result<Arc<Self>> {
        private_dir(&root)?;
        let profile_lock = lock_profile(&root)?;
        private_dir(&root.join("chunks"))?;
        let key = read_key(&root.join("identity.key"))?;
        let store = Store::open(&root.join("state.sqlite"))?;
        crate::retention::init(&store)?;
        crate::replication::init(&store)?;
        let relay = crate::hub::relay_url(&registry)?;
        let mut builder = Endpoint::builder(presets::Minimal)
            .secret_key(key.clone())
            .alpns(vec![ALPN.to_vec()]);
        if let Some(sockets) = store.get::<Vec<std::net::SocketAddr>>("transport:sockets")? {
            ensure!(
                !sockets.is_empty() && sockets.len() <= 2,
                "Invalid saved transport sockets"
            );
            builder = builder.clear_ip_transports();
            for socket in sockets {
                builder = builder.bind_addr(socket)?;
            }
        }
        if let Some(url) = &relay {
            builder = builder.relay_mode(iroh::RelayMode::custom([url.clone()]));
            if std::env::var("XNET_COMMUNITY_RELAY_ONLY").as_deref() == Ok("1") {
                builder = builder.clear_ip_transports();
            }
        }
        let endpoint = builder
            .bind()
            .await
            .context("Unable to bind this profile's peer ports")?;
        // Keep existing invitations usable across restarts on the same network.
        if !endpoint.bound_sockets().is_empty() {
            store.set("transport:sockets", &endpoint.bound_sockets())?;
        }
        let direct_endpoint = if relay.is_some() {
            Some(
                Endpoint::builder(presets::Minimal)
                    .secret_key(key.clone())
                    .relay_mode(iroh::RelayMode::Disabled)
                    .alpns(vec![ALPN.to_vec()])
                    .bind()
                    .await?,
            )
        } else {
            None
        };
        let mut counters = store.get::<Counters>("counters")?.unwrap_or_default();
        counters.stored = std::fs::read_dir(root.join("chunks"))?.try_fold(
            0u64,
            |sum, entry| -> Result<u64> {
                let entry = entry?;
                let metadata = entry.metadata()?;
                ensure!(metadata.is_file(), "Unexpected item in chunk storage");
                Ok(sum + metadata.len())
            },
        )?;
        store.set("counters", &counters)?;
        let node = Arc::new(Self {
            endpoint,
            relay,
            direct_endpoint,
            admitted: false.into(),
            key,
            root,
            store: Mutex::new(store),
            registry: registry.trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(10))
                .build()?,
            membership_changed: Default::default(),
            last_direct_route: Mutex::new(None),
            history_refresh: Default::default(),
            post_session: digest(&rand::random::<[u8; 32]>()),
            post_sync: Default::default(),
            post_wake: Default::default(),
            slots: Arc::new(Semaphore::new(16)),
            policy_refresh: tokio::sync::Mutex::new(()),
            _profile_lock: profile_lock,
        });
        {
            let store = node.store.lock().unwrap();
            for mut room in store.list::<Room>("room:")? {
                if room.owner.id == node.endpoint.id() {
                    room.owner = node.routing_address();
                    store.set(&format!("room:{}", room.id), &room)?;
                }
            }
        }
        tokio::spawn(node.clone().accept(node.endpoint.clone(), false));
        if let Some(media) = &node.direct_endpoint {
            tokio::spawn(node.clone().accept(media.clone(), true));
        }
        let changed = node.membership_changed.clone();
        let announcer = Arc::downgrade(&node);
        tokio::spawn(async move {
            let mut refresh = tokio::time::interval(Duration::from_secs(60));
            loop {
                let membership =
                    tokio::select! { _ = refresh.tick()=> false, _ = changed.notified()=> true };
                let Some(node) = announcer.upgrade() else {
                    break;
                };
                if node.require_active().is_ok() {
                    let result = if membership {
                        node.refresh_private_shares().await
                    } else {
                        node.announce_all().await
                    };
                    if let Err(e) = result {
                        eprintln!("Registry refresh failed: {e}");
                    }
                }
            }
        });
        Self::start_room_copies(&node);
        Self::start_post_copies(&node);
        Ok(node)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let store = self
            .store
            .lock()
            .map_err(|_| anyhow::anyhow!("Local store lock failed"))?;
        let (profile, participation, counters, reason) = Self::participation_state(&store)?;
        let active = reason == "Hosting enabled";
        Ok(Snapshot {
            id: self.endpoint.id().to_string(),
            profile,
            participation,
            counters,
            active,
            reason,
            registry: self.registry.clone(),
            address: self.routing_address(),
            room_copies: crate::retention::room_copies(&store)?,
            post_storage: crate::replication::status(&store)?,
            rooms: store.list("room:")?,
            library: store.list("media:")?,
            departed_rooms: store.list("departed-room:")?,
            preferences: store.get("moderation:preferences")?.unwrap_or_default(),
            hosting: store
                .list::<Signed<Record>>("media:")?
                .into_iter()
                .filter_map(|record| {
                    match store.get::<bool>(&format!("hosting:{}", record.payload.id)) {
                        Ok(value) => {
                            if value.unwrap_or(record.author == self.endpoint.id().to_string()) {
                                Some(Ok(record.payload.id))
                            } else {
                                None
                            }
                        }
                        Err(error) => Some(Err(error)),
                    }
                })
                .collect::<Result<Vec<_>>>()?,
        })
    }
    pub(crate) fn participation_state(
        store: &Store,
    ) -> Result<(Option<Profile>, Participation, Counters, String)> {
        let profile = store.get::<Profile>("profile")?;
        let participation = store
            .get::<Participation>("participation")?
            .unwrap_or_default();
        let counters = store.get::<Counters>("counters")?.unwrap_or_default();
        let reason = if profile.is_none() {
            "Create your local account"
        } else if !participation.enabled {
            "Hosting paused"
        } else if counters.uploaded >= participation.upload_mb * 1024 * 1024 {
            "Upload budget reached"
        } else {
            "Hosting enabled"
        }
        .to_string();
        Ok((profile, participation, counters, reason))
    }
    pub fn require_active(&self) -> Result<()> {
        let (_, _, _, reason) = Self::participation_state(&self.store.lock().unwrap())?;
        ensure!(
            reason == "Hosting enabled",
            "{} · resume contribution to use the network",
            reason
        );
        Ok(())
    }
    pub fn create_profile(&self, name: String) -> Result<()> {
        text(&name, 64)?;
        self.store.lock().unwrap().set("profile", &Profile { name })
    }
    pub async fn configure(&self, settings: Participation) -> Result<()> {
        settings.validate()?;
        self.store.lock().unwrap().set("participation", &settings)?;
        if settings.enabled {
            self.announce_all().await?;
        }
        Ok(())
    }
    pub async fn catalog(&self, query: &str) -> Result<Vec<CatalogItem>> {
        self.catalog_filtered(query, None, None).await
    }
    pub async fn catalog_filtered(
        &self,
        query: &str,
        kind: Option<&str>,
        reply_to: Option<&str>,
    ) -> Result<Vec<CatalogItem>> {
        if kind == Some("post") {
            self.require_active()?;
        }
        let items: Vec<CatalogItem> = self
            .client
            .get(format!("{}/api/catalog", self.registry))
            .query(&[
                ("q", query),
                ("kind", kind.unwrap_or("")),
                ("reply_to", reply_to.unwrap_or("")),
            ])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        ensure!(items.len() <= 100, "Registry response too large");
        for item in &items {
            item.record.verify()?;
            item.record.payload.validate()?;
        }
        let preferences = self.preferences()?;
        Ok(items
            .into_iter()
            .filter(|item| !preferences.hides(&item.record))
            .collect())
    }
    pub async fn publish_post(
        &self,
        body: String,
        reply_to: Option<String>,
    ) -> Result<Signed<Record>> {
        self.require_active()?;
        let body = body.trim().to_string();
        text(&body, 1120)?;
        ensure!(
            body.chars().count() <= 280,
            "Posts are limited to 280 characters"
        );
        if let Some(id) = &reply_to {
            ensure!(
                self.lookup(id).await?.record.payload.kind == "post",
                "Reply to a public post"
            );
        }
        let record = Record {
            id: digest(&rand::random::<[u8; 32]>()),
            kind: "post".into(),
            title: body.chars().take(32).collect(),
            description: body,
            owner_name: self.snapshot()?.profile.context("Create account")?.name,
            created: now(),
            size: 0,
            mime: String::new(),
            chunks: vec![],
            reply_to,
        };
        record.validate()?;
        let signed = Signed::new(record, &self.key)?;
        // Only successful announcements enter the background re-announcement queue.
        self.announce(signed.clone()).await?;
        self.store
            .lock()
            .unwrap()
            .set(&format!("published:{}", signed.payload.id), &signed)?;
        Ok(signed)
    }
    pub async fn lookup(&self, id: &str) -> Result<CatalogItem> {
        ensure!(valid_id(id), "Invalid content ID");
        let item: CatalogItem = self
            .client
            .get(format!("{}/api/items/{id}", self.registry))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        item.record.verify()?;
        item.record.payload.validate()?;
        ensure!(
            item.record.payload.id == id,
            "Registry returned the wrong record"
        );
        ensure!(item.providers.len() <= 64, "Too many providers");
        self.public_allowed(&item.record).await?;
        ensure!(
            !self.preferences()?.hides(&item.record),
            "Hidden by your personal filters. Undo in Safety & moderation to view it."
        );
        if item.record.payload.kind != "post" {
            self.store
                .lock()
                .unwrap()
                .set(&format!("catalog:{id}"), &item)?;
        }
        Ok(item)
    }
    pub async fn announce(&self, record: Signed<Record>) -> Result<()> {
        self.require_active()?;
        self.public_allowed(&record).await?;
        if !record.payload.chunks.is_empty() {
            ensure!(
                self.hosting_allowed(&record.payload.id, &record.author)?,
                "Hosting has not been approved for this item"
            );
        }
        self.register_relay(None).await?;
        let announcement = Signed::new(
            Announcement {
                record,
                address: self.routing_address(),
                expires: now() + 180,
            },
            &self.key,
        )?;
        self.client
            .post(format!("{}/api/announce", self.registry))
            .json(&announcement)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
    async fn refresh_private_shares(&self) -> Result<()> {
        let private: Vec<crate::private_media::Share> =
            self.store.lock().unwrap().list("private-share:")?;
        for share in private {
            self.announce_private(&share).await?;
        }
        Ok(())
    }
    pub async fn announce_all(&self) -> Result<()> {
        let records: Vec<Signed<Record>> = {
            let s = self.store.lock().unwrap();
            // New trackers renew original posts in the same compact inventory as volunteer
            // copies. Rotate one full original per tick so a restored index can heal, too.

            let mut records=s.db.prepare("SELECT data FROM kv WHERE key GLOB 'published:*' AND json_extract(data,'$.payload.kind')<>'post'")?.query_map([],|r|r.get::<_,String>(0))?.map(|raw|Ok(serde_json::from_str(&raw?)?)).collect::<Result<Vec<_>>>()?;
            let cursor = s.get::<String>("original-audit")?.unwrap_or_default();
            let id: Option<String> = s.db.query_row(
                "SELECT min(id) FROM post_originals WHERE id>?",
                [cursor],
                |r| r.get(0),
            )?;
            s.set("original-audit", &id.as_deref().unwrap_or(""))?;
            if let Some(id) = id {
                records.push(
                    s.get(&format!("published:{id}"))?
                        .context("Missing published post")?,
                );
            }
            records
        };
        self.refresh_private_shares().await?;
        if records.is_empty() {
            return Ok(());
        }
        let policy = self.registry_policy(true).await?;
        for record in records {
            if policy.permits(&record.payload.id, &record.author).is_err() {
                continue;
            }
            if !record.payload.chunks.is_empty()
                && !self.hosting_allowed(&record.payload.id, &record.author)?
            {
                continue;
            }
            self.announce(record).await?;
        }
        Ok(())
    }
    pub(crate) fn chunk_path(&self, id: &str, index: usize) -> Result<PathBuf> {
        ensure!(
            valid_id(id) && index < MAX_MEDIA.div_ceil(CHUNK as u64) as usize,
            "Invalid chunk address"
        );
        Ok(self.root.join("chunks").join(format!("{id}-{index}")))
    }
    fn cache_chunk(
        &self,
        record: &Record,
        index: usize,
        bytes: &[u8],
        download: bool,
    ) -> Result<()> {
        let expected = record.chunks.get(index).context("Chunk outside manifest")?;
        ensure!(digest(bytes) == *expected, "Chunk integrity check failed");
        let expected_len = ((record.size - index as u64 * CHUNK as u64).min(CHUNK as u64)) as usize;
        ensure!(bytes.len() == expected_len, "Chunk length mismatch");
        let path = self.chunk_path(&record.id, index)?;
        let store = self.store.lock().unwrap();
        if path.try_exists()? {
            return Ok(());
        }
        let settings = store
            .get::<Participation>("participation")?
            .unwrap_or_default();
        let mut counters = store.get::<Counters>("counters")?.unwrap_or_default();
        ensure!(settings.enabled, "Hosting paused");
        ensure!(
            counters.stored + bytes.len() as u64 <= settings.storage_mb * 1024 * 1024,
            "Storage budget reached"
        );
        write_secret(&path, bytes)?;
        counters.stored += bytes.len() as u64;
        if download {
            counters.downloaded += bytes.len() as u64;
        }
        store.set("counters", &counters)?;
        Ok(())
    }
    pub async fn publish_file(
        &self,
        path: &Path,
        title: String,
        description: String,
    ) -> Result<Signed<Record>> {
        let signed = self.prepare_file(path, title, description)?;
        let id = &signed.payload.id;
        {
            let store = self.store.lock().unwrap();
            store.set(&format!("hosting:{id}"), &true)?;
            store.set(&format!("media:{id}"), &signed)?;
            store.set(&format!("published:{id}"), &signed)?;
        }
        self.announce(signed.clone())
            .await
            .context("Saved locally, but registry publication failed. Resume hosting to retry.")?;
        Ok(signed)
    }
    pub(crate) fn prepare_file(
        &self,
        path: &Path,
        title: String,
        description: String,
    ) -> Result<Signed<Record>> {
        self.require_active()?;
        text(&title, 160)?;
        ensure!(description.len() <= 2000, "Description too long");
        let mut file = std::fs::File::open(path)?;
        let size = file.metadata()?.len();
        ensure!(size > 0 && size <= MAX_MEDIA, "Choose media up to 100 MB");
        let mut signature = [0u8; 16];
        let n = file.read(&mut signature)?;
        use std::io::{Seek, SeekFrom};
        file.seek(SeekFrom::Start(0))?;
        let ext = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_lowercase();
        let mime = match ext.as_str() {
            "mp4" if n >= 12 && &signature[4..8] == b"ftyp" => "video/mp4",
            "webm" if signature[..4] == [0x1a, 0x45, 0xdf, 0xa3] => "video/webm",
            "png" if signature[..8] == [137, 80, 78, 71, 13, 10, 26, 10] => "image/png",
            "jpg" | "jpeg" if signature[..3] == [0xff, 0xd8, 0xff] => "image/jpeg",
            "webp" if &signature[..4] == b"RIFF" && &signature[8..12] == b"WEBP" => "image/webp",
            "mp3"
                if n >= 3
                    && (&signature[..3] == b"ID3"
                        || (signature[0] == 0xff
                            && signature[1] & 0xe0 == 0xe0
                            && signature[1] & 0x06 != 0)) =>
            {
                "audio/mpeg"
            }
            "wav" if n >= 12 && &signature[..4] == b"RIFF" && &signature[8..12] == b"WAVE" => {
                "audio/wav"
            }
            _ => bail!(
                "Supported files: MP4, WebM, PNG, JPEG, WebP, MP3, WAV; file signature must match"
            ),
        };
        use sha2::{Digest, Sha256};
        let mut hash = Sha256::new();
        let mut chunks = vec![];
        let mut buffer = vec![0; CHUNK];
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hash.update(&buffer[..n]);
            chunks.push(digest(&buffer[..n]));
        }
        let id = hex::encode(hash.finalize());
        let name = self.snapshot()?.profile.context("Create account")?.name;
        let record = Record {
            id: id.clone(),
            kind: mime.split('/').next().context("Invalid media type")?.into(),
            title,
            description,
            owner_name: name,
            created: now(),
            size,
            mime: mime.into(),
            chunks,
            reply_to: None,
        };
        record.validate()?;
        file.seek(SeekFrom::Start(0))?;
        for i in 0..record.chunks.len() {
            let len = ((size - i as u64 * CHUNK as u64).min(CHUNK as u64)) as usize;
            file.read_exact(&mut buffer[..len])?;
            self.cache_chunk(&record, i, &buffer[..len], false)?;
        }
        Signed::new(record, &self.key)
    }
    pub async fn media(&self, id: &str) -> Result<CatalogItem> {
        self.require_active()?;
        ensure!(valid_id(id), "Invalid content ID");
        let local = {
            let store = self.store.lock().unwrap();
            store.get::<CatalogItem>(&format!("catalog:{id}"))?.or(store
                .get::<Signed<Record>>(&format!("media:{id}"))?
                .map(|record| CatalogItem {
                    record,
                    providers: vec![self.routing_address()],
                }))
        };
        let item = match local {
            Some(item) => item,
            None => self.lookup(id).await?,
        };
        self.public_allowed(&item.record).await?;
        ensure!(
            !self.preferences()?.hides(&item.record),
            "Hidden by your personal filters. Undo in Safety & moderation to view it."
        );
        Ok(item)
    }
    pub async fn chunk(&self, item: &CatalogItem, index: usize) -> Result<Vec<u8>> {
        self.require_active()?;
        self.public_allowed(&item.record).await?;
        ensure!(
            !self.preferences()?.hides(&item.record),
            "Hidden by your personal filters"
        );
        let record = &item.record.payload;
        let path = self.chunk_path(&record.id, index)?;
        match std::fs::read(&path) {
            Ok(bytes) => {
                ensure!(
                    record.chunks.get(index) == Some(&digest(&bytes)),
                    "Local chunk is corrupt"
                );
                return Ok(bytes);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        let mut failures = vec![];
        for address in &item.providers {
            if address.id == self.endpoint.id() {
                continue;
            }
            match self.fetch_chunk(address, &record.id, index).await {
                Ok(PeerResponse::Chunk { bytes }) => {
                    let bytes = STANDARD.decode(bytes)?;
                    self.cache_chunk(record, index, &bytes, true)?;
                    self.store
                        .lock()
                        .unwrap()
                        .set(&format!("media:{}", record.id), &item.record)?;
                    self.advertise_complete(&item.record).await?;
                    return Ok(bytes);
                }
                Ok(PeerResponse::Error { message }) => failures.push(message),
                Ok(_) => failures.push("Invalid peer response".into()),
                Err(e) => failures.push(e.to_string()),
            }
        }
        bail!("No available peer for this chunk. {}", failures.join("; "))
    }
    async fn advertise_complete(&self, record: &Signed<Record>) -> Result<()> {
        let id = &record.payload.id;
        if !self.hosting_allowed(id, &record.author)? {
            return Ok(());
        }
        if self
            .store
            .lock()
            .unwrap()
            .get::<Signed<Record>>(&format!("published:{id}"))?
            .is_some()
        {
            return Ok(());
        }
        for index in 0..record.payload.chunks.len() {
            if !self.chunk_path(id, index)?.try_exists()? {
                return Ok(());
            }
        }
        use sha2::{Digest, Sha256};
        let mut hash = Sha256::new();
        for index in 0..record.payload.chunks.len() {
            hash.update(std::fs::read(self.chunk_path(id, index)?)?);
        }
        ensure!(
            hex::encode(hash.finalize()) == *id,
            "Full content integrity failed"
        );
        self.store
            .lock()
            .unwrap()
            .set(&format!("published:{id}"), record)?;
        // Playback can continue with verified bytes when only discovery is unavailable.
        // The durable pending publication is retried by the registry refresh loop.
        if let Err(error) = self.announce(record.clone()).await {
            eprintln!("Verified local copy awaits registry announcement: {error}");
        }
        Ok(())
    }
    pub async fn retain(&self, id: &str) -> Result<()> {
        let item = self.lookup(id).await?;
        self.store
            .lock()
            .unwrap()
            .set(&format!("hosting:{id}"), &true)?;
        ensure!(
            matches!(
                item.record.payload.kind.as_str(),
                "video" | "image" | "audio"
            ),
            "Not media"
        );
        use sha2::{Digest, Sha256};
        let mut hash = Sha256::new();
        for index in 0..item.record.payload.chunks.len() {
            hash.update(self.chunk(&item, index).await?);
        }
        ensure!(
            hex::encode(hash.finalize()) == id,
            "Full content hash mismatch; not advertising this copy"
        );
        self.store
            .lock()
            .unwrap()
            .set(&format!("published:{id}"), &item.record)?;
        self.announce(item.record).await
    }
    async fn fetch_chunk(
        &self,
        provider: &EndpointAddr,
        id: &str,
        index: usize,
    ) -> Result<PeerResponse> {
        let chunk = PeerRequest::Chunk {
            id: id.to_owned(),
            index,
        };
        if self.direct_endpoint.is_none() {
            return self.request(provider.clone(), chunk).await;
        }
        self.direct_request(provider, PeerRequest::MediaRoute { id: id.into() }, chunk)
            .await
    }
    pub(crate) async fn direct_request(
        &self,
        provider: &EndpointAddr,
        lookup: PeerRequest,
        operation: PeerRequest,
    ) -> Result<PeerResponse> {
        let media = self
            .direct_endpoint
            .as_ref()
            .context("Direct peer connection unavailable")?;
        let cached = self
            .last_direct_route
            .lock()
            .unwrap()
            .as_ref()
            .filter(|(addr, at)| addr.id == provider.id && at.elapsed() < Duration::from_secs(45))
            .map(|(addr, _)| addr.clone());
        if let Some(address) = cached {
            if let Ok(response) = self.request_on(media, address, operation.clone()).await {
                return Ok(response);
            }
        }
        match self.request(provider.clone(), lookup).await? {
            PeerResponse::MediaRoute { address } => {
                ensure!(
                    address.id == provider.id
                        && !address.addrs.is_empty()
                        && address.addrs.len() <= 12
                        && address.addrs.iter().all(|a| a.is_ip()),
                    "Invalid direct peer address"
                );
                let response = self
                    .request_on(media, address.clone(), operation)
                    .await
                    .context("Cannot reach this peer directly")?;
                *self.last_direct_route.lock().unwrap() =
                    Some((address, std::time::Instant::now()));
                Ok(response)
            }
            PeerResponse::Error { message } => bail!(message),
            _ => bail!("Peer does not support direct transfers"),
        }
    }
    pub async fn request(
        &self,
        address: EndpointAddr,
        request: PeerRequest,
    ) -> Result<PeerResponse> {
        let address = match &self.relay {
            Some(url) => EndpointAddr::new(address.id).with_relay_url(url.clone()),
            None => address,
        };
        self.request_on(&self.endpoint, address, request).await
    }
    async fn request_on(
        &self,
        transport: &Endpoint,
        address: EndpointAddr,
        request: PeerRequest,
    ) -> Result<PeerResponse> {
        if !matches!(request, PeerRequest::Moderation { .. }) {
            self.require_active()?;
        }
        tokio::time::timeout(Duration::from_secs(15), async {
            let connection = transport.connect(address, ALPN).await?;
            let (mut send, mut recv) = connection.open_bi().await?;
            send.write_all(&serde_json::to_vec(&PeerEnvelope {
                address: self.routing_address(),
                request,
            })?)
            .await?;
            send.finish()?;
            let bytes = recv.read_to_end(MAX_FRAME).await?;
            let response = serde_json::from_slice(&bytes)?;
            // Keep the connection alive until QUIC acknowledges the response read.
            connection.close(0u32.into(), b"complete");
            Ok::<_, anyhow::Error>(response)
        })
        .await
        .context("Peer request timed out")?
    }
    async fn accept(self: Arc<Self>, endpoint: Endpoint, direct_only: bool) {
        while let Some(incoming) = endpoint.accept().await {
            let Ok(permit) = self.slots.clone().try_acquire_owned() else {
                incoming.refuse();
                continue;
            };
            let node = self.clone();
            tokio::spawn(async move {
                let _permit = permit;
                let served = tokio::time::timeout(Duration::from_secs(20), async {
                    let connection = incoming.await?;
                    let peer = connection.remote_id().to_string();
                    let (mut send, mut recv) = connection.accept_bi().await?;
                    let bytes = recv.read_to_end(96 * 1024).await?;
                    let result = async {
                        let envelope: PeerEnvelope = serde_json::from_slice(&bytes)?;
                        ensure!(
                            envelope.address.id.to_string() == peer
                                && envelope.address.addrs.len() <= 12,
                            "Peer address does not match authenticated identity"
                        );
                        if node.direct_endpoint.is_some() {
                            enforce_transport(&envelope.request, direct_only)?;
                        }
                        // Room history already authenticates both ends of this connection and
                        // checks membership. Dialing back here can stall a relayed rendezvous.
                        if !matches!(
                            envelope.request,
                            PeerRequest::Ping
                                | PeerRequest::Moderation { .. }
                                | PeerRequest::HistoryPermission { .. }
                                | PeerRequest::HistoryRoute { .. }
                                | PeerRequest::HistoryPage { .. }
                        ) {
                            ensure!(
                                matches!(
                                    node.request(envelope.address.clone(), PeerRequest::Ping)
                                        .await?,
                                    PeerResponse::Ready
                                ),
                                "Peer must expose an active hosting endpoint"
                            );
                        }
                        let joined = match &envelope.request {
                            PeerRequest::Join { room, .. } => Some(room.clone()),
                            _ => None,
                        };
                        let response = node.handle_peer(&peer, envelope.request).await?;
                        if let Some(room) = joined {
                            node.store
                                .lock()
                                .unwrap()
                                .set(&format!("history-peer:{room}:{peer}"), &envelope.address)?;
                        }
                        Ok(response)
                    }
                    .await;
                    let response = result.unwrap_or_else(|e| PeerResponse::Error {
                        message: e.to_string(),
                    });
                    send.write_all(&serde_json::to_vec(&response)?).await?;
                    send.finish()?;
                    let _ = send.stopped().await;
                    Ok::<_, anyhow::Error>(())
                })
                .await;
                match served {
                    Ok(Ok(())) => {}
                    Ok(Err(error)) => eprintln!("Peer request failed: {error}"),
                    Err(_) => eprintln!("Peer service deadline exceeded"),
                }
            });
        }
    }
    async fn handle_peer(&self, peer: &str, request: PeerRequest) -> Result<PeerResponse> {
        if let PeerRequest::Moderation { request } = request {
            return Ok(PeerResponse::Moderation {
                result: self.handle_room_command(peer, request)?,
            });
        }
        self.require_active()?;
        if matches!(request, PeerRequest::Join { .. } | PeerRequest::Send { .. }) {
            ensure!(
                !self
                    .preferences()?
                    .blocked_contacts
                    .iter()
                    .any(|id| id == peer),
                "Contact blocked by this recipient"
            );
        }
        if matches!(request, PeerRequest::Chunk { .. }) {
            self.registry_policy(false).await?;
        }
        match request {
            PeerRequest::Moderation { .. } => unreachable!("handled above"),
            PeerRequest::PostRoute { id } => {
                self.readable_post(&id).await?;
                Ok(PeerResponse::MediaRoute {
                    address: self
                        .direct_endpoint
                        .as_ref()
                        .context("Already direct")?
                        .addr(),
                })
            }
            PeerRequest::PublicPost { id } => {
                let record = self.readable_post(&id).await?;
                let bytes = serde_json::to_vec(&record)?.len() as u64;
                let store = self.store.lock().unwrap();
                let (_, settings, mut counters, reason) = Self::participation_state(&store)?;
                ensure!(
                    reason == "Hosting enabled"
                        && counters.uploaded + bytes <= settings.upload_mb * 1024 * 1024,
                    "Upload budget reached"
                );
                counters.uploaded += bytes;
                store.set("counters", &counters)?;
                Ok(PeerResponse::PublicPost { record })
            }
            PeerRequest::MediaRoute { id } => {
                ensure!(valid_id(&id), "Invalid media ID");
                let media = self
                    .direct_endpoint
                    .as_ref()
                    .context("Direct media is unavailable")?;
                let record: Signed<Record> = self
                    .store
                    .lock()
                    .unwrap()
                    .get(&format!("media:{id}"))?
                    .context("Unknown media")?;
                ensure!(
                    self.hosting_allowed(&id, &record.author)?,
                    "Hosting is disabled for this item"
                );
                self.public_allowed(&record).await?;
                Ok(PeerResponse::MediaRoute {
                    address: media.addr(),
                })
            }
            PeerRequest::HistoryRoute { room } => {
                self.permission_to_share(&room, peer).await?;
                Ok(PeerResponse::MediaRoute {
                    address: self
                        .direct_endpoint
                        .as_ref()
                        .context("Direct transport already in use")?
                        .addr(),
                })
            }
            PeerRequest::HistoryPermission { room, known } => {
                let permission = self.issue_history_permission(&room, peer)?;
                if known.as_ref() == Some(&permission.signature) {
                    Ok(PeerResponse::PermissionCurrent)
                } else {
                    Ok(PeerResponse::HistoryPermission { permission })
                }
            }
            PeerRequest::HistoryPage {
                room,
                before,
                known,
            } => Ok(PeerResponse::HistoryPage {
                page: self
                    .serve_history(&room, peer, before, known.as_deref())
                    .await?,
            }),
            PeerRequest::Ping => Ok(PeerResponse::Ready),
            PeerRequest::Chunk { id, index } => {
                let store = self.store.lock().unwrap();
                let record: Signed<Record> = store
                    .get(&format!("media:{id}"))?
                    .context("Unknown media")?;
                ensure!(
                    store
                        .get::<bool>(&format!("hosting:{id}"))?
                        .unwrap_or(record.author == self.endpoint.id().to_string()),
                    "This device has not approved seeding this item"
                );
                let policy: Signed<moderation::RegistryPolicy> = store
                    .get("moderation:registry-policy")?
                    .context("Registry safety policy unavailable")?;
                policy.payload.permits(&id, &record.author)?;
                policy
                    .payload
                    .permits("", &self.endpoint.id().to_string())?;
                self.serve_chunk(&store, &record, index)
            }
            PeerRequest::PrivateRoute { handle } => {
                self.authorized_share(&handle, peer)?;
                Ok(PeerResponse::MediaRoute {
                    address: self
                        .direct_endpoint
                        .as_ref()
                        .context("Direct peer connection unavailable")?
                        .addr(),
                })
            }
            PeerRequest::PrivateManifest { handle } => {
                let share = self.authorized_share(&handle, peer)?;
                Ok(PeerResponse::Manifest {
                    record: share.record,
                    nonce: share.nonce,
                })
            }
            PeerRequest::PrivateChunk { handle, index } => {
                let record = self.authorized_share(&handle, peer)?.record;
                self.serve_chunk(&self.store.lock().unwrap(), &record, index)
            }
            PeerRequest::Join { room, secret } => {
                let store = self.store.lock().unwrap();
                let mut r: Room = store
                    .get(&format!("room:{room}"))?
                    .context("Room unavailable")?;
                ensure!(r.owner.id == self.endpoint.id(), "Join through room owner");
                ensure!(
                    !r.private || (!secret.is_empty() && secret == r.invite),
                    "Invitation not accepted"
                );
                ensure!(
                    !r.banned.iter().any(|id| id == peer),
                    "Removed from this room; an old invitation cannot restore membership"
                );
                moderation::permits(&store, &format!("room-{room}"), "", peer)?;
                ensure!(
                    r.members.len() < 64 && r.pending.len() < 64,
                    "Prototype group is full"
                );
                if !r.members.iter().any(|m| m == peer) {
                    if r.review_new_members {
                        if !r.pending.iter().any(|id| id == peer) {
                            r.pending.push(peer.into());
                        }
                    } else {
                        r.members.push(peer.into());
                    }
                    store.set(&format!("room:{room}"), &r)?;
                    self.membership_changed.notify_one();
                }
                r.invite.clear();
                r.banned.clear();
                r.past_members.clear();
                r.pending.retain(|id| id == peer);
                if !r.members.iter().any(|id| id == peer) {
                    r.members.clear();
                    r.moderators.clear();
                }
                Ok(PeerResponse::Room { room: r })
            }
            PeerRequest::Messages { room, after } => {
                self.authorize_room(peer, &room)?;
                Ok(PeerResponse::Messages {
                    messages: { self.room_visible_messages(&room, after)? },
                })
            }
            PeerRequest::Send { message } => {
                message.verify()?;
                message.payload.validate()?;
                ensure!(
                    message.author == peer,
                    "Sender does not match transport identity"
                );
                self.authorize_room(peer, &message.payload.room)?;
                let store = self.store.lock().unwrap();
                let room: Room = store
                    .get(&format!("room:{}", message.payload.room))?
                    .context("Room unavailable")?;
                let key = format!("last-message:{}:{peer}", room.id);
                let last = store.get::<u64>(&key)?.unwrap_or(0);
                ensure!(
                    room.slow_seconds == 0
                        || room.owner.id.to_string() == peer
                        || room.moderators.iter().any(|id| id == peer)
                        || last + room.slow_seconds <= now(),
                    "Slow mode: wait before sending another message"
                );
                store.set(&key, &now())?;
                drop(store);
                self.insert_message(&message)?;
                Ok(PeerResponse::Sent)
            }
        }
    }
    fn serve_chunk(
        &self,
        store: &Store,
        record: &Signed<Record>,
        index: usize,
    ) -> Result<PeerResponse> {
        ensure!(index < record.payload.chunks.len(), "Unknown chunk");
        let bytes = std::fs::read(self.chunk_path(&record.payload.id, index)?)?;
        ensure!(
            digest(&bytes) == record.payload.chunks[index],
            "Corrupt chunk"
        );
        let mut counters = store.get::<Counters>("counters")?.unwrap_or_default();
        let settings = store
            .get::<Participation>("participation")?
            .unwrap_or_default();
        ensure!(
            counters.uploaded + bytes.len() as u64 <= settings.upload_mb * 1024 * 1024,
            "Upload budget reached"
        );
        counters.uploaded += bytes.len() as u64;
        store.set("counters", &counters)?;
        Ok(PeerResponse::Chunk {
            bytes: STANDARD.encode(bytes),
        })
    }
    pub(crate) fn authorize_room(&self, peer: &str, id: &str) -> Result<()> {
        ensure!(valid_id(id), "Invalid room ID");
        let room: Room = self
            .store
            .lock()
            .unwrap()
            .get(&format!("room:{id}"))?
            .context("Room unavailable")?;
        ensure!(room.owner.id == self.endpoint.id(), "Room owner required");
        ensure!(
            !room.banned.iter().any(|id| id == peer),
            "You were removed from this room. Open Room settings for the decision and appeal."
        );
        ensure!(
            !room.pending.iter().any(|id| id == peer),
            "Your request is waiting for a room moderator. Messages unlock after approval."
        );
        ensure!(
            room.members.iter().any(|m| m == peer),
            "You are not a member of this room. Notices and appeals remain available in Room settings."
        );
        moderation::permits(&self.store.lock().unwrap(), &format!("room-{id}"), "", peer)?;
        Ok(())
    }
    pub(crate) fn insert_message(&self, message: &Signed<Message>) -> Result<()> {
        let room = self.joined_room(&message.payload.room)?;
        self.write_history(&room, &[(message, None)])
    }
    pub(crate) fn messages_local(&self, room: &str, after: u64) -> Result<Vec<Signed<Message>>> {
        let store = self.store.lock().unwrap();
        let mut q=store.db.prepare("SELECT data FROM messages WHERE room=?1 AND sequence>?2 ORDER BY sequence DESC LIMIT 200")?;
        let mut values = q
            .query_map(params![room, i64::try_from(after)?], |r| {
                r.get::<_, String>(0)
            })?
            .map(|r| Ok(serde_json::from_str(&r?)?))
            .collect::<Result<Vec<_>>>()?;
        values.reverse();
        Ok(values)
    }
    pub async fn create_room(&self, title: String, private: bool) -> Result<Room> {
        self.require_active()?;
        text(&title, 160)?;
        let id = digest(uuid::Uuid::new_v4().as_bytes());
        let room = Room {
            id: id.clone(),
            title: title.clone(),
            private,
            owner: self.routing_address(),
            members: vec![self.endpoint.id().to_string()],
            invite: hex::encode(rand::random::<[u8; 32]>()),
            rules: moderation::RULES.into(),
            moderators: vec![],
            banned: vec![],
            past_members: vec![],
            pending: vec![],
            slow_seconds: 0,
            review_new_members: false,
            epoch: 0,
        };
        self.store
            .lock()
            .unwrap()
            .set(&format!("room:{id}"), &room)?;
        if !private {
            let name = self.snapshot()?.profile.context("Create account")?.name;
            let record = Signed::new(
                Record {
                    id: id.clone(),
                    kind: "room".into(),
                    title,
                    description: "A public community conversation".into(),
                    owner_name: name,
                    created: now(),
                    size: 0,
                    mime: String::new(),
                    chunks: vec![],
                    reply_to: None,
                },
                &self.key,
            )?;
            self.store
                .lock()
                .unwrap()
                .set(&format!("published:{id}"), &record)?;
            self.announce(record).await?;
        }
        Ok(room)
    }
    pub fn invitation(&self, id: &str) -> Result<String> {
        let mut room: Room = self
            .store
            .lock()
            .unwrap()
            .get(&format!("room:{id}"))?
            .context("Room unavailable")?;
        ensure!(
            room.owner.id == self.endpoint.id(),
            "Only the room owner can invite"
        );
        room.owner = self.routing_address();
        let invitation = Invitation {
            admission: self
                .relay
                .as_ref()
                .map(|_| crate::hub::admission(&self.key)),
            room: room.id,
            owner: room.owner,
            secret: room.invite,
        };
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        Ok(format!(
            "{}/#invite={}",
            self.registry,
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&invitation)?)
        ))
    }
    pub async fn join_link(&self, link: &str) -> Result<Room> {
        self.require_active()?;
        let invitation = if let Some((_, token)) = link.split_once("#invite=") {
            ensure!(token.len() < 8192, "Invitation too long");
            use base64::engine::general_purpose::URL_SAFE_NO_PAD;
            serde_json::from_slice::<Invitation>(&URL_SAFE_NO_PAD.decode(token)?)?
        } else {
            let id = link
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .context("Missing room ID")?;
            let item = self.lookup(id).await?;
            ensure!(item.record.payload.kind == "room", "Not a room link");
            let owner = item
                .providers
                .into_iter()
                .find(|p| p.id.to_string() == item.record.author)
                .context("Room owner is offline")?;
            Invitation {
                admission: None,
                room: id.into(),
                owner,
                secret: String::new(),
            }
        };
        ensure!(valid_id(&invitation.room), "Invalid invitation");
        if let Some(grant) = &invitation.admission {
            ensure!(
                grant.parent == invitation.owner.id.to_string(),
                "Invitation issuer mismatch"
            );
        }
        self.register_relay(invitation.admission.as_ref()).await?;
        match self
            .request(
                invitation.owner.clone(),
                PeerRequest::Join {
                    room: invitation.room.clone(),
                    secret: invitation.secret,
                },
            )
            .await?
        {
            PeerResponse::Room { room } => {
                ensure!(
                    room.id == invitation.room && room.owner.id == invitation.owner.id,
                    "Room identity mismatch"
                );
                self.store
                    .lock()
                    .unwrap()
                    .set(&format!("room:{}", room.id), &room)?;
                // Joining succeeds against older owners too. A current owner also supplies
                // permission to read another member's copy if it goes offline after joining.
                if room.members.contains(&self.endpoint.id().to_string()) {
                    if let Err(error) = self.history_permission(&room).await {
                        eprintln!("Joined room; history permission awaits the owner: {error}");
                    }
                }
                Ok(room)
            }
            PeerResponse::Error { message } => bail!(message),
            _ => bail!("Invalid join response"),
        }
    }
    pub async fn sync_room(&self, id: &str) -> Result<Vec<Signed<Message>>> {
        let mut page = self.history_page(id, None, None, None).await?;
        let mut result = page.messages;
        while result.len() < 200 {
            let Some(before) = page.earlier else { break };
            page = self
                .history_page(id, Some(before), Some(&page.source), None)
                .await?;
            let mut older = page.messages;
            older.append(&mut result);
            result = older;
        }
        Ok(result.split_off(result.len().saturating_sub(200)))
    }
    fn room_visible_messages(&self, id: &str, after: u64) -> Result<Vec<Signed<Message>>> {
        let messages = self.messages_local(id, after)?;
        let restrictions =
            moderation::restrictions(&self.store.lock().unwrap(), &format!("room-{id}"))?;
        Ok(messages
            .into_iter()
            .filter(|m| {
                !restrictions
                    .iter()
                    .any(|r| r.active() && r.kind == "message" && r.target == m.payload.id)
            })
            .collect())
    }
    pub async fn send_message(&self, id: &str, body: String) -> Result<()> {
        self.require_active()?;
        text(&body, 4000)?;
        let room: Room = self
            .store
            .lock()
            .unwrap()
            .get(&format!("room:{id}"))?
            .context("Join this room first")?;
        let message = Signed::new(
            Message {
                id: digest(uuid::Uuid::new_v4().as_bytes()),
                room: id.into(),
                name: self.snapshot()?.profile.context("Create account")?.name,
                body,
                created: now(),
            },
            &self.key,
        )?;
        if room.owner.id != self.endpoint.id() {
            match self
                .request(
                    room.owner,
                    PeerRequest::Send {
                        message: message.clone(),
                    },
                )
                .await?
            {
                PeerResponse::Sent => {}
                PeerResponse::Error { message } => bail!(message),
                _ => bail!("No delivery receipt"),
            }
        }
        self.insert_message(&message)
    }
}

// The control endpoint can move onto the relay at any point during a connection.
pub(crate) fn enforce_transport(request: &PeerRequest, direct_only: bool) -> Result<()> {
    let direct_required = matches!(
        request,
        PeerRequest::Chunk { .. }
            | PeerRequest::PublicPost { .. }
            | PeerRequest::PrivateChunk { .. }
            | PeerRequest::Messages { .. }
            | PeerRequest::HistoryPage { .. }
    );
    ensure!(
        direct_only == direct_required,
        "Media and chat history require a direct connection to a peer"
    );
    Ok(())
}
