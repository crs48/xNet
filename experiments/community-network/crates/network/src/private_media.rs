//! The tracker knows a short lease and reader commitments. The seeder owns the
//! manifest, room membership and chunks, and rechecks membership on every read.
use crate::{model::*, peer::Node};
use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use iroh::EndpointAddr;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Serialize, Deserialize)]
pub struct Share {
    pub nonce: String,
    pub room: String,
    pub record: Signed<Record>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrivateLease {
    pub nonce: String,
    pub route: EndpointAddr,
    pub expires: u64,
    pub readers: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lookup {
    pub private_handle: String,
    pub registry: String,
    pub at: u64,
}
pub fn handle(owner: &str, nonce: &str) -> String {
    digest(format!("xnet/private-file/1/{owner}/{nonce}").as_bytes())
}
pub fn reader(handle: &str, id: &str) -> String {
    digest(format!("xnet/private-reader/1/{handle}/{id}").as_bytes())
}
impl Node {
    pub async fn share_private(
        &self,
        path: &Path,
        title: String,
        description: String,
        room_id: &str,
    ) -> Result<String> {
        ensure!(
            self.direct_endpoint.is_some(),
            "Private files require the hosted hub"
        );
        let room: Room = self
            .store
            .lock()
            .unwrap()
            .get(&format!("room:{room_id}"))?
            .context("Unknown room")?;
        ensure!(
            room.private && room.owner.id == self.endpoint.id(),
            "Choose a private room you host"
        );
        self.register_relay(None).await?;
        let record = self.prepare_file(path, title, description)?;
        let nonce = hex::encode(rand::random::<[u8; 32]>());
        let id = handle(&self.endpoint.id().to_string(), &nonce);
        let share = Share {
            nonce,
            room: room.id,
            record,
        };
        self.store
            .lock()
            .unwrap()
            .set(&format!("private-share:{id}"), &share)?;
        self.announce_private(&share).await?;
        Ok(format!("{}/private/{id}", self.registry))
    }
    pub(crate) async fn announce_private(&self, share: &Share) -> Result<()> {
        let room: Room = self
            .store
            .lock()
            .unwrap()
            .get(&format!("room:{}", share.room))?
            .context("Unknown private room")?;
        ensure!(
            room.private && room.owner.id == self.endpoint.id(),
            "Private file owner changed"
        );
        let id = handle(&self.endpoint.id().to_string(), &share.nonce);
        let readers = room
            .members
            .iter()
            .filter(|p| !room.banned.contains(p) && !room.pending.contains(p))
            .map(|p| reader(&id, p))
            .collect();
        self.client
            .post(format!("{}/api/private/announce", self.registry))
            .json(&Signed::new(
                PrivateLease {
                    nonce: share.nonce.clone(),
                    route: self.routing_address(),
                    expires: now() + 180,
                    readers,
                },
                &self.key,
            )?)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
    pub(crate) fn authorized_share(&self, id: &str, peer: &str) -> Result<Share> {
        ensure!(valid_id(id), "Invalid private link");
        let share: Share = self
            .store
            .lock()
            .unwrap()
            .get(&format!("private-share:{id}"))?
            .context("Private file unavailable")?;
        self.authorize_room(peer, &share.room)?;
        Ok(share)
    }
    pub async fn open_private(&self, id: &str) -> Result<CatalogItem> {
        self.require_active()?;
        ensure!(
            valid_id(id) && self.direct_endpoint.is_some(),
            "Invalid private file link"
        );
        let response = self
            .client
            .post(format!("{}/api/private/resolve", self.registry))
            .json(&Signed::new(
                Lookup {
                    private_handle: id.to_owned(),
                    registry: self.registry.clone(),
                    at: now(),
                },
                &self.key,
            )?)
            .send()
            .await?;
        let address: EndpointAddr = response
            .error_for_status()
            .context("Private file unavailable to this device, or the seeder is offline")?
            .json()
            .await?;
        let record = if address.id == self.endpoint.id() {
            self.authorized_share(id, &address.id.to_string())?.record
        } else {
            match self
                .request(
                    address.clone(),
                    PeerRequest::PrivateManifest { handle: id.into() },
                )
                .await?
            {
                PeerResponse::Manifest { record, nonce } => {
                    ensure!(
                        valid_id(&nonce) && handle(&address.id.to_string(), &nonce) == id,
                        "Private link does not belong to this seeder"
                    );
                    record
                }
                PeerResponse::Error { message } => bail!(message),
                _ => bail!("Missing private manifest"),
            }
        };
        record.verify()?;
        record.payload.validate()?;
        ensure!(
            record.author == address.id.to_string() && !record.payload.chunks.is_empty(),
            "Invalid private manifest"
        );
        ensure!(
            !self.preferences()?.hides(&record),
            "Hidden by your personal filters"
        );
        Ok(CatalogItem {
            record,
            providers: vec![address],
        })
    }
    pub(crate) async fn private_chunk(
        &self,
        id: &str,
        item: &CatalogItem,
        index: usize,
    ) -> Result<Vec<u8>> {
        self.require_active()?;
        let owner = item.providers.first().context("No private seeder")?;
        let expected = item
            .record
            .payload
            .chunks
            .get(index)
            .context("Invalid chunk")?;
        let bytes = if owner.id == self.endpoint.id() {
            self.authorized_share(id, &owner.id.to_string())?;
            std::fs::read(self.chunk_path(&item.record.payload.id, index)?)?
        } else {
            match self
                .direct_request(
                    owner,
                    PeerRequest::PrivateRoute { handle: id.into() },
                    PeerRequest::PrivateChunk {
                        handle: id.into(),
                        index,
                    },
                )
                .await?
            {
                PeerResponse::Chunk { bytes } => STANDARD.decode(bytes)?,
                PeerResponse::Error { message } => bail!(message),
                _ => bail!("Missing private chunk"),
            }
        };
        ensure!(
            digest(&bytes) == *expected,
            "Private chunk failed verification"
        );
        Ok(bytes)
    }
}
