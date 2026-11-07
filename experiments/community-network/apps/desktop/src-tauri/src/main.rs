#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use community_network::{
    bridge::{Bridge, Command},
    peer::Node,
};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
#[tauri::command]
async fn perform(bridge: State<'_, Bridge>, command: Command) -> Result<serde_json::Value, String> {
    bridge.execute(command).await.map_err(|e| e.to_string())
}
#[tauri::command]
async fn select_media(
    app: tauri::AppHandle,
    kind: Option<String>,
) -> Result<Option<String>, String> {
    let (label, extensions): (&str, &[&str]) = match kind.as_deref() {
        Some("audio") => ("Music", &["mp3", "wav"]),
        None | Some("visual") => (
            "Images and video",
            &["mp4", "webm", "png", "jpg", "jpeg", "webp"],
        ),
        _ => return Err("Unsupported media category".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter(label, extensions)
            .blocking_pick_file()
            .map(|f| f.into_path().map(|p| p.to_string_lossy().into_owned()))
            .transpose()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn updates_enabled(app: tauri::AppHandle) -> bool {
    app.config().plugins.0.contains_key("updater")
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if app.config().plugins.0.contains_key("updater") {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            let root = std::env::var_os("XNET_COMMUNITY_DATA")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            let registry =
                std::env::var("XNET_COMMUNITY_REGISTRY").unwrap_or("http://127.0.0.1:4380".into());
            let bridge = tauri::async_runtime::block_on(async {
                let node = Node::start(root, registry).await?;
                Bridge::start(node).await
            })?;
            if let Ok(label) = std::env::var("XNET_COMMUNITY_LABEL") {
                if let Some(window) = app.get_webview_window("main") {
                    window.set_title(&format!("xNet · {label}"))?;
                }
            }
            app.manage(bridge);
            Ok(())
        })
        .on_page_load(|_, _| {})
        .invoke_handler(tauri::generate_handler![
            perform,
            select_media,
            updates_enabled
        ])
        .run(tauri::generate_context!())
        .expect("Desktop runtime failed");
}
