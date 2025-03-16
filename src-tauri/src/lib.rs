use std::{collections::HashMap, os::unix::process::ExitStatusExt, sync::Arc};
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

#[derive(Debug, Serialize, Deserialize, Copy, Clone)]
enum AppExitResult {
    Success,
    ExitCode(i32),
    Signal(i32),
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone)]
struct AppState {
    pid: u32,
    exit_result: Option<AppExitResult>,
}

impl AppState {
    fn is_running(&self) -> bool {
        self.exit_result.is_none()
    }
}

struct LaunchedApps(Arc<Mutex<HashMap<String, AppState>>>);

impl Default for LaunchedApps {
    fn default() -> Self {
        LaunchedApps(Arc::new(Mutex::new(HashMap::new())))
    }
}

#[tauri::command]
async fn launch_app(
    executable_path: String,
    app_id: String,
    apps_state: State<'_, LaunchedApps>,
) -> Result<u32, String> {
    let mut map_guard = apps_state.0.lock().await;
    if let Some(prev_app_state) = map_guard.get(&app_id) {
        if prev_app_state.is_running() {
            return Err(format!("Application {} is already started", app_id));
        }
    }

    let mut child = Command::new(executable_path)
        .spawn()
        .map_err(|e| format!("Launch error: {}", e))?;

    let pid = child.id().ok_or("Application immediately closed")?;
    map_guard.entry(app_id.to_owned()).or_insert(AppState {
        pid,
        exit_result: None,
    });
    drop(map_guard);

    let apps_state = Arc::clone(&apps_state.0);
    tokio::spawn(async move {
        let result = match child.wait().await {
            Ok(status) => {
                if status.success() {
                    AppExitResult::Success
                } else if let Some(code) = status.code() {
                    AppExitResult::ExitCode(code)
                } else if let Some(signal) = status.stopped_signal() {
                    AppExitResult::Signal(signal)
                } else {
                    AppExitResult::Unknown
                }
            }
            Err(_) => AppExitResult::Unknown,
        };

        let mut map_guard = apps_state.lock().await;
        if let Some(app_state) = map_guard.get_mut(&app_id) {
            app_state.exit_result = Some(result);
        }
    });

    Ok(pid)
}

#[tauri::command]
async fn get_command(
    app_id: String,
    apps_state: State<'_, LaunchedApps>,
) -> Result<Option<AppState>, ()> {
    let map_guard = apps_state.0.lock().await;
    Ok(map_guard.get(&app_id).map(|s| s.to_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LaunchedApps::default())
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
        .invoke_handler(tauri::generate_handler![get_apps, launch_app, get_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
