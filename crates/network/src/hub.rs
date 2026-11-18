use crate::{
    model::{RelayAdmission, now},
    peer::Node,
};
use anyhow::{Context, Result, ensure};
use iroh::{EndpointAddr, RelayUrl, SecretKey};

pub const COMMUNITY_HUB: &str = "https://iroh.xnet.fyi";

pub fn relay_url(registry: &str) -> Result<Option<RelayUrl>> {
    let configured = std::env::var("XNET_COMMUNITY_RELAY_URL").ok();
    if configured.as_deref() == Some("off") {
        return Ok(None);
    }
    let url = reqwest::Url::parse(configured.as_deref().unwrap_or(registry))?;
    // Local/LAN registries keep the original direct-only transport.
    if url.scheme() != "https" {
        ensure!(configured.is_none(), "Configure an HTTPS relay origin");
        return Ok(None);
    }
    ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none(),
        "Use the HTTPS origin of the hub"
    );
    Ok(Some(url.as_str().parse()?))
}

pub fn admission(key: &SecretKey) -> RelayAdmission {
    let parent = key.public().to_string();
    let nonce = hex::encode(rand::random::<[u8; 32]>());
    let expires = (now() + 23 * 3600) * 1000;
    let max_uses = 8;
    let proof = format!("xnet/relay-invite/2\n{parent}\n{nonce}\n{expires}\n{max_uses}");
    RelayAdmission {
        parent,
        nonce,
        expires,
        max_uses,
        signature: hex::encode(key.sign(proof.as_bytes()).to_bytes()),
    }
}

impl Node {
    pub(crate) fn routing_address(&self) -> EndpointAddr {
        match &self.relay {
            Some(url) => EndpointAddr::new(self.endpoint.id()).with_relay_url(url.clone()),
            None => self.endpoint.addr(),
        }
    }
    pub async fn register_relay(&self, grant: Option<&RelayAdmission>) -> Result<()> {
        let Some(relay) = &self.relay else {
            return Ok(());
        };
        if self.admitted.load(std::sync::atomic::Ordering::Relaxed) {
            return Ok(());
        }
        let endpoint = self.endpoint.id().to_string();
        let timestamp = now() * 1000;
        let proof = format!("xnet/relay-register/1\n{endpoint}\n{timestamp}");
        let signature = hex::encode(self.key.sign(proof.as_bytes()).to_bytes());
        self.client.post(format!("{}register",relay))
            .json(&serde_json::json!({ "endpoint":endpoint, "timestamp":timestamp, "signature":signature, "admission":grant }))
            .send().await?.error_for_status().context("This hub requires an invitation from an admitted device")?;
        self.admitted
            .store(true, std::sync::atomic::Ordering::Relaxed);
        Ok(())
    }
}
