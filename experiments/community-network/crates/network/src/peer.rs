use crate::{
    model::*,
    moderation::{self, Preferences},
    moderation_peer::RoomAction,
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
    pub key: SecretKey,
    pub root: PathBuf,
    pub store: Mutex<Store>,
    pub registry: String,
    pub client: reqwest::Client,
    slots: Arc<Semaphore>,
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
}
impl Node {
    pub async fn start(root: PathBuf, registry: String) -> Result<Arc<Self>> {
        private_dir(&root)?;
        let profile_lock = lock_profile(&root)?;
        private_dir(&root.join("chunks"))?;
        let key = read_key(&root.join("identity.key"))?;
        let store = Store::open(&root.join("state.sqlite"))?;
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
        let endpoint = builder
            .bind()
            .await
            .context("Unable to bind this profile's peer ports")?;
        // Keep existing invitations usable across restarts on the same network.
        store.set("transport:sockets", &endpoint.bound_sockets())?;
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
            key,
            root,
            store: Mutex::new(store),
            registry: registry.trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(10))
                .build()?,
            slots: Arc::new(Semaphore::new(16)),
            policy_refresh: tokio::sync::Mutex::new(()),
            _profile_lock: profile_lock,
        });
        {
            let store = node.store.lock().unwrap();
            for mut room in store.list::<Room>("room:")? {
                if room.owner.id == node.endpoint.id() {
                    room.owner = node.endpoint.addr();
                    store.set(&format!("room:{}", room.id), &room)?;
                }
            }
        }
        let acceptor = node.clone();
        tokio::spawn(async move {
            acceptor.accept().await;
        });
        let announcer = Arc::downgrade(&node);
        tokio::spawn(async move {
            let mut refresh = tokio::time::interval(Duration::from_secs(60));
            loop {
                refresh.tick().await;
                let Some(node) = announcer.upgrade() else {
                    break;
                };
                if node.require_active().is_ok() {
                    if let Err(e) = node.announce_all().await {
                        eprintln!("Registry refresh failed: {e}");
                    }
                }
            }
        });
        Ok(node)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let store = self
            .store
            .lock()
            .map_err(|_| anyhow::anyhow!("Local store lock failed"))?;
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
        let active = reason == "Hosting enabled";
        Ok(Snapshot {
            id: self.endpoint.id().to_string(),
            profile,
            participation,
            counters,
            active,
            reason,
            registry: self.registry.clone(),
            address: self.endpoint.addr(),
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
    pub fn require_active(&self) -> Result<()> {
        let s = self.snapshot()?;
        ensure!(
            s.active,
            "{} · resume contribution to use the network",
            s.reason
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
        self.store
            .lock()
            .unwrap()
            .set(&format!("catalog:{id}"), &item)?;
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
        let announcement = Signed::new(
            Announcement {
                record,
                address: self.endpoint.addr(),
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
    pub async fn announce_all(&self) -> Result<()> {
        let records: Vec<Signed<Record>> = self.store.lock().unwrap().list("published:")?;
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
    fn chunk_path(&self, id: &str, index: usize) -> Result<PathBuf> {
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
        let signed = Signed::new(record, &self.key)?;
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
    pub async fn media(&self, id: &str) -> Result<CatalogItem> {
        self.require_active()?;
        ensure!(valid_id(id), "Invalid content ID");
        let local = {
            let store = self.store.lock().unwrap();
            store.get::<CatalogItem>(&format!("catalog:{id}"))?.or(store
                .get::<Signed<Record>>(&format!("media:{id}"))?
                .map(|record| CatalogItem {
                    record,
                    providers: vec![self.endpoint.addr()],
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
            match self
                .request(
                    address.clone(),
                    PeerRequest::Chunk {
                        id: record.id.clone(),
                        index,
                    },
                )
                .await
            {
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
    pub async fn request(
        &self,
        address: EndpointAddr,
        request: PeerRequest,
    ) -> Result<PeerResponse> {
        if !matches!(request, PeerRequest::Moderation { .. }) {
            self.require_active()?;
        }
        tokio::time::timeout(Duration::from_secs(15), async {
            let connection = self.endpoint.connect(address, ALPN).await?;
            let (mut send, mut recv) = connection.open_bi().await?;
            send.write_all(&serde_json::to_vec(&PeerEnvelope {
                address: self.endpoint.addr(),
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
    async fn accept(self: Arc<Self>) {
        while let Some(incoming) = self.endpoint.accept().await {
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
                        if !matches!(
                            envelope.request,
                            PeerRequest::Ping | PeerRequest::Moderation { .. }
                        ) {
                            ensure!(
                                matches!(
                                    node.request(envelope.address, PeerRequest::Ping).await?,
                                    PeerResponse::Ready
                                ),
                                "Peer must expose an active hosting endpoint"
                            );
                        }
                        node.handle_peer(&peer, envelope.request).await
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
                ensure!(index < record.payload.chunks.len(), "Unknown chunk");
                let bytes = std::fs::read(self.chunk_path(&id, index)?)?;
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
                    messages: {
                        let _ = after;
                        self.room_visible_messages(&room)?
                    },
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
    fn authorize_room(&self, peer: &str, id: &str) -> Result<()> {
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
    fn insert_message(&self, message: &Signed<Message>) -> Result<()> {
        message.verify()?;
        message.payload.validate()?;
        let store = self.store.lock().unwrap();
        let existing: i64 = store.db.query_row(
            "SELECT count(*) FROM messages WHERE id=?",
            [&message.payload.id],
            |r| r.get(0),
        )?;
        if existing > 0 {
            return Ok(());
        }
        let count: i64 = store
            .db
            .query_row("SELECT count(*) FROM messages", [], |r| r.get(0))?;
        ensure!(count < 10000, "Prototype message storage limit reached");
        let seq: i64 = store.db.query_row(
            "SELECT coalesce(max(sequence),0)+1 FROM messages",
            [],
            |r| r.get(0),
        )?;
        store.db.execute(
            "INSERT OR IGNORE INTO messages VALUES(?1,?2,?3,?4)",
            params![
                message.payload.id,
                message.payload.room,
                seq,
                serde_json::to_string(message)?
            ],
        )?;
        Ok(())
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
            owner: self.endpoint.addr(),
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
        room.owner = self.endpoint.addr();
        let invitation = Invitation {
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
                room: id.into(),
                owner,
                secret: String::new(),
            }
        };
        ensure!(valid_id(&invitation.room), "Invalid invitation");
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
                Ok(room)
            }
            PeerResponse::Error { message } => bail!(message),
            _ => bail!("Invalid join response"),
        }
    }
    pub async fn sync_room(&self, id: &str) -> Result<Vec<Signed<Message>>> {
        self.require_active()?;
        let room: Room = self
            .store
            .lock()
            .unwrap()
            .get(&format!("room:{id}"))?
            .context("Join this room first")?;
        if room.owner.id != self.endpoint.id() {
            let latest: Room =
                serde_json::from_value(self.room_command(id, RoomAction::Info).await?)?;
            ensure!(
                latest.id == id && latest.owner.id == room.owner.id,
                "Room identity mismatch"
            );
            {
                let store = self.store.lock().unwrap();
                ensure!(
                    store.get::<Room>(&format!("room:{id}"))?.is_some(),
                    "You left this room"
                );
                store.set(&format!("room:{id}"), &latest)?;
            }
            match self
                .request(
                    room.owner,
                    PeerRequest::Messages {
                        room: id.into(),
                        after: 0,
                    },
                )
                .await?
            {
                PeerResponse::Messages { messages } => {
                    ensure!(messages.len() <= 200, "Too many messages");
                    let received = messages.clone();
                    for message in messages {
                        ensure!(message.payload.room == id, "Wrong room in response");
                        self.insert_message(&message)?;
                    }
                    let preferences = self.preferences()?;
                    return Ok(received
                        .into_iter()
                        .filter(|m| !preferences.hides_message(m))
                        .collect());
                }
                PeerResponse::Error { message } => bail!(message),
                _ => bail!("Invalid sync response"),
            }
        }
        let preferences = self.preferences()?;
        Ok(self
            .room_visible_messages(id)?
            .into_iter()
            .filter(|m| !preferences.hides_message(m))
            .collect())
    }
    fn room_visible_messages(&self, id: &str) -> Result<Vec<Signed<Message>>> {
        let messages = self.messages_local(id, 0)?;
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
