use anyhow::{Context, Result, bail, ensure};
use iroh::{EndpointAddr, PublicKey, SecretKey, Signature};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

pub const CHUNK: usize = 256 * 1024;
pub const MAX_MEDIA: u64 = 100 * 1024 * 1024;
pub const ALPN: &[u8] = b"xnet/community-experiment/1";
pub const MAX_FRAME: usize = 2 * 1024 * 1024;

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_secs()
}
pub fn digest(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
pub fn valid_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
pub fn text(value: &str, max: usize) -> Result<()> {
    ensure!(
        !value.trim().is_empty() && value.len() <= max && !value.contains('\0'),
        "Invalid text length"
    );
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Signed<T> {
    pub author: String,
    pub payload: T,
    pub signature: String,
}
impl<T: Serialize + DeserializeOwned> Signed<T> {
    pub fn new(payload: T, key: &SecretKey) -> Result<Self> {
        let bytes = serde_json::to_vec(&payload)?;
        Ok(Self {
            author: key.public().to_string(),
            signature: hex::encode(key.sign(&bytes).to_bytes()),
            payload,
        })
    }
    pub fn verify(&self) -> Result<()> {
        let key: PublicKey = self.author.parse()?;
        let bytes: [u8; 64] = hex::decode(&self.signature)?
            .try_into()
            .map_err(|_| anyhow::anyhow!("Invalid signature length"))?;
        key.verify(
            &serde_json::to_vec(&self.payload)?,
            &Signature::from_bytes(&bytes),
        )?;
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Record {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub description: String,
    pub owner_name: String,
    pub created: u64,
    pub size: u64,
    pub mime: String,
    pub chunks: Vec<String>,
    // Omitting absent fields preserves signatures on existing media and room records.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
}
impl Record {
    pub fn validate(&self) -> Result<()> {
        ensure!(valid_id(&self.id), "Invalid record ID");
        text(&self.title, 160)?;
        text(&self.owner_name, 64)?;
        ensure!(
            self.description.len() <= 2000 && self.created <= now() + 120,
            "Invalid metadata"
        );
        match self.kind.as_str() {
            "video" | "image" | "audio" => {
                ensure!(
                    self.size > 0 && self.size <= MAX_MEDIA,
                    "Media limit is 100 MB"
                );
                ensure!(
                    matches!(
                        (self.kind.as_str(), self.mime.as_str()),
                        ("video", "video/mp4" | "video/webm")
                            | ("image", "image/png" | "image/jpeg" | "image/webp")
                            | ("audio", "audio/mpeg" | "audio/wav")
                    ),
                    "Unsupported media format"
                );
                ensure!(
                    self.chunks.len() == self.size.div_ceil(CHUNK as u64) as usize
                        && self.chunks.iter().all(|c| valid_id(c)),
                    "Invalid chunk manifest"
                );
            }
            "room" => ensure!(
                self.size == 0 && self.chunks.is_empty() && self.mime.is_empty(),
                "Invalid room record"
            ),
            "post" => {
                text(&self.description, 1120)?;
                ensure!(
                    self.description.chars().count() <= 280,
                    "Posts are limited to 280 characters"
                );
                ensure!(
                    self.size == 0 && self.chunks.is_empty() && self.mime.is_empty(),
                    "Invalid post record"
                );
                ensure!(
                    self.reply_to
                        .as_ref()
                        .is_none_or(|id| valid_id(id) && id != &self.id),
                    "Invalid reply target"
                );
            }
            _ => bail!("Unknown record kind"),
        }
        ensure!(
            self.kind == "post" || self.reply_to.is_none(),
            "Only public posts can be replies"
        );
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Announcement {
    pub record: Signed<Record>,
    pub address: EndpointAddr,
    pub expires: u64,
}
pub fn verify_announcement(value: &Signed<Announcement>) -> Result<()> {
    value.verify()?;
    value.payload.record.verify()?;
    value.payload.record.payload.validate()?;
    ensure!(
        value.author == value.payload.address.id.to_string(),
        "Provider identity mismatch"
    );
    ensure!(
        value.payload.expires > now() && value.payload.expires <= now() + 3600,
        "Expired provider or excessive lease"
    );
    ensure!(
        value.payload.address.addrs.len() <= 12,
        "Too many provider addresses"
    );
    Ok(())
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogItem {
    pub record: Signed<Record>,
    pub providers: Vec<EndpointAddr>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Participation {
    pub enabled: bool,
    pub storage_mb: u64,
    pub upload_mb: u64,
}
impl Default for Participation {
    fn default() -> Self {
        Self {
            enabled: false,
            storage_mb: 1024,
            upload_mb: 1024,
        }
    }
}
impl Participation {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.storage_mb > 0
                && self.storage_mb <= 100_000
                && self.upload_mb > 0
                && self.upload_mb <= 1_000_000,
            "Choose nonzero limits within prototype bounds"
        );
        Ok(())
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Counters {
    pub uploaded: u64,
    pub downloaded: u64,
    pub stored: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Room {
    pub id: String,
    pub title: String,
    pub private: bool,
    pub owner: EndpointAddr,
    pub members: Vec<String>,
    pub invite: String,
    #[serde(default = "default_room_rules")]
    pub rules: String,
    #[serde(default)]
    pub moderators: Vec<String>,
    #[serde(default)]
    pub banned: Vec<String>,
    #[serde(default)]
    pub past_members: Vec<String>,
    #[serde(default)]
    pub pending: Vec<String>,
    #[serde(default)]
    pub slow_seconds: u64,
    #[serde(default)]
    pub review_new_members: bool,
    #[serde(default)]
    pub epoch: u64,
}
fn default_room_rules() -> String {
    crate::moderation::RULES.into()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RelayAdmission {
    pub parent: String,
    pub nonce: String,
    pub expires: u64,
    #[serde(rename = "maxUses")]
    pub max_uses: u8,
    pub signature: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Invitation {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub admission: Option<RelayAdmission>,
    pub room: String,
    pub owner: EndpointAddr,
    pub secret: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub room: String,
    pub name: String,
    pub body: String,
    pub created: u64,
}
impl Message {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            valid_id(&self.id) && valid_id(&self.room),
            "Invalid message ID"
        );
        text(&self.name, 64)?;
        text(&self.body, 4000)?;
        ensure!(self.created <= now() + 120, "Invalid message time");
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum PeerRequest {
    PrivateManifest {
        handle: String,
    },
    PrivateRoute {
        handle: String,
    },
    PrivateChunk {
        handle: String,
        index: usize,
    },
    Ping,
    MediaRoute {
        id: String,
    },
    Moderation {
        request: Signed<crate::moderation_peer::RoomRequest>,
    },
    Chunk {
        id: String,
        index: usize,
    },
    Join {
        room: String,
        secret: String,
    },
    Messages {
        room: String,
        after: u64,
    },
    Send {
        message: Signed<Message>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PeerEnvelope {
    pub address: EndpointAddr,
    pub request: PeerRequest,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PeerResponse {
    Manifest {
        record: Signed<Record>,
        nonce: String,
    },
    Ready,
    MediaRoute {
        address: EndpointAddr,
    },
    Moderation {
        result: serde_json::Value,
    },
    Chunk {
        bytes: String,
    },
    Room {
        room: Room,
    },
    Messages {
        messages: Vec<Signed<Message>>,
    },
    Sent,
    Error {
        message: String,
    },
}

/// A single RFC 9110 byte range. Unsupported/malformed ranges fail closed.
pub fn byte_range(header: Option<&str>, length: u64) -> Result<(u64, u64, bool)> {
    ensure!(length > 0, "Empty media");
    let Some(header) = header else {
        return Ok((0, length - 1, false));
    };
    let parts = header
        .strip_prefix("bytes=")
        .context("Invalid range unit")?;
    ensure!(!parts.contains(','), "Multiple ranges unsupported");
    let (a, b) = parts.split_once('-').context("Invalid range")?;
    let (start, end) = if a.is_empty() {
        let suffix = b.parse::<u64>()?;
        ensure!(suffix > 0, "Empty suffix");
        (length.saturating_sub(suffix), length - 1)
    } else {
        (
            a.parse()?,
            if b.is_empty() {
                length - 1
            } else {
                b.parse::<u64>()?.min(length - 1)
            },
        )
    };
    ensure!(start < length && start <= end, "Unsatisfiable range");
    Ok((start, end, true))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn existing_records_keep_their_signed_bytes() {
        // This is the exact pre-replies field order, signed before deserializing the new type.
        let legacy = format!(
            r#"{{"id":"{}","kind":"room","title":"Garden","description":"Public room","owner_name":"Maya","created":1,"size":0,"mime":"","chunks":[]}}"#,
            digest(b"legacy")
        );
        let key = SecretKey::generate();
        let record = Signed::<Record> {
            author: key.public().to_string(),
            signature: hex::encode(key.sign(legacy.as_bytes()).to_bytes()),
            payload: serde_json::from_str(&legacy).unwrap(),
        };
        record.payload.validate().unwrap();
        record.verify().unwrap();
        assert_eq!(serde_json::to_string(&record.payload).unwrap(), legacy);
    }
    #[test]
    fn range_boundaries() {
        assert_eq!(byte_range(Some("bytes=2-4"), 10).unwrap(), (2, 4, true));
        assert_eq!(byte_range(Some("bytes=-3"), 10).unwrap(), (7, 9, true));
        assert_eq!(byte_range(Some("bytes=3-99"), 10).unwrap(), (3, 9, true));
        for bad in [
            "bytes=10-",
            "bytes=4-2",
            "bytes=-0",
            "bytes=0-1,3-4",
            "items=0-1",
        ] {
            assert!(byte_range(Some(bad), 10).is_err());
        }
    }
    #[test]
    fn signed_data_rejects_tampering() {
        let key = SecretKey::generate();
        let mut signed = Signed::new("hello".to_string(), &key).unwrap();
        signed.verify().unwrap();
        signed.payload = "changed".into();
        assert!(signed.verify().is_err());
    }
}
