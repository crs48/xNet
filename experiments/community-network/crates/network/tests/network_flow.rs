use anyhow::{Context, Result};
use community_network::{
    bridge::{Bridge, Command},
    model::*,
    peer::Node,
    registry,
};
use std::sync::Arc;
use tempfile::TempDir;

async fn member(root: &TempDir, name: &str, registry: &str) -> Result<Arc<Node>> {
    let node = Node::start(root.path().join(name), registry.into()).await?;
    node.create_profile(name.into())?;
    node.configure(Participation {
        enabled: true,
        storage_mb: 10,
        upload_mb: 10,
    })
    .await?;
    Ok(node)
}
fn video(root: &TempDir) -> Result<std::path::PathBuf> {
    let path = root.path().join("test.mp4");
    let mut bytes = vec![7u8; CHUNK * 2 + 301];
    bytes[4..8].copy_from_slice(b"ftyp");
    std::fs::write(&path, bytes)?;
    Ok(path)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn private_room_survives_owner_restart_on_same_network() -> Result<()> {
    let root = TempDir::new()?;
    let registry_url = "http://127.0.0.1:1";
    let owner = member(&root, "Owner", registry_url).await?;
    let guest = member(&root, "Guest", registry_url).await?;
    let room = owner.create_room("Restart check".into(), true).await?;
    guest.join_link(&owner.invitation(&room.id)?).await?;
    guest
        .send_message(&room.id, "Before restart".into())
        .await?;
    let sockets = owner.endpoint.bound_sockets();
    let identity = owner.endpoint.id();
    let weak = Arc::downgrade(&owner);
    owner.endpoint.close().await;
    drop(owner);
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while weak.upgrade().is_some() {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await?;
    let restarted = Node::start(root.path().join("Owner"), registry_url.into()).await?;
    assert_eq!(restarted.endpoint.id(), identity);
    assert_eq!(restarted.endpoint.bound_sockets(), sockets);
    assert_eq!(guest.sync_room(&room.id).await?.len(), 1);
    guest.send_message(&room.id, "After restart".into()).await?;
    assert_eq!(restarted.sync_room(&room.id).await?.len(), 2);
    guest.endpoint.close().await;
    restarted.endpoint.close().await;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn three_peers_media_chat_and_security_boundaries() -> Result<()> {
    let root = TempDir::new()?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let registry_url = format!("http://{}", listener.local_addr()?);
    let router = registry::router(&root.path().join("registry.sqlite"))?;
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let alice = member(&root, "Alice", &registry_url).await?;
    let bob = member(&root, "Bob", &registry_url).await?;
    let charlie = member(&root, "Charlie", &registry_url).await?;
    let published = alice
        .publish_file(
            &video(&root)?,
            "A peer film".into(),
            "No central video storage".into(),
        )
        .await?;
    let id = published.payload.id.clone();
    assert_eq!(bob.catalog("peer film").await?.len(), 1);
    bob.retain(&id).await.context("Bob retains the original")?;
    assert_eq!(bob.snapshot()?.counters.downloaded, published.payload.size);
    assert!(alice.snapshot()?.counters.uploaded >= published.payload.size);
    assert_eq!(bob.lookup(&id).await?.providers.len(), 2);

    let public = alice.create_room("Public garden".into(), false).await?;
    let joined = bob
        .join_link(&format!("{registry_url}/room/{}", public.id))
        .await?;
    assert_eq!(joined.id, public.id);
    bob.send_message(&public.id, "Hello from the second peer".into())
        .await?;
    assert_eq!(
        alice.sync_room(&public.id).await?[0].payload.body,
        "Hello from the second peer"
    );
    alice
        .send_message(&public.id, "Received over Iroh".into())
        .await?;
    assert_eq!(bob.sync_room(&public.id).await?.len(), 2);

    let private = alice.create_room("Secret garden".into(), true).await?;
    let invitation = alice.invitation(&private.id)?;
    assert!(!serde_json::to_string(&bob.catalog("").await?)?.contains("Secret garden"));
    assert!(matches!(
        charlie
            .request(
                alice.endpoint.addr(),
                PeerRequest::Messages {
                    room: private.id.clone(),
                    after: 0
                }
            )
            .await?,
        PeerResponse::Error { .. }
    ));
    assert!(matches!(
        charlie
            .request(
                alice.endpoint.addr(),
                PeerRequest::Join {
                    room: private.id.clone(),
                    secret: "wrong".into()
                }
            )
            .await?,
        PeerResponse::Error { .. }
    ));
    bob.join_link(&invitation).await?;
    bob.send_message(&private.id, "Only invited identities can read this".into())
        .await?;
    assert_eq!(alice.sync_room(&private.id).await?.len(), 1);
    assert!(
        bob.snapshot()?
            .rooms
            .iter()
            .find(|r| r.id == private.id)
            .unwrap()
            .invite
            .is_empty(),
        "Joining must not reveal the owner's invitation secret"
    );
    let forged = Signed::new(
        Message {
            id: digest(b"forged"),
            room: public.id.clone(),
            name: "Alice".into(),
            body: "forged sender".into(),
            created: now(),
        },
        &alice.key,
    )?;
    assert!(matches!(
        bob.request(alice.endpoint.addr(), PeerRequest::Send { message: forged })
            .await?,
        PeerResponse::Error { .. }
    ));

    let bridge = Bridge::start(bob.clone()).await?;
    let http = reqwest::Client::new();
    let control = format!("http://127.0.0.1:{}/control", bridge.info.port);
    assert_eq!(
        http.post(&control)
            .json(&serde_json::json!({"op":"snapshot"}))
            .send()
            .await?
            .status(),
        403
    );
    assert_eq!(
        http.post(&control)
            .bearer_auth(&bridge.info.token)
            .header("Origin", "https://untrusted.example")
            .json(&serde_json::json!({"op":"snapshot"}))
            .send()
            .await?
            .status(),
        403
    );
    let playback = bridge.execute(Command::Play { id: id.clone() }).await?;
    let url = playback["url"].as_str().unwrap();
    let response = http
        .get(url)
        .header("Range", "bytes=100-199")
        .send()
        .await?;
    assert_eq!(response.status(), 206);
    assert_eq!(response.bytes().await?.len(), 100);
    assert_eq!(
        http.get(url)
            .header("Range", "bytes=999999999-")
            .send()
            .await?
            .status(),
        416
    );
    assert_eq!(
        http.get(url.replace("ticket=", "ticket=wrong"))
            .send()
            .await?
            .status(),
        403
    );
    let mut tampered = published.clone();
    tampered.payload.title = "Forged title".into();
    let announcement = Signed::new(
        Announcement {
            record: tampered,
            address: bob.endpoint.addr(),
            expires: now() + 60,
        },
        &bob.key,
    )?;
    assert!(
        !http
            .post(format!("{registry_url}/api/announce"))
            .json(&announcement)
            .send()
            .await?
            .status()
            .is_success()
    );

    alice
        .configure(Participation {
            enabled: false,
            storage_mb: 10,
            upload_mb: 10,
        })
        .await?;
    charlie
        .retain(&id)
        .await
        .context("Charlie retains after Alice pauses")?;
    assert!(
        bob.snapshot()?.counters.uploaded >= published.payload.size,
        "Second peer did not actually seed"
    );
    assert_eq!(
        charlie.snapshot()?.counters.downloaded,
        published.payload.size
    );
    assert!(
        alice
            .chunk(
                &alice.media(&id).await.unwrap_or(CatalogItem {
                    record: published.clone(),
                    providers: vec![]
                }),
                0
            )
            .await
            .is_err()
    );
    bob.configure(Participation {
        enabled: false,
        storage_mb: 10,
        upload_mb: 10,
    })
    .await?;
    assert!(
        bridge
            .execute(Command::Play { id: id.clone() })
            .await
            .is_err()
    );
    assert!(
        bob.send_message(&public.id, "Should not send".into())
            .await
            .is_err()
    );

    // Corrupt cached data must never be served as a plausible successful read.
    charlie
        .configure(Participation {
            enabled: true,
            storage_mb: 10,
            upload_mb: 10,
        })
        .await?;
    std::fs::write(
        charlie.root.join("chunks").join(format!("{id}-0")),
        b"tampered",
    )?;
    assert!(charlie.chunk(&charlie.media(&id).await?, 0).await.is_err());
    for node in [&alice, &bob, &charlie] {
        node.endpoint.close().await;
    }
    server.abort();
    eprintln!(
        "Verified three real Iroh peers: publication, retention, origin-offline re-seeding, public/private chat, signatures, pause, range and bridge authorization."
    );
    Ok(())
}
