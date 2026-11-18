use anyhow::{Context, Result};
use community_network::{
    bridge::{Bridge, Command},
    model::*,
    moderation::*,
    moderation_peer::RoomAction,
    peer::Node,
    registry,
    store::{Store, read_key},
};
use std::sync::Arc;
use tempfile::TempDir;

async fn member(root: &TempDir, name: &str, url: &str) -> Result<Arc<Node>> {
    let path = root.path().join(name);
    community_network::store::private_dir(&path)?;
    let store = Store::open(&path.join("state.sqlite"))?;
    store.set(
        "transport:sockets",
        &vec!["127.0.0.1:0".parse::<std::net::SocketAddr>()?],
    )?;
    drop(store);
    let node = Node::start(path, url.into()).await?;
    node.create_profile(name.into())?;
    node.configure(Participation {
        enabled: true,
        storage_mb: 10,
        upload_mb: 10,
    })
    .await?;
    Ok(node)
}
async fn setup(root: &TempDir) -> Result<(String, tokio::task::JoinHandle<()>)> {
    community_network::store::private_dir(&root.path().join("Moderator"))?;
    let key = read_key(&root.path().join("Moderator/identity.key"))?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let url = format!("http://{}", listener.local_addr()?);
    let router = registry::router_with_moderators(
        &root.path().join("registry.sqlite"),
        vec![key.public().to_string()],
    )?;
    Ok((
        url,
        tokio::spawn(async move { axum::serve(listener, router).await.unwrap() }),
    ))
}
fn review(id: &str, action: &str) -> CaseAction {
    CaseAction::Review {
        case_id: id.into(),
        decision: action.into(),
        reason: "A documented test decision".into(),
        rule: "Community rules".into(),
        seconds: None,
    }
}
fn room_review(id: &str, action: &str) -> RoomAction {
    RoomAction::Review {
        case_id: id.into(),
        decision: action.into(),
        reason: "Room review test".into(),
        rule: "Room rules".into(),
        seconds: None,
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn registry_decisions_reach_cached_media_and_appeals_survive_pause() -> Result<()> {
    let root = TempDir::new()?;
    let (url, server) = setup(&root).await?;
    let moderator = member(&root, "Moderator", &url).await?;
    let author = member(&root, "Author", &url).await?;
    let reporter = member(&root, "Reporter", &url).await?;
    let file = root.path().join("clip.mp4");
    let mut bytes = vec![9; CHUNK + 35];
    bytes[4..8].copy_from_slice(b"ftyp");
    std::fs::write(&file, bytes)?;
    let record = author
        .publish_file(&file, "Example clip".into(), "A test clip".into())
        .await?;
    let id = &record.payload.id;
    let item = reporter.lookup(id).await?;
    // Merely playing every chunk does not consent to hosting it.
    for index in 0..record.payload.chunks.len() {
        reporter.chunk(&item, index).await?;
    }
    assert!(!reporter.hosting_allowed(id, &record.author)?);
    assert!(matches!(
        author
            .request(
                reporter.endpoint.addr(),
                PeerRequest::Chunk {
                    id: id.clone(),
                    index: 0
                }
            )
            .await?,
        PeerResponse::Error { .. }
    ));
    reporter.retain(id).await?;
    assert!(matches!(
        author
            .request(
                reporter.endpoint.addr(),
                PeerRequest::Chunk {
                    id: id.clone(),
                    index: 0
                }
            )
            .await?,
        PeerResponse::Chunk { .. }
    ));
    reporter.set_hosting(id, false).await?;
    assert!(matches!(
        author
            .request(
                reporter.endpoint.addr(),
                PeerRequest::Chunk {
                    id: id.clone(),
                    index: 0
                }
            )
            .await?,
        PeerResponse::Error { .. }
    ));
    assert_eq!(author.lookup(id).await?.providers.len(), 1);
    let bridge = Bridge::start(reporter.clone()).await?;
    let playback = bridge.execute(Command::Play { id: id.clone() }).await?;
    let ticket = playback["url"].as_str().context("playback URL")?;
    assert!(reqwest::get(ticket).await?.status().is_success());
    let result = reporter
        .report_record(id, "privacy".into(), "Please review this test item".into())
        .await?;
    let case: Case = serde_json::from_value(result)?;
    assert!(
        reporter
            .registry_command(review(&case.id, "remove"))
            .await
            .is_err()
    );
    assert!(moderator.moderation_view().await?.reports.can_review);
    moderator
        .registry_command(review(&case.id, "remove"))
        .await?;
    assert!(
        !reqwest::get(format!("{url}/api/items/{id}"))
            .await?
            .status()
            .is_success()
    );
    reporter.registry_policy(true).await?;
    author.registry_policy(true).await?;
    assert!(reporter.media(id).await.is_err());
    assert!(!reqwest::get(ticket).await?.status().is_success());
    assert!(matches!(
        reporter
            .request(
                author.endpoint.addr(),
                PeerRequest::Chunk {
                    id: id.clone(),
                    index: 0
                }
            )
            .await?,
        PeerResponse::Error { .. }
    ));
    assert!(author.announce(record.clone()).await.is_err());
    let notice = author.moderation_view().await?.reports;
    assert!(notice.cases.is_empty());
    assert_eq!(notice.notices.len(), 1);
    assert!(!serde_json::to_string(&notice)?.contains("Please review this test item"));
    author
        .configure(Participation {
            enabled: false,
            storage_mb: 10,
            upload_mb: 10,
        })
        .await?;
    author
        .registry_command(CaseAction::Appeal {
            case_id: case.id.clone(),
            reason: "Please reconsider".into(),
        })
        .await?;
    moderator
        .registry_command(review(&case.id, "restore"))
        .await?;
    reporter.registry_policy(true).await?;
    assert!(reporter.media(id).await.is_ok());
    let restored = author.moderation_view().await?.reports;
    assert_eq!(restored.notices[0].decisions.len(), 2);
    assert_eq!(restored.notices[0].appeals.len(), 1);
    let prefs = Preferences {
        hidden: vec![id.clone()],
        ..Default::default()
    };
    reporter.set_preferences(prefs)?;
    assert!(reporter.lookup(id).await.is_err());
    assert!(moderator.lookup(id).await.is_ok());
    let reopened = Store::open(&root.path().join("Reporter/state.sqlite"))?;
    assert_eq!(
        reopened
            .get::<Preferences>("moderation:preferences")?
            .unwrap()
            .hidden,
        vec![id.clone()]
    );
    let store = Store::open(&root.path().join("registry.sqlite"))?;
    let raw: String = store.db.query_row(
        "SELECT data FROM kv WHERE key=?",
        [format!("case:registry:{}", case.id)],
        |r| r.get(0),
    )?;
    assert!(!raw.contains("Please review"));
    assert_eq!(
        list_cases(
            &store,
            "registry",
            &author.endpoint.id().to_string(),
            false,
            0
        )?
        .notices[0]
            .decisions
            .len(),
        2
    );
    // Signed requests are bound to one registry and cannot be replayed.
    let key = read_key(&root.path().join("Reporter/identity.key"))?;
    let policy = reporter.registry_policy(true).await?;
    let request = Signed::new(
        RegistryRequest {
            registry_id: policy.registry_id.clone(),
            nonce: digest(b"one-shot"),
            created: now(),
            command: CaseAction::List { offset: 0 },
        },
        &key,
    )?;
    let http = reqwest::Client::new();
    let endpoint = format!("{url}/api/moderation");
    assert!(
        http.post(&endpoint)
            .json(&request)
            .send()
            .await?
            .status()
            .is_success()
    );
    assert!(
        !http
            .post(&endpoint)
            .json(&request)
            .send()
            .await?
            .status()
            .is_success()
    );
    let wrong = Signed::new(
        RegistryRequest {
            registry_id: digest(b"another registry"),
            nonce: digest(b"wrong audience"),
            created: now(),
            command: CaseAction::List { offset: 0 },
        },
        &key,
    )?;
    assert!(
        !http
            .post(&endpoint)
            .json(&wrong)
            .send()
            .await?
            .status()
            .is_success()
    );
    let mut forged = request.clone();
    forged.author = moderator.endpoint.id().to_string();
    assert!(
        !http
            .post(&endpoint)
            .json(&forged)
            .send()
            .await?
            .status()
            .is_success()
    );
    reporter
        .store
        .lock()
        .unwrap()
        .set("moderation:registry-key", &digest(b"replacement authority"))?;
    assert!(reporter.registry_policy(true).await.is_err());
    reporter
        .store
        .lock()
        .unwrap()
        .set("moderation:registry-key", &policy.registry_id)?;
    reporter.set_preferences(Preferences::default())?;
    // Stale local policy is not treated as permission if the service disappears.
    let mut stale = policy.clone();
    stale.generated = now() - 120;
    stale.expires = now() - 60;
    let registry_key = read_key(&root.path().join("registry.authority.key"))?;
    reporter.store.lock().unwrap().set(
        "moderation:registry-policy",
        &Signed::new(stale, &registry_key)?,
    )?;
    server.abort();
    assert!(reporter.media(id).await.is_err());
    moderator.endpoint.close().await;
    author.endpoint.close().await;
    reporter.endpoint.close().await;
    server.abort();
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn private_room_controls_and_selective_disclosure() -> Result<()> {
    let root = TempDir::new()?;
    let (url, server) = setup(&root).await?;
    let host = member(&root, "Moderator", &url).await?;
    let guest = member(&root, "Guest", &url).await?;
    let newcomer = member(&root, "Newcomer", &url).await?;
    let room = host.create_room("A private workshop".into(), true).await?;
    let id = &room.id;
    let invite = host.invitation(id)?;
    guest.join_link(&invite).await?;
    assert!(
        guest
            .room_command(
                id,
                RoomAction::Settings {
                    rules: "My rules".into(),
                    slow_seconds: 0,
                    review_new_members: false
                }
            )
            .await
            .is_err()
    );
    host.room_command(
        id,
        RoomAction::Settings {
            rules: "Be considerate".into(),
            slow_seconds: 30,
            review_new_members: true,
        },
    )
    .await?;
    guest.send_message(id, "Selected evidence".into()).await?;
    let first = guest.sync_room(id).await?.remove(0);
    assert!(guest.send_message(id, "Too fast".into()).await.is_err());
    host.send_message(id, "UNSELECTED_PRIVATE_CONTEXT".into())
        .await?;
    guest.sync_room(id).await?;
    newcomer.join_link(&invite).await?;
    assert!(newcomer.sync_room(id).await.is_err());
    assert!(
        newcomer
            .send_message(id, "not admitted".into())
            .await
            .is_err()
    );
    host.room_command(
        id,
        RoomAction::Member {
            member: newcomer.endpoint.id().to_string(),
            role: "admit".into(),
            reason: "Known collaborator".into(),
        },
    )
    .await?;
    assert_eq!(newcomer.sync_room(id).await?.len(), 2);
    let bridge = Bridge::start(guest.clone()).await?;
    let preview = bridge
        .execute(Command::ReportPreview {
            room: id.clone(),
            target: first.payload.id.clone(),
            selected: vec![first.payload.id.clone()],
            category: "community".into(),
            details: "This is a selective disclosure test".into(),
            destination: "registry".into(),
        })
        .await?;
    assert_eq!(preview["report"]["evidence"].as_array().unwrap().len(), 1);
    assert!(!preview.to_string().contains("UNSELECTED_PRIVATE_CONTEXT"));
    assert!(
        bridge
            .execute(Command::ReportMessages {
                room: id.clone(),
                target: first.payload.id.clone(),
                selected: vec![first.payload.id.clone()],
                category: "community".into(),
                details: "Changed after consent".into(),
                destination: "registry".into(),
                confirmation: preview["confirmation"].as_str().unwrap().into()
            })
            .await
            .is_err()
    );
    bridge
        .execute(Command::ReportMessages {
            room: id.clone(),
            target: first.payload.id.clone(),
            selected: vec![first.payload.id.clone()],
            category: "community".into(),
            details: "This is a selective disclosure test".into(),
            destination: "registry".into(),
            confirmation: preview["confirmation"].as_str().unwrap().into(),
        })
        .await?;
    let reports = host.moderation_view().await?.reports;
    assert_eq!(reports.cases.len(), 1);
    assert!(!serde_json::to_string(&reports)?.contains("UNSELECTED_PRIVATE_CONTEXT"));
    assert!(
        host.registry_command(review(&reports.cases[0].id, "remove"))
            .await
            .is_err()
    );
    let report: ReportInput = serde_json::from_value(preview["report"].clone())?;
    assert!(
        bridge
            .execute(Command::RegistryAction {
                command: CaseAction::Report {
                    report: report.clone()
                }
            })
            .await
            .is_err()
    );
    let room_case: Case = serde_json::from_value(
        guest
            .room_command(id, RoomAction::Report { report })
            .await?,
    )?;
    host.room_command(id, room_review(&room_case.id, "remove"))
        .await?;
    assert!(
        !newcomer
            .sync_room(id)
            .await?
            .iter()
            .any(|m| m.payload.id == first.payload.id)
    );
    host.room_command(
        id,
        RoomAction::Member {
            member: guest.endpoint.id().to_string(),
            role: "remove".into(),
            reason: "Test membership decision".into(),
        },
    )
    .await?;
    assert!(guest.sync_room(id).await.is_err());
    assert!(guest.join_link(&invite).await.is_err());
    guest
        .configure(Participation {
            enabled: false,
            storage_mb: 10,
            upload_mb: 10,
        })
        .await?;
    assert!(
        bridge
            .execute(Command::SafetyHistory { room: id.clone() })
            .await?
            .as_array()
            .is_some_and(|v| !v.is_empty())
    );
    assert!(
        bridge
            .execute(Command::SafetyHistory {
                room: digest(b"unknown room")
            })
            .await
            .is_err()
    );
    let cases: CaseList = serde_json::from_value(
        guest
            .room_command(id, RoomAction::Cases { offset: 0 })
            .await?,
    )?;
    let membership = cases
        .notices
        .iter()
        .find(|n| n.subject.title == "Room membership")
        .context("membership notice")?;
    guest
        .room_command(
            id,
            RoomAction::Appeal {
                case_id: membership.id.clone(),
                reason: "Please restore my membership".into(),
            },
        )
        .await?;
    host.room_command(id, room_review(&membership.id, "restore"))
        .await?;
    guest
        .configure(Participation {
            enabled: true,
            storage_mb: 10,
            upload_mb: 10,
        })
        .await?;
    assert!(guest.sync_room(id).await.is_ok());
    host.room_command(id, RoomAction::RotateInvite).await?;
    let stranger = member(&root, "Stranger", &url).await?;
    assert!(stranger.join_link(&invite).await.is_err());
    // A known participant cannot review cases or promote itself, including across room scopes.
    assert!(
        guest
            .room_command(id, room_review(&room_case.id, "restore"))
            .await
            .is_err()
    );
    assert!(
        guest
            .room_command(
                id,
                RoomAction::Member {
                    member: guest.endpoint.id().to_string(),
                    role: "moderator".into(),
                    reason: "Self promotion".into()
                }
            )
            .await
            .is_err()
    );
    let other = host.create_room("Another room".into(), true).await?;
    assert!(
        host.room_command(&other.id, room_review(&room_case.id, "restore"))
            .await
            .is_err()
    );
    host.set_preferences(Preferences {
        blocked_contacts: vec![guest.endpoint.id().to_string()],
        ..Default::default()
    })?;
    assert!(
        guest
            .send_message(id, "Blocked contact".into())
            .await
            .is_err()
    );
    assert!(
        guest
            .room_command(id, RoomAction::Cases { offset: 0 })
            .await
            .is_ok()
    );
    guest.leave_room(id).await?;
    assert!(guest.snapshot()?.rooms.is_empty());
    assert!(
        guest
            .room_command(id, RoomAction::Cases { offset: 0 })
            .await
            .is_ok()
    );
    assert!(host.catalog("").await?.is_empty());
    host.endpoint.close().await;
    guest.endpoint.close().await;
    newcomer.endpoint.close().await;
    stranger.endpoint.close().await;
    server.abort();
    Ok(())
}

#[test]
fn evidence_encryption_expiry_and_independent_case_reversal() -> Result<()> {
    let root = TempDir::new()?;
    let store = Store::open(&root.path().join("state.sqlite"))?;
    let author = digest(b"author");
    let reporter = digest(b"reporter");
    let id = digest(b"record");
    let report = ReportInput {
        subject: Subject {
            kind: "record".into(),
            id: id.clone(),
            author: author.clone(),
            title: "Example".into(),
            room: None,
        },
        category: "privacy".into(),
        details: "PRIVATE_EVIDENCE".into(),
        evidence: vec![],
    };
    let a = submit_report(&store, "registry", &reporter, report.clone())?;
    let b = submit_report(&store, "registry", &digest(b"other reporter"), report)?;
    review_case(
        &store,
        "registry",
        &reporter,
        &a.id,
        "remove",
        "Reason".into(),
        "Rule".into(),
        None,
    )?;
    review_case(
        &store,
        "registry",
        &reporter,
        &b.id,
        "remove",
        "Reason".into(),
        "Rule".into(),
        None,
    )?;
    review_case(
        &store,
        "registry",
        &reporter,
        &a.id,
        "restore",
        "Reconsidered".into(),
        "Rule".into(),
        None,
    )?;
    assert!(permits(&store, "registry", &id, &author).is_err());
    let mut expired: Case = store
        .secret_get(&format!("case:registry:{}", a.id))?
        .unwrap();
    expired.evidence_expires = 0;
    store.secret_set(&format!("case:registry:{}", a.id), &expired)?;
    assert!(
        all_cases(&store, "registry")?
            .iter()
            .find(|c| c.id == a.id)
            .unwrap()
            .evidence_expired
    );
    assert!(
        !serde_json::to_string(
            &all_cases(&store, "registry")?
                .iter()
                .find(|c| c.id == a.id)
                .unwrap()
        )?
        .contains("PRIVATE_EVIDENCE")
    );
    let raw: String = store.db.query_row(
        "SELECT data FROM kv WHERE key=?",
        [format!("case:registry:{}", b.id)],
        |r| r.get(0),
    )?;
    store.db.execute(
        "INSERT INTO kv(key,data) VALUES(?1,?2)",
        rusqlite::params!["case:registry:tampered", raw],
    )?;
    assert!(
        store
            .secret_get::<Case>("case:registry:tampered")
            .unwrap_err()
            .to_string()
            .contains("Evidence authentication failed")
    );
    assert!(validate_request(&store, &digest(b"overflow"), u64::MAX).is_err());
    Ok(())
}
