//! Experimental, scoped moderation. Reports are allegations; only an authorized decision restricts.
use crate::{model::*, store::Store};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};

pub const RULES: &str = "Respect people's boundaries. No threats, targeted harassment, spam, or sharing private information without consent. Do not publish illegal abuse material or non-consensual intimate media. Disagreement and criticism are welcome. Reports are reviewed; report volume is not a vote. Restrictions apply to this service, and can be appealed.";
pub const POLICY_LEASE: u64 = 60;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Preferences {
    pub hidden: Vec<String>,
    pub muted_authors: Vec<String>,
    pub blocked_contacts: Vec<String>,
    pub topics: Vec<String>,
}
impl Preferences {
    pub fn validate(&self) -> Result<()> {
        for values in [&self.hidden, &self.muted_authors, &self.blocked_contacts] {
            ensure!(
                values.len() <= 500 && values.iter().all(|id| valid_id(id)),
                "Invalid personal filter"
            );
        }
        ensure!(self.topics.len() <= 50, "Choose up to 50 muted phrases");
        for topic in &self.topics {
            text(topic.trim(), 80)?;
        }
        Ok(())
    }
    pub fn hides(&self, record: &Signed<Record>) -> bool {
        self.hidden.contains(&record.payload.id)
            || self.muted_authors.contains(&record.author)
            || self.topics.iter().any(|topic| {
                format!("{} {}", record.payload.title, record.payload.description)
                    .to_lowercase()
                    .contains(&topic.trim().to_lowercase())
            })
    }
    pub fn hides_message(&self, message: &Signed<Message>) -> bool {
        self.hidden.contains(&message.payload.id)
            || self.muted_authors.contains(&message.author)
            || self.blocked_contacts.contains(&message.author)
            || self.topics.iter().any(|topic| {
                message
                    .payload
                    .body
                    .to_lowercase()
                    .contains(&topic.trim().to_lowercase())
            })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Subject {
    pub kind: String,
    pub id: String,
    pub author: String,
    pub title: String,
    pub room: Option<String>,
}
impl Subject {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            valid_id(&self.id) && valid_id(&self.author),
            "Invalid report subject"
        );
        ensure!(
            matches!(self.kind.as_str(), "record" | "message"),
            "Invalid subject kind"
        );
        text(&self.title, 200)?;
        ensure!(
            self.room.as_ref().is_none_or(|id| valid_id(id)),
            "Invalid room"
        );
        ensure!(
            self.kind != "message" || self.room.is_some(),
            "Message reports need a room"
        );
        Ok(())
    }
    pub fn record(record: &Signed<Record>) -> Self {
        Self {
            kind: "record".into(),
            id: record.payload.id.clone(),
            author: record.author.clone(),
            title: record.payload.title.clone(),
            room: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportInput {
    pub subject: Subject,
    pub category: String,
    pub details: String,
    pub evidence: Vec<Signed<Message>>,
}
impl ReportInput {
    pub fn validate(&self) -> Result<()> {
        self.subject.validate()?;
        ensure!(
            serde_json::to_vec(self)?.len() <= 64 * 1024,
            "Selected evidence exceeds the 64 KB disclosure limit"
        );
        ensure!(
            ["harassment", "privacy", "spam", "safety", "community"]
                .contains(&self.category.as_str()),
            "Choose a report reason"
        );
        text(&self.details, 1000)?;
        ensure!(self.evidence.len() <= 5, "Select up to five messages");
        for message in &self.evidence {
            message.verify()?;
            message.payload.validate()?;
            ensure!(
                Some(&message.payload.room) == self.subject.room.as_ref(),
                "Evidence belongs to a different room"
            );
        }
        if self.subject.kind == "message" {
            ensure!(
                self.evidence
                    .iter()
                    .any(|m| m.payload.id == self.subject.id && m.author == self.subject.author),
                "Include the message being reported"
            );
        } else {
            ensure!(
                self.evidence.is_empty(),
                "Public record reports cannot attach private history"
            );
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Decision {
    pub id: String,
    pub action: String,
    pub reason: String,
    pub rule: String,
    pub actor: String,
    pub created: u64,
    pub until: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Appeal {
    pub author: String,
    pub reason: String,
    pub created: u64,
    pub decision_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Case {
    pub id: String,
    pub scope: String,
    pub reporter: String,
    pub report: ReportInput,
    pub created: u64,
    pub evidence_expires: u64,
    pub evidence_expired: bool,
    pub decisions: Vec<Decision>,
    pub appeals: Vec<Appeal>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Notice {
    pub id: String,
    pub scope: String,
    pub subject: Subject,
    pub decisions: Vec<Decision>,
    pub appeals: Vec<Appeal>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Restriction {
    pub case_id: String,
    pub target: String,
    pub kind: String,
    pub decision: Decision,
}
impl Restriction {
    pub fn active(&self) -> bool {
        self.decision.until.is_none_or(|until| until > now())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RegistryPolicy {
    pub registry_id: String,
    pub generated: u64,
    pub expires: u64,
    pub moderators: Vec<String>,
    pub rules: String,
    pub restrictions: Vec<Restriction>,
}
impl RegistryPolicy {
    pub fn permits(&self, id: &str, author: &str) -> Result<()> {
        ensure!(
            self.expires > now(),
            "Registry safety policy expired; reconnect before serving public content"
        );
        for restriction in &self.restrictions {
            if restriction.active()
                && ((restriction.kind == "record" && restriction.target == id)
                    || (restriction.kind == "author" && restriction.target == author))
            {
                anyhow::bail!(
                    "Restricted by this registry: {}. See Safety & moderation for notices and appeals.",
                    restriction.decision.reason
                );
            }
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum CaseAction {
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
    List {
        #[serde(default)]
        offset: usize,
    },
    Withdraw {
        id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RegistryRequest {
    pub registry_id: String,
    pub nonce: String,
    pub created: u64,
    pub command: CaseAction,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CaseList {
    pub cases: Vec<Case>,
    pub notices: Vec<Notice>,
    pub can_review: bool,
    pub offset: usize,
    pub next: Option<usize>,
}

pub fn validate_request(store: &Store, nonce: &str, created: u64) -> Result<()> {
    ensure!(
        valid_id(nonce) && created <= now() + 30 && created.saturating_add(300) >= now(),
        "Expired or invalid moderation request"
    );
    let seen: bool = store.db.query_row(
        "SELECT EXISTS(SELECT 1 FROM moderation_nonces WHERE id=?)",
        [nonce],
        |row| row.get(0),
    )?;
    ensure!(!seen, "Moderation request was already used");
    Ok(())
}
pub fn remember_request(store: &Store, nonce: &str) -> Result<()> {
    store.db.execute(
        "DELETE FROM moderation_nonces WHERE created < ?",
        [now().saturating_sub(600) as i64],
    )?;
    store.db.execute(
        "INSERT INTO moderation_nonces VALUES(?1,?2)",
        rusqlite::params![nonce, now() as i64],
    )?;
    Ok(())
}
pub fn restrictions(store: &Store, scope: &str) -> Result<Vec<Restriction>> {
    store.list(&format!("restriction:{scope}:"))
}
pub fn permits(store: &Store, scope: &str, id: &str, author: &str) -> Result<()> {
    for restriction in restrictions(store, scope)? {
        if restriction.active()
            && ((restriction.kind != "author" && restriction.target == id)
                || (restriction.kind == "author" && restriction.target == author))
        {
            anyhow::bail!("Restricted here: {}", restriction.decision.reason);
        }
    }
    Ok(())
}
pub fn all_cases(store: &Store, scope: &str) -> Result<Vec<Case>> {
    let mut cases: Vec<Case> = store.secret_list(&format!("case:{scope}:"))?;
    for case in &mut cases {
        if !case.evidence_expired && case.evidence_expires <= now() {
            case.report.evidence.clear();
            case.report.details = "Evidence retention period ended".into();
            if case.report.subject.kind == "message" {
                case.report.subject.title = "Private message report".into();
            }
            case.evidence_expired = true;
            store.secret_set(&format!("case:{scope}:{}", case.id), case)?;
        }
    }
    cases.sort_by_key(|case| std::cmp::Reverse(case.created));
    Ok(cases)
}
pub fn list_cases(
    store: &Store,
    scope: &str,
    actor: &str,
    moderator: bool,
    offset: usize,
) -> Result<CaseList> {
    ensure!(offset <= 1000, "Invalid review page");
    let all: Vec<_> = all_cases(store, scope)?
        .into_iter()
        .filter(|case| {
            moderator
                || case.reporter == actor
                || (case.report.subject.author == actor && !case.decisions.is_empty())
        })
        .collect();
    let count = all.len();
    let mut bytes = 0;
    let mut page = Vec::new();
    for case in all.into_iter().skip(offset).take(25) {
        // Include room for the affected person's separate, evidence-free notice.
        let size = serde_json::to_vec(&case)?.len() * 2;
        if !page.is_empty() && bytes + size > 1024 * 1024 {
            break;
        }
        bytes += size;
        page.push(case);
    }
    let next = (offset + page.len() < count).then_some(offset + page.len());
    let all = page;
    let notices = all
        .iter()
        .filter(|case| case.report.subject.author == actor && !case.decisions.is_empty())
        .map(|case| Notice {
            id: case.id.clone(),
            scope: case.scope.clone(),
            subject: case.report.subject.clone(),
            decisions: case.decisions.clone(),
            appeals: case
                .appeals
                .iter()
                .filter(|appeal| appeal.author == actor)
                .cloned()
                .collect(),
        })
        .collect();
    let cases = all
        .into_iter()
        .filter(|case| moderator || case.reporter == actor)
        .collect();
    Ok(CaseList {
        cases,
        notices,
        can_review: moderator,
        offset,
        next,
    })
}
pub fn submit_report(store: &Store, scope: &str, actor: &str, report: ReportInput) -> Result<Case> {
    create_case(store, scope, actor, report, false)
}
pub(crate) fn submit_operator_case(
    store: &Store,
    scope: &str,
    actor: &str,
    report: ReportInput,
) -> Result<Case> {
    create_case(store, scope, actor, report, true)
}
fn create_case(
    store: &Store,
    scope: &str,
    actor: &str,
    report: ReportInput,
    operator: bool,
) -> Result<Case> {
    report.validate()?;
    let cases = all_cases(store, scope)?;
    if let Some(case) = cases.iter().find(|case| {
        case.reporter == actor
            && case.report.subject.id == report.subject.id
            && case.decisions.is_empty()
    }) {
        return Ok(case.clone());
    }
    ensure!(
        cases.len() < if operator { 1000 } else { 900 },
        "Moderation inbox reached this prototype’s case limit; contact the operator"
    );
    ensure!(
        operator
            || cases
                .iter()
                .filter(|case| case.reporter == actor && case.created + 3600 > now())
                .count()
                < 10,
        "Report limit reached; try again later"
    );
    let case = Case {
        id: digest(uuid::Uuid::new_v4().as_bytes()),
        scope: scope.into(),
        reporter: actor.into(),
        report,
        created: now(),
        evidence_expires: now() + 30 * 86400,
        evidence_expired: false,
        decisions: vec![],
        appeals: vec![],
    };
    store.secret_set(&format!("case:{scope}:{}", case.id), &case)?;
    Ok(case)
}
pub fn review_case(
    store: &Store,
    scope: &str,
    actor: &str,
    case_id: &str,
    action: &str,
    reason: String,
    rule: String,
    seconds: Option<u64>,
) -> Result<Case> {
    ensure!(valid_id(case_id), "Invalid case ID");
    text(&reason, 500)?;
    text(&rule, 160)?;
    ensure!(
        ["no_action", "remove", "restrict_author", "restore"].contains(&action),
        "Invalid review action"
    );
    ensure!(
        seconds.is_none_or(|s| s > 0 && s <= 30 * 86400),
        "Temporary restrictions last up to 30 days"
    );
    all_cases(store, scope)?;
    let mut case: Case = store
        .secret_get(&format!("case:{scope}:{case_id}"))?
        .context("Case not found in this scope")?;
    ensure!(case.decisions.len() < 50, "Case decision limit reached");
    ensure!(
        action != "no_action" || case.decisions.is_empty(),
        "Use Restore to reverse an existing decision"
    );
    ensure!(
        action != "restore" || !case.decisions.is_empty(),
        "No decision to reverse"
    );
    let decision = Decision {
        id: digest(uuid::Uuid::new_v4().as_bytes()),
        action: action.into(),
        reason,
        rule,
        actor: actor.into(),
        created: now(),
        until: seconds.map(|s| now() + s),
    };
    // One case can change its outcome without undoing a different case's restriction.
    for existing in restrictions(store, scope)?
        .iter()
        .filter(|r| r.case_id == case_id)
    {
        store.db.execute(
            "DELETE FROM kv WHERE key=?",
            [format!("restriction:{scope}:{}", existing.case_id)],
        )?;
    }
    if action == "remove" || action == "restrict_author" {
        let restriction = Restriction {
            case_id: case_id.into(),
            target: if action == "restrict_author" {
                case.report.subject.author.clone()
            } else {
                case.report.subject.id.clone()
            },
            kind: if action == "restrict_author" {
                "author".into()
            } else {
                case.report.subject.kind.clone()
            },
            decision: decision.clone(),
        };
        store.set(&format!("restriction:{scope}:{case_id}"), &restriction)?;
    }
    case.decisions.push(decision);
    store.secret_set(&format!("case:{scope}:{case_id}"), &case)?;
    Ok(case)
}
pub fn appeal_case(
    store: &Store,
    scope: &str,
    actor: &str,
    case_id: &str,
    reason: String,
) -> Result<Case> {
    text(&reason, 1000)?;
    ensure!(valid_id(case_id), "Invalid case ID");
    all_cases(store, scope)?;
    let mut case: Case = store
        .secret_get(&format!("case:{scope}:{case_id}"))?
        .context("Case not found in this scope")?;
    ensure!(
        case.reporter == actor || case.report.subject.author == actor,
        "Only the affected person or reporter can appeal"
    );
    let decision = case
        .decisions
        .last()
        .context("This report has no decision to appeal")?;
    ensure!(
        !case
            .appeals
            .iter()
            .any(|a| a.author == actor && a.decision_id == decision.id),
        "Your appeal is already awaiting review"
    );
    case.appeals.push(Appeal {
        author: actor.into(),
        reason,
        created: now(),
        decision_id: decision.id.clone(),
    });
    store.secret_set(&format!("case:{scope}:{case_id}"), &case)?;
    Ok(case)
}
