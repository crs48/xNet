use clap::Parser;
#[derive(Parser)]
struct Args {
    #[arg(long, default_value = "127.0.0.1:4380")]
    bind: std::net::SocketAddr,
    #[arg(long, default_value = ".local/registry.sqlite")]
    database: std::path::PathBuf,
    /// Device identities allowed to review this registry’s reports. Repeat for multiple people.
    #[arg(long)]
    moderator: Vec<String>,
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    if let Some(parent) = args.database.parent() {
        std::fs::create_dir_all(parent)?;
    }
    community_network::registry::serve_with_moderators(&args.database, args.bind, args.moderator)
        .await
}
