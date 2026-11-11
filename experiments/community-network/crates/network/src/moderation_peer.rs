use crate::{model::*, moderation::*, peer::Node};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum RoomAction {
    Info,
    Cases {
        #[serde(default)]
        offset: usize,
    },
    Report {
        report: ReportInput,
    },
    Review {
        case_id: String,
        decision: String,
        reason: String,
        rule: String,
        seconds: Option<u64>,
    },
    Appeal {
        case_id: String,
        reason: String,
    },
    Settings {
        rules: String,
        slow_seconds: u64,
        review_new_members: bool,
    },
    Member {
        member: String,
        role: String,
        reason: String,
    },
    RotateInvite,
    Leave,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RoomRequest {
    pub room: String,
    pub nonce: String,
    pub created: u64,
    pub command: RoomAction,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModerationView {
    pub preferences: Preferences,
    pub registry: RegistryPolicy,
    pub reports: CaseList,
}
impl Node {
    pub fn preferences(&self) -> Result<Preferences> {
        Ok(self
            .store
            .lock()
            .unwrap()
            .get("moderation:preferences")?
            .unwrap_or_default())
    }
    pub fn set_preferences(&self, preferences: Preferences) -> Result<()> {
        preferences.validate()?;
        self.store
            .lock()
            .unwrap()
            .set("moderation:preferences", &preferences)
    }
    pub async fn registry_policy(&self, force: bool) -> Result<RegistryPolicy> {
        let _guard = self.policy_refresh.lock().await;
        let cached: Option<Signed<RegistryPolicy>> = self
            .store
            .lock()
            .unwrap()
            .get("moderation:registry-policy")?;
        if let Some(cached) = &cached {
            cached.verify()?;
            if !force && cached.payload.generated + 5 > now() && cached.payload.expires > now() {
                return Ok(cached.payload.clone());
            }
        }
        let response = self
            .client
            .get(format!("{}/api/moderation/policy", self.registry))
            .send()
            .await?
            .error_for_status()?;
        ensure!(
            response
                .content_length()
                .is_none_or(|n| n <= 2 * 1024 * 1024),
            "Policy response too large"
        );
        let bytes = bounded_response(response, 2 * 1024 * 1024).await?;
        let signed: Signed<RegistryPolicy> = serde_json::from_slice(&bytes)?;
        signed.verify()?;
        ensure!(
            signed.author == signed.payload.registry_id
                && signed.payload.generated <= now() + 30
                && signed.payload.expires > now()
                && signed.payload.expires <= signed.payload.generated + POLICY_LEASE,
            "Invalid registry policy lease"
        );
        ensure!(
            signed.payload.restrictions.len() <= 1000 && signed.payload.moderators.len() <= 16,
            "Policy exceeds prototype bounds"
        );
        let store = self.store.lock().unwrap();
        if let Some(key) = store.get::<String>("moderation:registry-key")? {
            ensure!(
                key == signed.author,
                "Registry authority changed; refusing to trust a replacement automatically"
            );
        }
        store.set("moderation:registry-key", &signed.author)?;
        store.set("moderation:registry-policy", &signed)?;
        Ok(signed.payload)
    }
    pub async fn registry_command(&self, command: CaseAction) -> Result<serde_json::Value> {
        // Safety controls remain available while bandwidth contribution is paused.
        let policy = self.registry_policy(false).await?;
        let request = Signed::new(
            RegistryRequest {
                registry_id: policy.registry_id,
                nonce: digest(uuid::Uuid::new_v4().as_bytes()),
                created: now(),
                command,
            },
            &self.key,
        )?;
        let response = self
            .client
            .post(format!("{}/api/moderation", self.registry))
            .json(&request)
            .send()
            .await?;
        let ok = response.status().is_success();
        let result: serde_json::Value =
            serde_json::from_slice(&bounded_response(response, 8 * 1024 * 1024).await?)?;
        ensure!(
            ok,
            "{}",
            result
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Moderation request failed")
        );
        self.registry_policy(true).await.context(
            "Action was accepted, but policy refresh failed. Check case history before retrying",
        )?;
        Ok(result)
    }
    pub async fn moderation_view(&self) -> Result<ModerationView> {
        let registry = self.registry_policy(true).await?;
        let reports = serde_json::from_value(
            self.registry_command(CaseAction::List { offset: 0 })
                .await?,
        )?;
        Ok(ModerationView {
            preferences: self.preferences()?,
            registry,
            reports,
        })
    }
    pub async fn public_allowed(&self, record: &Signed<Record>) -> Result<()> {
        self.registry_policy(false)
            .await?
            .permits(&record.payload.id, &record.author)
    }
    pub fn hosting_allowed(&self, id: &str, author: &str) -> Result<bool> {
        ensure!(valid_id(id), "Invalid content ID");
        let store = self.store.lock().unwrap();
        // Legacy own publications were explicitly published and hosted. Playback caches were not.
        Ok(store
            .get::<bool>(&format!("hosting:{id}"))?
            .unwrap_or(author == self.endpoint.id().to_string()))
    }
    pub async fn set_hosting(&self, id: &str, allowed: bool) -> Result<()> {
        ensure!(valid_id(id), "Invalid content ID");
        self.store
            .lock()
            .unwrap()
            .set(&format!("hosting:{id}"), &allowed)?;
        if allowed {
            self.retain(id).await?;
        } else {
            self.store
                .lock()
                .unwrap()
                .db
                .execute("DELETE FROM kv WHERE key=?", [format!("published:{id}")])?;
            // Local refusal is already effective, even if the registry is unavailable.
            self.registry_command(CaseAction::Withdraw { id: id.into() }).await.context("Sharing stopped locally; registry withdrawal is pending its availability (leases expire within three minutes)")?;
        }
        Ok(())
    }
    pub fn room_any(&self, id: &str) -> Result<Room> {
        ensure!(valid_id(id), "Invalid room ID");
        let store = self.store.lock().unwrap();
        store
            .get(&format!("room:{id}"))?
            .or(store.get(&format!("departed-room:{id}"))?)
            .context("Unknown room")
    }
    pub async fn room_command(&self, id: &str, command: RoomAction) -> Result<serde_json::Value> {
        let room = self.room_any(id)?;
        let request = Signed::new(
            RoomRequest {
                room: id.into(),
                nonce: digest(uuid::Uuid::new_v4().as_bytes()),
                created: now(),
                command,
            },
            &self.key,
        )?;
        if room.owner.id == self.endpoint.id() {
            return self.handle_room_command(&self.endpoint.id().to_string(), request);
        }
        match self
            .request(room.owner, PeerRequest::Moderation { request })
            .await?
        {
            PeerResponse::Moderation { result } => Ok(result),
            PeerResponse::Error { message } => anyhow::bail!(message),
            _ => anyhow::bail!("Unexpected room moderation response"),
        }
    }
    pub fn handle_room_command(
        &self,
        actor: &str,
        request: Signed<RoomRequest>,
    ) -> Result<serde_json::Value> {
        request.verify()?;
        ensure!(
            request.author == actor && valid_id(&request.payload.room),
            "Wrong room request identity"
        );
        let store = self.store.lock().unwrap();
        validate_request(&store, &request.payload.nonce, request.payload.created)?;
        let id = &request.payload.room;
        let scope = format!("room-{id}");
        let mut room: Room = store
            .get(&format!("room:{id}"))?
            .context("Room unavailable")?;
        ensure!(
            room.owner.id == self.endpoint.id(),
            "Only the room host executes room actions"
        );
        let owner = actor == room.owner.id.to_string();
        let moderator = owner || room.moderators.iter().any(|id| id == actor);
        let known = room
            .members
            .iter()
            .chain(&room.banned)
            .chain(&room.pending)
            .chain(&room.past_members)
            .any(|id| id == actor);
        ensure!(
            known || owner,
            "This room is not accessible to your identity"
        );
        let tx = store.db.unchecked_transaction()?;
        let result = match request.payload.command {
            RoomAction::Info => {
                let mut visible = room.clone();
                visible.invite.clear();
                if !moderator {
                    visible.banned.clear();
                    visible.past_members.clear();
                    visible.pending.retain(|id| id == actor);
                }
                if !room.members.iter().any(|id| id == actor) {
                    visible.members.clear();
                    visible.moderators.clear();
                }
                serde_json::to_value(visible)?
            }
            RoomAction::Cases { offset } => {
                serde_json::to_value(list_cases(&store, &scope, actor, moderator, offset)?)?
            }
            RoomAction::Report { report } => {
                ensure!(
                    report.subject.room.as_deref() == Some(id) && report.subject.kind == "message",
                    "Report belongs to another space"
                );
                // Evidence must match the host's stored signed message, not just a fabricated ID.
                for message in &report.evidence {
                    let raw: String = store.db.query_row(
                        "SELECT data FROM messages WHERE id=? AND room=?",
                        [&message.payload.id, id],
                        |r| r.get(0),
                    )?;
                    ensure!(
                        serde_json::from_str::<Signed<Message>>(&raw)?.signature
                            == message.signature,
                        "Message evidence does not match"
                    );
                }
                serde_json::to_value(submit_report(&store, &scope, actor, report)?)?
            }
            RoomAction::Review {
                case_id,
                decision,
                reason,
                rule,
                seconds,
            } => {
                ensure!(moderator, "Room moderator required");
                let case: Case = store
                    .secret_get(&format!("case:{scope}:{case_id}"))?
                    .context("Case not found")?;
                ensure!(
                    decision != "restrict_author"
                        || (case.report.subject.author != room.owner.id.to_string()
                            && (owner || !room.moderators.contains(&case.report.subject.author))),
                    "Only the owner can restrict a moderator; the owner cannot be removed"
                );
                if decision == "restore"
                    && case.report.subject.kind == "record"
                    && case.report.subject.room.as_deref() == Some(id)
                {
                    ensure!(
                        room.members.len() < 64
                            || room.members.contains(&case.report.subject.author),
                        "Room full; free a place before restoring membership"
                    );
                    room.banned.retain(|id| id != &case.report.subject.author);
                    if !room.members.contains(&case.report.subject.author) {
                        room.members.push(case.report.subject.author.clone());
                    }
                    room.epoch += 1;
                }
                serde_json::to_value(review_case(
                    &store, &scope, actor, &case_id, &decision, reason, rule, seconds,
                )?)?
            }
            RoomAction::Appeal { case_id, reason } => {
                appeal_case(&store, &scope, actor, &case_id, reason)?;
                serde_json::json!({"accepted":true})
            }
            RoomAction::Settings {
                rules,
                slow_seconds,
                review_new_members,
            } => {
                ensure!(moderator, "Room moderator required");
                text(&rules, 2000)?;
                ensure!(slow_seconds <= 3600, "Slow mode must be one hour or less");
                room.rules = rules;
                room.slow_seconds = slow_seconds;
                room.review_new_members = review_new_members;
                serde_json::json!({"saved":true})
            }
            RoomAction::Member {
                member,
                role,
                reason,
            } => {
                text(&reason, 500)?;
                ensure!(
                    moderator && valid_id(&member) && member != room.owner.id.to_string(),
                    "Only moderators can manage other members"
                );
                ensure!(
                    owner || !room.moderators.contains(&member),
                    "Only the owner can change another moderator"
                );
                match role.as_str() {
                    "moderator" => {
                        ensure!(
                            owner && room.members.contains(&member),
                            "Only the owner can promote a member"
                        );
                        if !room.moderators.contains(&member) {
                            room.moderators.push(member);
                        }
                    }
                    "member" => {
                        ensure!(owner, "Only the owner can change roles");
                        room.moderators.retain(|id| id != &member);
                    }
                    "admit" => {
                        ensure!(
                            room.pending.contains(&member) && room.members.len() < 64,
                            "No pending request or room full"
                        );
                        room.pending.retain(|id| id != &member);
                        room.members.push(member);
                    }
                    "remove" => {
                        let report = ReportInput {
                            subject: Subject {
                                kind: "record".into(),
                                id: digest(format!("membership:{id}:{member}").as_bytes()),
                                author: member.clone(),
                                title: "Room membership".into(),
                                room: Some(id.clone()),
                            },
                            category: "community".into(),
                            details: reason.clone(),
                            evidence: vec![],
                        };
                        let case = submit_operator_case(&store, &scope, actor, report)?;
                        review_case(
                            &store,
                            &scope,
                            actor,
                            &case.id,
                            "restrict_author",
                            reason.clone(),
                            "Room membership".into(),
                            None,
                        )?;
                        ensure!(
                            room.members.contains(&member) || room.pending.contains(&member),
                            "Member not found"
                        );
                        room.members.retain(|id| id != &member);
                        room.pending.retain(|id| id != &member);
                        room.moderators.retain(|id| id != &member);
                        if !room.banned.contains(&member) {
                            room.banned.push(member);
                        }
                        room.invite = hex::encode(rand::random::<[u8; 32]>());
                    }
                    "unban" => anyhow::bail!("Review the membership case and restore access there"),
                    _ => anyhow::bail!("Invalid membership action"),
                }
                room.epoch += 1;
                serde_json::json!({"saved":true})
            }
            RoomAction::RotateInvite => {
                ensure!(moderator, "Room moderator required");
                room.invite = hex::encode(rand::random::<[u8; 32]>());
                room.epoch += 1;
                serde_json::json!({"rotated":true})
            }
            RoomAction::Leave => {
                ensure!(!owner, "The host cannot leave its own room");
                if !room.past_members.iter().any(|id| id == actor) {
                    room.past_members.push(actor.into());
                }
                room.members.retain(|id| id != actor);
                room.pending.retain(|id| id != actor);
                room.moderators.retain(|id| id != actor);
                room.epoch += 1;
                serde_json::json!({"left":true})
            }
        };
        ensure!(
            room.banned.len() <= 500 && room.pending.len() <= 64 && room.past_members.len() <= 500,
            "Room membership limit reached"
        );
        store.set(&format!("room:{id}"), &room)?;
        self.membership_changed.notify_one();
        remember_request(&store, &request.payload.nonce)?;
        tx.commit()?;
        Ok(result)
    }
    pub async fn leave_room(&self, id: &str) -> Result<serde_json::Value> {
        let room = self.room_any(id)?;
        ensure!(
            room.owner.id != self.endpoint.id(),
            "The host cannot leave its own room"
        );
        {
            let store = self.store.lock().unwrap();
            store.set(&format!("departed-room:{id}"), &room)?;
            store
                .db
                .execute("DELETE FROM kv WHERE key=?", [format!("room:{id}")])?;
        }
        let result = self.room_command(id, RoomAction::Leave).await;
        Ok(
            serde_json::json!({"left":true,"host_notified":result.is_ok(),"notice": result.err().map(|e|format!("Left on this device. Host could not be notified: {e}"))}),
        )
    }
    pub async fn report_record(
        &self,
        id: &str,
        category: String,
        details: String,
    ) -> Result<serde_json::Value> {
        // The registry resolves the authoritative subject; no client-supplied author is trusted.
        let report = ReportInput {
            subject: Subject {
                kind: "record".into(),
                id: id.into(),
                author: self.endpoint.id().to_string(),
                title: "Public content".into(),
                room: None,
            },
            category,
            details,
            evidence: vec![],
        };
        self.registry_command(CaseAction::Report { report }).await
    }
    pub fn report_preview(
        &self,
        room_id: &str,
        target: &str,
        selected: Vec<String>,
        category: String,
        details: String,
    ) -> Result<ReportInput> {
        let room = self.room_any(room_id)?;
        ensure!(
            selected.len() <= 5 && selected.iter().any(|id| id == target),
            "Select the reported message and up to four context messages"
        );
        let messages = self.messages_local(room_id, 0)?;
        let evidence: Vec<_> = messages
            .into_iter()
            .filter(|message| selected.contains(&message.payload.id))
            .collect();
        ensure!(
            evidence.len() == selected.len(),
            "Selected evidence is missing or duplicated"
        );
        let subject = evidence
            .iter()
            .find(|message| message.payload.id == target)
            .context("Message unavailable")?;
        let report = ReportInput {
            subject: Subject {
                kind: "message".into(),
                id: target.into(),
                author: subject.author.clone(),
                title: format!("Message in {}", room.title)
                    .chars()
                    .take(180)
                    .collect(),
                room: Some(room_id.into()),
            },
            category,
            details,
            evidence,
        };
        report.validate()?;
        Ok(report)
    }
}

async fn bounded_response(mut response: reqwest::Response, limit: usize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        ensure!(
            bytes.len() + chunk.len() <= limit,
            "Moderation response exceeds its size limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
