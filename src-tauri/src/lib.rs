use std::{collections::HashMap, sync::Arc};
use tauri::State;
use tokio::{process::Command, sync::Mutex};

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct AppConfig {
    id: String,
    name: String,
    icon: String,
    #[serde(rename = "launchCommand")]
    launch_command: String,
}

#[tauri::command]
async fn get_apps(config_path: String) -> Result<Vec<AppConfig>, String> {
    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    serde_json::from_str(&content).map_err(|e| format!("Config parse error: {}", e))
}

struct AppState {
    pid: u32,
    is_running: bool,
}

struct LaunchedApps(Arc<Mutex<HashMap<String, AppState>>>);

#[tauri::command]
async fn launch_app(
    executable_path: String,
    app_id: String,
    apps_state: State<'_, LaunchedApps>,
) -> Result<u32, String> {
    let child = Command::new(executable_path)
        .spawn()
        .map_err(|e| format!("Launch error: {}", e))?;

    let pid = child.id().ok_or("Application immediately closed")?;

    let apps = Arc::clone(&apps_state.0);
    tokio::spawn(async move {
        let mut map = apps.lock().await;
        map.entry(app_id).or_insert(AppState {
            pid,
            is_running: false,
        });
    });

    Ok(pid)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LaunchedApps)
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_apps, launch_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
