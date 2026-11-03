use crate::{model::*, store::Store};
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
type Registry = Arc<Mutex<Store>>;
#[derive(Default, Deserialize)]
pub struct Search {
    pub q: Option<String>,
    pub kind: Option<String>,
    pub reply_to: Option<String>,
}

pub fn router(path: &FsPath) -> Result<Router> {
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
        "CREATE INDEX IF NOT EXISTS catalog_feed ON catalog(kind,reply_to,created DESC);",
    )?;
    Ok(Router::new()
        .route("/api/catalog", get(catalog))
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
        .layer(DefaultBodyLimit::max(96 * 1024))
        .with_state(Arc::new(Mutex::new(store))))
}
pub async fn serve(path: &FsPath, bind: SocketAddr) -> Result<()> {
    let listener = tokio::net::TcpListener::bind(bind).await?;
    println!("Metadata registry: http://{}", listener.local_addr()?);
    axum::serve(listener, router(path)?).await?;
    Ok(())
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
async fn announce(
    State(state): State<Registry>,
    Json(value): Json<Signed<Announcement>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    verify_announcement(&value)?;
    let store = state
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    let record = &value.payload.record;
    let r = &record.payload;
    if let Some(parent) = &r.reply_to {
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
    let count: i64 = store
        .db
        .query_row("SELECT count(*) FROM catalog", [], |r| r.get(0))?;
    ensure!(
        existing.is_some() || count < 10000,
        "Prototype registry is full"
    );
    store.db.execute(
        "INSERT INTO catalog(id,author,title,description,kind,created,data,reply_to) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id) DO NOTHING",
        params![
            r.id,
            record.author,
            r.title,
            r.description,
            r.kind,
            r.created as i64,
            serde_json::to_string(record)?,
            r.reply_to
        ],
    )?;
    store
        .db
        .execute("DELETE FROM providers WHERE expires < ?", [now() as i64])?;
    let providers: i64 =
        store
            .db
            .query_row("SELECT count(*) FROM providers WHERE id=?", [&r.id], |r| {
                r.get(0)
            })?;
    ensure!(providers < 64, "Prototype provider limit reached");
    store.db.execute("INSERT INTO providers VALUES(?1,?2,?3,?4) ON CONFLICT(id,peer) DO UPDATE SET expires=excluded.expires,address=excluded.address",params![r.id,value.author,value.payload.expires as i64,serde_json::to_string(&value.payload.address)?])?;
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
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    let parent = search.reply_to.unwrap_or_default();
    ensure!(
        parent.is_empty() || valid_id(&parent),
        "Invalid reply target"
    );
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
        items.push(with_providers(&store, serde_json::from_str(&row?)?)?);
    }
    Ok(Json(items))
}
async fn item(
    State(state): State<Registry>,
    Path(id): Path<String>,
) -> Result<Json<CatalogItem>, ApiError> {
    ensure!(valid_id(&id), "Invalid ID");
    let store = state
        .lock()
        .map_err(|_| anyhow::anyhow!("Registry lock failed"))?;
    let data: String = store
        .db
        .query_row("SELECT data FROM catalog WHERE id=?", [id], |r| r.get(0))?;
    Ok(Json(with_providers(&store, serde_json::from_str(&data)?)?))
}
