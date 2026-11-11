use crate::{
    model::*,
    moderation::{self, *},
    private_media::{self, Lookup, PrivateLease},
    store::{Store, read_key},
};
use anyhow::Result;
macro_rules! ensure {
    ($condition:expr, $message:expr) => {
        if !$condition {
            return Err(ApiError(anyhow::anyhow!($message)));
        }
    };
}
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{StatusCode, header},
    response::{Html, IntoResponse},
    routing::{get, post},
};
use rusqlite::{OptionalExtension, params};
use serde::Deserialize;
use std::{
    net::SocketAddr,
    path::Path as FsPath,
    sync::{Arc, Mutex},
};

#[derive(Debug)]
pub struct ApiError(pub anyhow::Error);
impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error":self.0.to_string()})),
        )
            .into_response()
    }
}
struct RegistryState {
    store: Mutex<Store>,
    key: iroh::SecretKey,
    moderators: Vec<String>,
    public_relay: Option<iroh::RelayUrl>,
    admission: Option<reqwest::Client>,
    origin: Option<String>,
}
type Registry = Arc<RegistryState>;
#[derive(Default, Deserialize)]
pub struct Search {
    pub q: Option<String>,
    pub kind: Option<String>,
    pub reply_to: Option<String>,
}

pub fn router(path: &FsPath) -> Result<Router> {
    router_with_moderators(path, vec![])
}
pub fn router_with_moderators(path: &FsPath, moderators: Vec<String>) -> Result<Router> {
    anyhow::ensure!(
        moderators.len() <= 16 && moderators.iter().all(|id| valid_id(id)),
        "Invalid moderator identities"
    );
    let key = read_key(&path.with_extension("authority.key"))?;
    let store = Store::open(path)?;
    store.db.execute_batch("CREATE TABLE IF NOT EXISTS catalog(id TEXT PRIMARY KEY,author TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,kind TEXT NOT NULL,created INTEGER NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS providers(id TEXT NOT NULL,peer TEXT NOT NULL,expires INTEGER NOT NULL,address TEXT NOT NULL,PRIMARY KEY(id,peer));")?;
    let has_replies: bool = store.db.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('catalog') WHERE name='reply_to')",
        [],
        |r| r.get(0),
    )?;
    if !has_replies {
        store
            .db
            .execute_batch("ALTER TABLE catalog ADD COLUMN reply_to TEXT;")?;
    }
    store.db.execute_batch(
        "CREATE TABLE IF NOT EXISTS private_routes(handle TEXT PRIMARY KEY,expires INTEGER NOT NULL,route TEXT NOT NULL,readers TEXT NOT NULL); CREATE INDEX IF NOT EXISTS private_expiry ON private_routes(expires); CREATE INDEX IF NOT EXISTS providers_expiry ON providers(expires); CREATE INDEX IF NOT EXISTS catalog_feed ON catalog(kind,reply_to,created DESC);",
    )?;
    let public_relay: Option<iroh::RelayUrl> = std::env::var("TRACKER_RELAY_URL")
        .ok()
        .map(|url| url.parse())
        .transpose()?;
    let origin = std::env::var("TRACKER_ORIGIN")
        .ok()
        .or_else(|| public_relay.as_ref().map(|url| url.to_string()));
    let admission = if std::env::var("TRACKER_CHECK_ADMISSION").as_deref() == Ok("1") {
        Some(
            reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(std::time::Duration::from_secs(2))
                .build()?,
        )
    } else {
        None
    };
    Ok(Router::new()
        .route("/api/catalog", get(catalog))
        .route("/join", get(page))
        .route("/private/{id}", get(page))
        .route("/api/private/announce", post(private_announce))
        .route("/api/private/resolve", post(private_resolve))
        .route("/tracker/ready", get(ready))
        .route("/api/moderation/policy", get(policy))
        .route("/api/moderation", post(moderate))
        .route("/api/items/{id}", get(item))
        .route("/api/announce", post(announce))
        .route("/", get(page))
        .route("/watch/{id}", get(page))
        .route("/room/{id}", get(page))
        .route("/post/{id}", get(page))
        .route(
            "/registry.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript")],
                    include_str!("../../../web/registry.js"),
                )
            }),
        )
        .route(
            "/style.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css")],
                    include_str!("../../../web/style.css"),
                )
            }),
        )
        .layer(axum::middleware::map_response(
            |mut response: axum::response::Response| async {
                response.headers_mut().insert(
                    header::CACHE_CONTROL,
                    "no-store".parse().expect("static header"),
                );
                response
            },
        ))
        .layer(DefaultBodyLimit::max(96 * 1024))
        .with_state(Arc::new(RegistryState {
            store: Mutex::new(store),
            key,
            moderators,
            public_relay,
            origin,
            admission,
        })))
}
pub async fn serve(path: &FsPath, bind: SocketAddr) -> Result<()> {
    serve_with_moderators(path, bind, vec![]).await
}
pub async fn serve_with_moderators(
    path: &FsPath,
    bind: SocketAddr,
    moderators: Vec<String>,
) -> Result<()> {
    let listener = tokio::net::TcpListener::bind(bind).await?;
    println!("Metadata registry: http://{}", listener.local_addr()?);
    axum::serve(listener, router_with_moderators(path, moderators)?).await?;
    Ok(())
}
async fn ready(State(state): State<Registry>) -> Result<Json<serde_json::Value>, ApiError> {
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    store
        .db
        .query_row("SELECT 1 FROM catalog LIMIT 1", [], |_| Ok(()))
        .optional()?;
    Ok(Json(serde_json::json!({"tracker":"ready"})))
}
async fn page() -> impl IntoResponse {
    (
        [
            (
                header::CONTENT_SECURITY_POLICY,
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src chrome-extension:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            ),
            (header::REFERRER_POLICY, "no-referrer"),
        ],
        Html(include_str!("../../../web/index.html")),
    )
}
async fn check_device(state: &RegistryState, actor: &str) -> Result<(), ApiError> {
    if let Some(check) = &state.admission {
        let allowed = check
            .post("http://127.0.0.1:3341/access")
            .header("x-iroh-endpoint-id", actor)
            .send()
            .await?
            .error_for_status()?
            .json::<bool>()
            .await?;
        ensure!(allowed, "This device has not joined the hub");
    }
    Ok(())
}
async fn private_announce(
    State(state): State<Registry>,
    Json(value): Json<Signed<PrivateLease>>,
) -> Result<Json<bool>, ApiError> {
    value.verify()?;
    let v = &value.payload;
    let relay = state
        .public_relay
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Private routing requires a configured relay"))?;
    ensure!(
        v.route.id.to_string() == value.author
            && valid_id(&v.nonce)
            && v.route.relay_urls().any(|r| r == relay),
        "Invalid private route"
    );
    ensure!(
        v.expires > now()
            && v.expires <= now() + 300
            && !v.readers.is_empty()
            && v.readers.len() <= 256
            && v.readers.iter().all(|r| valid_id(r)),
        "Invalid private lease"
    );
    check_device(&state, &value.author).await?;
    let handle = private_media::handle(&value.author, &v.nonce);
    let route = iroh::EndpointAddr::new(v.route.id).with_relay_url(relay.clone());
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    moderation::permits(&store, "registry", "", &value.author)?;
    let tx = store.db.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM private_routes WHERE expires<=?",
        [now() as i64],
    )?;
    let full:bool=tx.query_row("SELECT NOT EXISTS(SELECT 1 FROM private_routes WHERE handle=?1) AND (SELECT count(*) FROM private_routes)>=10000",[&handle],|r|r.get(0))?;
    ensure!(!full, "Private route capacity reached");
    tx.execute("INSERT INTO private_routes VALUES(?1,?2,?3,?4) ON CONFLICT(handle) DO UPDATE SET expires=excluded.expires,route=excluded.route,readers=excluded.readers WHERE excluded.expires>=private_routes.expires",params![handle,v.expires as i64,serde_json::to_string(&route)?,serde_json::to_string(&v.readers)?])?;
    tx.commit()?;
    Ok(Json(true))
}
async fn private_resolve(
    State(state): State<Registry>,
    Json(request): Json<Signed<Lookup>>,
) -> Result<Json<iroh::EndpointAddr>, ApiError> {
    request.verify()?;
    let v = &request.payload;
    let origin = state
        .origin
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("Private routing unavailable"))?;
    ensure!(
        v.registry.trim_end_matches('/') == origin.trim_end_matches('/')
            && valid_id(&v.private_handle)
            && v.at.abs_diff(now()) <= 60,
        "Invalid private lookup"
    );
    check_device(&state, &request.author).await?;
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    let route:Option<String>=store.db.query_row("SELECT route FROM private_routes WHERE handle=? AND expires>? AND EXISTS(SELECT 1 FROM json_each(readers) WHERE value=?)",params![v.private_handle,now() as i64,private_media::reader(&v.private_handle,&request.author)],|r|r.get(0)).optional()?;
    let route: iroh::EndpointAddr =
        serde_json::from_str(&route.ok_or_else(|| anyhow::anyhow!("Private file unavailable"))?)?;
    moderation::permits(&store, "registry", "", &route.id.to_string())?;
    Ok(Json(route))
}
async fn announce(
    State(state): State<Registry>,
    Json(value): Json<Signed<Announcement>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    verify_announcement(&value)?;
    check_device(&state, &value.author).await?;
    let address = if let Some(url) = &state.public_relay {
        ensure!(
            value.payload.address.relay_urls().any(|a| a == url),
            "Missing hub route"
        );
        iroh::EndpointAddr::new(value.payload.address.id).with_relay_url(url.clone())
    } else {
        value.payload.address.clone()
    };
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    let record = &value.payload.record;
    let r = &record.payload;
    moderation::permits(&store, "registry", &r.id, &record.author)?;
    moderation::permits(&store, "registry", "", &value.author)?;
    if let Some(parent) = &r.reply_to {
        require_available(&store, parent)?;
        let public_post: bool = store.db.query_row(
            "SELECT EXISTS(SELECT 1 FROM catalog WHERE id=? AND kind='post')",
            [parent],
            |r| r.get(0),
        )?;
        ensure!(
            public_post,
            "Replies must reference an existing public post"
        );
    }
    let existing: Option<String> = store
        .db
        .query_row("SELECT author FROM catalog WHERE id=?", [&r.id], |r| {
            r.get(0)
        })
        .optional()?;
    ensure!(
        existing
            .as_ref()
            .is_none_or(|owner| owner == &record.author),
        "Record belongs to another publisher"
    );
    let tx = store.db.unchecked_transaction()?;
    if existing.is_none() {
        let count: i64 = tx.query_row("SELECT count(*) FROM catalog", [], |r| r.get(0))?;
        ensure!(count < 10000, "Prototype registry is full");
        tx.execute(
            "INSERT INTO catalog(id,author,title,description,kind,created,data,reply_to) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![r.id, record.author, r.title, r.description, r.kind, r.created as i64, serde_json::to_string(record)?, r.reply_to],
        )?;
    }
    tx.execute("DELETE FROM providers WHERE expires <= ?", [now() as i64])?;
    let others: i64 = tx.query_row(
        "SELECT count(*) FROM providers WHERE id=? AND peer<>?",
        params![r.id, value.author],
        |r| r.get(0),
    )?;
    ensure!(others < 64, "Prototype provider limit reached");
    // On a public hub publish only the operator's rendezvous address. LAN candidates
    // are exchanged by authenticated peers after discovery.
    tx.execute("INSERT INTO providers VALUES(?1,?2,?3,?4) ON CONFLICT(id,peer) DO UPDATE SET expires=excluded.expires,address=excluded.address",params![r.id,value.author,value.payload.expires as i64,serde_json::to_string(&address)?])?;
    tx.commit()?;
    Ok(Json(serde_json::json!({"accepted":true,"id":r.id})))
}
fn with_providers(store: &Store, record: Signed<Record>) -> Result<CatalogItem> {
    let mut q = store
        .db
        .prepare("SELECT address FROM providers WHERE id=?1 AND expires>?2 LIMIT 64")?;
    let providers = q
        .query_map(params![record.payload.id, now() as i64], |r| {
            r.get::<_, String>(0)
        })?
        .map(|r| Ok(serde_json::from_str(&r?)?))
        .collect::<Result<Vec<_>>>()?;
    Ok(CatalogItem { record, providers })
}
async fn catalog(
    State(state): State<Registry>,
    Query(search): Query<Search>,
) -> Result<Json<Vec<CatalogItem>>, ApiError> {
    ensure!(
        search.q.as_ref().is_none_or(|v| v.len() <= 200),
        "Query too long"
    );
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    let parent = search.reply_to.unwrap_or_default();
    ensure!(
        parent.is_empty() || valid_id(&parent),
        "Invalid reply target"
    );
    if !parent.is_empty() {
        require_available(&store, &parent)?;
    }
    let mut q=store.db.prepare("SELECT data FROM catalog WHERE (instr(lower(title),lower(?1))>0 OR instr(lower(description),lower(?1))>0) AND (?2='' OR kind=?2 OR (?2='visual' AND kind IN ('video','image','room'))) AND ((?3='' AND reply_to IS NULL) OR reply_to=?3) ORDER BY created DESC,rowid DESC LIMIT 100")?;
    let rows = q.query_map(
        params![
            search.q.unwrap_or_default(),
            search.kind.unwrap_or_default(),
            parent
        ],
        |r| r.get::<_, String>(0),
    )?;
    let mut items = vec![];
    for row in rows {
        let record: Signed<Record> = serde_json::from_str(&row?)?;
        if available(&store, &record.payload.id)? {
            items.push(with_providers(&store, record)?);
        }
    }
    Ok(Json(items))
}
async fn item(
    State(state): State<Registry>,
    Path(id): Path<String>,
) -> Result<Json<CatalogItem>, ApiError> {
    ensure!(valid_id(&id), "Invalid ID");
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    require_available(&store, &id)?;
    let data: String = store
        .db
        .query_row("SELECT data FROM catalog WHERE id=?", [id], |r| r.get(0))?;
    Ok(Json(with_providers(&store, serde_json::from_str(&data)?)?))
}

fn available(store: &Store, id: &str) -> Result<bool> {
    let mut current = Some(id.to_string());
    for _ in 0..64 {
        let Some(id) = current else {
            return Ok(true);
        };
        let data: String =
            store
                .db
                .query_row("SELECT data FROM catalog WHERE id=?", [&id], |row| {
                    row.get(0)
                })?;
        let record: Signed<Record> = serde_json::from_str(&data)?;
        if restrictions(store, "registry")?.iter().any(|r| {
            r.active()
                && ((r.kind == "record" && r.target == id)
                    || (r.kind == "author" && r.target == record.author))
        }) {
            return Ok(false);
        }
        current = record.payload.reply_to;
    }
    anyhow::bail!("Reply chain exceeds prototype limit")
}
fn require_available(store: &Store, id: &str) -> Result<()> {
    anyhow::ensure!(
        available(store, id)?,
        "Restricted by this registry. See Safety & moderation for notices and appeals."
    );
    Ok(())
}
async fn policy(State(state): State<Registry>) -> Result<Json<Signed<RegistryPolicy>>, ApiError> {
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    Ok(Json(Signed::new(
        RegistryPolicy {
            registry_id: state.key.public().to_string(),
            generated: now(),
            expires: now() + POLICY_LEASE,
            moderators: state.moderators.clone(),
            rules: RULES.into(),
            restrictions: restrictions(&store, "registry")?,
        },
        &state.key,
    )?))
}
async fn moderate(
    State(state): State<Registry>,
    Json(request): Json<Signed<RegistryRequest>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    request.verify()?;
    ensure!(
        request.payload.registry_id == state.key.public().to_string(),
        "Wrong registry authority"
    );
    let store = state
        .store
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    validate_request(&store, &request.payload.nonce, request.payload.created)?;
    let actor = &request.author;
    let moderator = state.moderators.contains(actor);
    let tx = store.db.unchecked_transaction()?;
    let result = match request.payload.command {
        CaseAction::List { offset } => {
            serde_json::to_value(list_cases(&store, "registry", actor, moderator, offset)?)?
        }
        CaseAction::Report { mut report } => {
            report.validate()?;
            if report.subject.kind == "record" {
                let raw: String = store.db.query_row(
                    "SELECT data FROM catalog WHERE id=?",
                    [&report.subject.id],
                    |r| r.get(0),
                )?;
                let record: Signed<Record> = serde_json::from_str(&raw)?;
                report.subject = Subject::record(&record);
            }
            serde_json::to_value(submit_report(&store, "registry", actor, report)?)?
        }
        CaseAction::Review {
            case_id,
            decision,
            reason,
            rule,
            seconds,
        } => {
            ensure!(
                moderator,
                "Only a configured registry moderator can review reports"
            );
            let case: Case = store
                .secret_get(&format!("case:registry:{case_id}"))?
                .ok_or_else(|| anyhow::anyhow!("Case not found"))?;
            ensure!(
                decision != "remove" || case.report.subject.kind == "record",
                "A registry cannot remove messages from a private room"
            );
            let updated = review_case(
                &store, "registry", actor, &case_id, &decision, reason, rule, seconds,
            )?;
            if decision == "remove" {
                store.db.execute(
                    "DELETE FROM providers WHERE id=?",
                    [&updated.report.subject.id],
                )?;
            }
            if decision == "restrict_author" {
                store.db.execute("DELETE FROM providers WHERE peer=? OR id IN (SELECT id FROM catalog WHERE author=?)", [&updated.report.subject.author, &updated.report.subject.author])?;
            }
            serde_json::to_value(updated)?
        }
        CaseAction::Appeal { case_id, reason } => {
            appeal_case(&store, "registry", actor, &case_id, reason)?;
            serde_json::json!({"accepted":true,"id":case_id})
        }
        CaseAction::Withdraw { id } => {
            ensure!(valid_id(&id), "Invalid content ID");
            store
                .db
                .execute("DELETE FROM providers WHERE id=? AND peer=?", [&id, actor])?;
            serde_json::json!({"withdrawn":true})
        }
    };
    remember_request(&store, &request.payload.nonce)?;
    tx.commit()?;
    Ok(Json(result))
}
