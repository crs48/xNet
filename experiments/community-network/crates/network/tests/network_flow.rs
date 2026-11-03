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
    let profile = root.path().join(name);
    community_network::store::private_dir(&profile)?;
    // These tests exercise independent peers on one machine. Use loopback explicitly,
    // rather than depending on whichever VPN/LAN interfaces this host advertises.
    let store = community_network::store::Store::open(&profile.join("state.sqlite"))?;
    store.set(
        "transport:sockets",
        &vec!["127.0.0.1:0".parse::<std::net::SocketAddr>()?],
    )?;
    drop(store);
    let node = Node::start(profile, registry.into()).await?;
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
async fn music_and_public_posts_across_three_peers() -> Result<()> {
    let root = TempDir::new()?;
    let database = root.path().join("registry.sqlite");
    // Start from the previous schema; opening again must not repeat ALTER TABLE.
    let old = rusqlite::Connection::open(&database)?;
    old.execute_batch("CREATE TABLE catalog(id TEXT PRIMARY KEY,author TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,kind TEXT NOT NULL,created INTEGER NOT NULL,data TEXT NOT NULL);")?;
    drop(old);
    drop(registry::router(&database)?);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let registry_url = format!("http://{}", listener.local_addr()?);
    let router = registry::router(&database)?;
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let alice = member(&root, "Alice", &registry_url).await?;
    let bob = member(&root, "Bob", &registry_url).await?;
    let charlie = member(&root, "Charlie", &registry_url).await?;
    let bridge = Bridge::start(bob.clone()).await?;
    let http = reqwest::Client::new();

    let path = root.path().join("song.wav");
    let mut bytes = vec![0u8; CHUNK + 44];
    bytes[..4].copy_from_slice(b"RIFF");
    bytes[8..12].copy_from_slice(b"WAVE");
    std::fs::write(&path, &bytes)?;
    let track = alice
        .publish_file(&path, "A shared song".into(), "Original recording".into())
        .await?;
    assert_eq!(track.payload.kind, "audio");
    assert_eq!(track.payload.mime, "audio/wav");
    let mp3 = root.path().join("song.mp3");
    std::fs::write(&mp3, b"ID3\x04\0\0\0\0\0\0test")?;
    assert_eq!(
        alice
            .publish_file(&mp3, "A mix".into(), String::new())
            .await?
            .payload
            .mime,
        "audio/mpeg"
    );
    let invalid = root.path().join("renamed.wav");
    std::fs::write(&invalid, b"<html>not audio</html>")?;
    assert!(
        alice
            .publish_file(&invalid, "Invalid".into(), String::new())
            .await
            .is_err()
    );

    let post = alice
        .publish_post("Who wants to make music together? 🎵".into(), None)
        .await?;
    let reply = bob
        .publish_post("Count me in.".into(), Some(post.payload.id.clone()))
        .await?;
    let roots = charlie
        .catalog_filtered("music", Some("post"), None)
        .await?;
    assert_eq!(roots.len(), 1);
    assert_eq!(roots[0].record.payload.id, post.payload.id);
    assert_eq!(
        charlie
            .catalog_filtered("", Some("audio"), None)
            .await?
            .len(),
        2
    );
    assert!(
        charlie
            .catalog_filtered("", Some("visual"), None)
            .await?
            .is_empty()
    );
    let thread = bridge
        .execute(Command::PostThread {
            id: post.payload.id.clone(),
        })
        .await?;
    assert_eq!(
        thread["replies"][0]["record"]["payload"]["id"],
        reply.payload.id
    );
    assert_eq!(
        thread["replies"][0]["record"]["author"],
        bob.key.public().to_string()
    );
    assert!(
        http.get(format!("{registry_url}/post/{}", post.payload.id))
            .send()
            .await?
            .status()
            .is_success()
    );
    let private = alice.create_room("Not public".into(), true).await?;
    for target in [&track.payload.id, &private.id, &digest(b"missing")] {
        assert!(
            alice
                .publish_post("Must not publish".into(), Some(target.clone()))
                .await
                .is_err()
        );
    }
    for body in [
        String::new(),
        "  ".into(),
        "a".repeat(281),
        "🪴".repeat(281),
        "bad\0text".into(),
    ] {
        assert!(alice.publish_post(body, None).await.is_err());
    }
    let unicode = alice.publish_post("🪴".repeat(280), None).await?;
    assert_eq!(unicode.payload.description.chars().count(), 280);
    assert!(
        bridge
            .execute(Command::Play {
                id: post.payload.id.clone()
            })
            .await
            .is_err()
    );
    assert!(bob.retain(&post.payload.id).await.is_err());

    // Registry validation must work even if a modified client bypasses desktop checks.
    for invalid_parent in [track.payload.id.clone(), private.id.clone()] {
        let mut record = post.payload.clone();
        record.id = digest(invalid_parent.as_bytes());
        record.reply_to = Some(invalid_parent);
        let announcement = Signed::new(
            Announcement {
                record: Signed::new(record, &alice.key)?,
                address: alice.endpoint.addr(),
                expires: now() + 60,
            },
            &alice.key,
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
    }
    let mut forged = post.clone();
    forged.payload.description = "Forged body".into();
    let announcement = Signed::new(
        Announcement {
            record: forged,
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

    bob.retain(&track.payload.id).await?;
    alice
        .configure(Participation {
            enabled: false,
            storage_mb: 10,
            upload_mb: 10,
        })
        .await?;
    assert!(alice.publish_post("Paused".into(), None).await.is_err());
    charlie.retain(&track.payload.id).await?;
    assert_eq!(charlie.snapshot()?.counters.downloaded, track.payload.size);
    assert!(bob.snapshot()?.counters.uploaded >= track.payload.size);
    let playback = bridge
        .execute(Command::Play {
            id: track.payload.id.clone(),
        })
        .await?;
    let response = http
        .get(playback["url"].as_str().unwrap())
        .header("Range", "bytes=0-43")
        .send()
        .await?;
    assert_eq!(response.status(), 206);
    assert_eq!(response.headers()["content-type"], "audio/wav");
    assert_eq!(response.bytes().await?.as_ref(), &bytes[..44]);
    // Public text persists independently of a publisher's current hosting lease.
    assert_eq!(
        charlie
            .lookup(&post.payload.id)
            .await?
            .record
            .payload
            .description,
        post.payload.description
    );
    let saved: String = rusqlite::Connection::open(&database)?.query_row(
        "SELECT data FROM catalog WHERE id=?",
        [&reply.payload.id],
        |r| r.get(0),
    )?;
    serde_json::from_str::<Signed<Record>>(&saved)?.verify()?;
    let local = community_network::store::Store::open(&alice.root.join("state.sqlite"))?;
    let saved: Signed<Record> = local
        .get(&format!("published:{}", post.payload.id))?
        .context("Local post missing")?;
    saved.verify()?;
    assert_eq!(saved.payload.description, post.payload.description);
    for node in [&alice, &bob, &charlie] {
        node.endpoint.close().await;
    }
    server.abort();
    Ok(())
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
