use clap::Parser;
#[derive(Parser)]
struct Args {
    #[arg(long, default_value = "127.0.0.1:4380")]
    bind: std::net::SocketAddr,
    #[arg(long, default_value = ".local/registry.sqlite")]
    database: std::path::PathBuf,
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    if let Some(parent) = args.database.parent() {
        std::fs::create_dir_all(parent)?;
    }
    community_network::registry::serve(&args.database, args.bind).await
}
