use crate::{model::*, peer::Node, registry::ApiError, store::write_secret};
use anyhow::{Context, Result, ensure};
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[derive(Clone, Serialize, Deserialize)]
pub struct BridgeInfo {
    pub port: u16,
    pub token: String,
}
#[derive(Clone)]
pub struct Bridge {
    pub node: Arc<Node>,
    pub info: BridgeInfo,
    tickets: Arc<Mutex<HashMap<String, (String, u64)>>>,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Command {
    Snapshot,
    Account {
        name: String,
    },
    Participation {
        settings: Participation,
    },
    Catalog {
        query: String,
        #[serde(default)]
        kind: Option<String>,
    },
    PublishPost {
        body: String,
        reply_to: Option<String>,
    },
    PostThread {
        id: String,
    },
    Publish {
        path: String,
        title: String,
        description: String,
    },
    Play {
        id: String,
    },
    Retain {
        id: String,
    },
    CreateRoom {
        title: String,
        private: bool,
    },
    Join {
        link: String,
    },
    Invite {
        id: String,
    },
    Messages {
        id: String,
    },
    Send {
        id: String,
        body: String,
    },
}
impl Bridge {
    pub async fn start(node: Arc<Node>) -> Result<Self> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let info = BridgeInfo {
            port: listener.local_addr()?.port(),
            token: hex::encode(rand::random::<[u8; 32]>()),
        };
        let bridge = Self {
            node,
            info,
            tickets: Arc::new(Mutex::new(HashMap::new())),
        };
        let path = bridge.node.root.join("bridge.json");
        if path.try_exists()? {
            std::fs::remove_file(&path)?;
        }
        write_secret(&path, &serde_json::to_vec(&bridge.info)?)?;
        let router = Router::new()
            .route("/control", post(control))
            .route_layer(middleware::from_fn_with_state(bridge.clone(), authenticate))
            .route("/media/{id}", get(media).head(media))
            .layer(DefaultBodyLimit::max(32 * 1024))
            .with_state(bridge.clone());
        tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, router).await {
                eprintln!("Desktop bridge stopped: {e}");
            }
        });
        Ok(bridge)
    }
    pub async fn execute(&self, command: Command) -> Result<serde_json::Value> {
        let node = &self.node;
        Ok(match command {
            Command::Snapshot => serde_json::to_value(node.snapshot()?)?,
            Command::Account { name } => {
                node.create_profile(name)?;
                serde_json::to_value(node.snapshot()?)?
            }
            Command::Participation { settings } => {
                node.configure(settings).await?;
                serde_json::to_value(node.snapshot()?)?
            }
            Command::Catalog { query, kind } => {
                serde_json::to_value(node.catalog_filtered(&query, kind.as_deref(), None).await?)?
            }
            Command::PublishPost { body, reply_to } => {
                serde_json::to_value(node.publish_post(body, reply_to).await?)?
            }
            Command::PostThread { id } => {
                node.require_active()?;
                let item = node.lookup(&id).await?;
                ensure!(item.record.payload.kind == "post", "Not a public post");
                let replies = node.catalog_filtered("", Some("post"), Some(&id)).await?;
                serde_json::json!({"post":item,"replies":replies})
            }
            Command::Publish {
                path,
                title,
                description,
            } => serde_json::to_value(
                node.publish_file(&PathBuf::from(path), title, description)
                    .await?,
            )?,
            Command::Play { id } => {
                let item = node.media(&id).await?;
                ensure!(
                    matches!(
                        item.record.payload.kind.as_str(),
                        "video" | "image" | "audio"
                    ),
                    "Not media"
                );
                let ticket = hex::encode(rand::random::<[u8; 32]>());
                let mut tickets = self.tickets.lock().unwrap();
                tickets.retain(|_, (_, expiry)| *expiry > now());
                ensure!(tickets.len() < 128, "Too many playback sessions");
                tickets.insert(ticket.clone(), (id.clone(), now() + 600));
                serde_json::json!({"url":format!("http://127.0.0.1:{}/media/{id}?ticket={ticket}",self.info.port),"item":item})
            }
            Command::Retain { id } => {
                node.retain(&id).await?;
                serde_json::json!({"retained":true})
            }
            Command::CreateRoom { title, private } => {
                serde_json::to_value(node.create_room(title, private).await?)?
            }
            Command::Join { link } => serde_json::to_value(node.join_link(&link).await?)?,
            Command::Invite { id } => serde_json::json!({"link":node.invitation(&id)?}),
            Command::Messages { id } => serde_json::to_value(node.sync_room(&id).await?)?,
            Command::Send { id, body } => {
                node.send_message(&id, body).await?;
                serde_json::json!({"delivered":true})
            }
        })
    }
}
async fn authenticate(State(bridge): State<Bridge>, request: Request, next: Next) -> Response {
    let expected = format!("Bearer {}", bridge.info.token);
    let host = format!("127.0.0.1:{}", bridge.info.port);
    if request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        != Some(&expected)
        || request
            .headers()
            .get(header::HOST)
            .and_then(|h| h.to_str().ok())
            != Some(&host)
        || request.headers().contains_key(header::ORIGIN)
    {
        return (
            StatusCode::FORBIDDEN,
            "Desktop bridge authorization required",
        )
            .into_response();
    }
    next.run(request).await
}
async fn control(
    State(bridge): State<Bridge>,
    Json(command): Json<Command>,
) -> Result<Json<serde_json::Value>, ApiError> {
    Ok(Json(bridge.execute(command).await?))
}
#[derive(Deserialize)]
struct Ticket {
    ticket: String,
}
async fn media(
    State(bridge): State<Bridge>,
    Path(id): Path<String>,
    Query(ticket): Query<Ticket>,
    headers: HeaderMap,
    method: axum::http::Method,
) -> Result<Response, ApiError> {
    let valid = bridge
        .tickets
        .lock()
        .unwrap()
        .get(&ticket.ticket)
        .is_some_and(|(content, expiry)| content == &id && *expiry > now());
    if !valid {
        return Ok((StatusCode::FORBIDDEN, "Playback session expired").into_response());
    }
    bridge.node.require_active()?;
    let item = bridge.node.media(&id).await?;
    let record = &item.record.payload;
    let range = byte_range(
        headers.get(header::RANGE).and_then(|h| h.to_str().ok()),
        record.size,
    );
    let (start, end, partial) = match range {
        Ok(range) => range,
        Err(_) => {
            return Ok(Response::builder()
                .status(416)
                .header(header::CONTENT_RANGE, format!("bytes */{}", record.size))
                .body(Body::empty())?);
        }
    };
    let mut response = Response::builder()
        .status(if partial { 206 } else { 200 })
        .header(header::CONTENT_TYPE, &record.mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, end - start + 1)
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header(header::REFERRER_POLICY, "no-referrer");
    if partial {
        response = response.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{}", record.size),
        );
    }
    if method == axum::http::Method::HEAD {
        return Ok(response.body(Body::empty())?);
    }
    let node = bridge.node.clone();
    let stream = async_stream::try_stream! {
        for index in (start/CHUNK as u64)..=(end/CHUNK as u64){
            let bytes=node.chunk(&item,index as usize).await.map_err(std::io::Error::other)?;
            let base=index*CHUNK as u64;let first=start.saturating_sub(base) as usize;let last=((end-base+1).min(bytes.len() as u64)) as usize;
            yield Bytes::copy_from_slice(&bytes[first..last]);
        }
    };
    fn byte_body(
        stream: impl futures_util::Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static,
    ) -> Body {
        Body::from_stream(stream)
    }
    Ok(response.body(byte_body(stream))?)
}

pub async fn call(info: &BridgeInfo, command: &Command) -> Result<serde_json::Value> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(120))
        .build()?;
    let response = client
        .post(format!("http://127.0.0.1:{}/control", info.port))
        .bearer_auth(&info.token)
        .json(command)
        .send()
        .await?;
    let status = response.status();
    let body: serde_json::Value = response.json().await.context("Invalid desktop response")?;
    ensure!(
        status.is_success(),
        "{}",
        body.get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("Desktop request failed")
    );
    Ok(body)
}
