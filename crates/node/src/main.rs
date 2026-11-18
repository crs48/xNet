use clap::{Parser, Subcommand};
use community_network::{
    bridge::{Bridge, BridgeInfo, Command, call},
    peer::Node,
};
use std::{
    io::{Read, Write},
    path::PathBuf,
};
#[derive(Parser)]
struct Args {
    #[command(subcommand)]
    command: Action,
}
#[derive(Subcommand)]
enum Action {
    Serve {
        #[arg(long)]
        data: PathBuf,
        #[arg(long, default_value = "http://127.0.0.1:4380")]
        registry: String,
    },
    Call {
        #[arg(long)]
        data: PathBuf,
        #[arg(long)]
        json: String,
    },
    NativeHost {
        #[arg(long)]
        data: PathBuf,
        #[arg(long)]
        extension: String,
        origin: String,
    },
}
fn read_frame(reader: &mut impl Read) -> anyhow::Result<Option<Vec<u8>>> {
    let mut size = [0u8; 4];
    if reader.read(&mut size[..1])? == 0 {
        return Ok(None);
    }
    reader.read_exact(&mut size[1..])?;
    let len = u32::from_ne_bytes(size) as usize;
    anyhow::ensure!(len <= 8192, "Native request too large");
    let mut bytes = vec![0; len];
    reader.read_exact(&mut bytes)?;
    Ok(Some(bytes))
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    match Args::parse().command {
        Action::Serve { data, registry } => {
            let node = Node::start(data, registry).await?;
            let bridge = Bridge::start(node.clone()).await?;
            println!(
                "Peer {} · bridge port {}",
                node.endpoint.id(),
                bridge.info.port
            );
            tokio::signal::ctrl_c().await?;
            node.endpoint.close().await;
        }
        Action::Call { data, json } => {
            let info: BridgeInfo =
                serde_json::from_slice(&std::fs::read(data.join("bridge.json"))?)?;
            let command: Command = serde_json::from_str(&json)?;
            println!("{}", call(&info, &command).await?);
        }
        Action::NativeHost {
            data,
            extension,
            origin,
        } => {
            anyhow::ensure!(
                extension.len() == 32 && extension.bytes().all(|b| (b'a'..=b'p').contains(&b)),
                "Invalid extension ID"
            );
            anyhow::ensure!(
                origin == format!("chrome-extension://{extension}/"),
                "Extension origin rejected"
            );
            loop {
                let Some(bytes) = read_frame(&mut std::io::stdin())? else {
                    break;
                };
                let result=async{
                let request:serde_json::Value=serde_json::from_slice(&bytes)?;
                // The extension cannot create accounts, read chats, import paths, or change settings.
                let command=match request.get("op").and_then(|v|v.as_str()){
                    Some("play")=>Command::Play{id:request.get("id").and_then(|v|v.as_str()).ok_or_else(||anyhow::anyhow!("Missing content ID"))?.into()},
                    Some("status")=>{let info:BridgeInfo=serde_json::from_slice(&std::fs::read(data.join("bridge.json"))?)?;let value=call(&info,&Command::Snapshot).await?;return Ok(serde_json::json!({"active":value["active"],"reason":value["reason"]}));},_=>anyhow::bail!("Unsupported extension request")};
                let info:BridgeInfo=serde_json::from_slice(&std::fs::read(data.join("bridge.json"))?)?;call(&info,&command).await
            }.await;
                let value = match result {
                    Ok(v) => serde_json::json!({"ok":true,"result":v}),
                    Err(e) => serde_json::json!({"ok":false,"error":e.to_string()}),
                };
                let bytes = serde_json::to_vec(&value)?;
                anyhow::ensure!(bytes.len() < 1024 * 1024, "Native response too large");
                let mut out = std::io::stdout();
                out.write_all(&(bytes.len() as u32).to_ne_bytes())?;
                out.write_all(&bytes)?;
                out.flush()?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::read_frame;

    #[test]
    fn native_frames_distinguish_shutdown_from_truncation() {
        assert!(read_frame(&mut &b""[..]).unwrap().is_none());
        assert!(read_frame(&mut &b"\x02\x00"[..]).is_err());
        let mut bytes = 2u32.to_ne_bytes().to_vec();
        bytes.push(b'{');
        assert!(read_frame(&mut bytes.as_slice()).is_err());
        bytes.push(b'}');
        assert_eq!(read_frame(&mut bytes.as_slice()).unwrap().unwrap(), b"{}");
        assert!(read_frame(&mut 8193u32.to_ne_bytes().as_slice()).is_err());
    }
}
