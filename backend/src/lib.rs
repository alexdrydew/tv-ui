use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::{collections::HashMap, os::unix::process::ExitStatusExt, sync::Arc};
use tauri::Emitter;
use tauri::{AppHandle, State};
use tokio::process::Child;
use tokio::time::sleep;
use tokio::{process::Command, sync::Mutex};

const APP_UPDATE_EVENT: &str = "app-updated";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppStateInfo {
    #[serde(rename = "configId")]
    config_id: String,
    pid: u32,
    #[serde(rename = "exitResult")]
    exit_result: Option<AppExitResult>,
}

#[derive(Clone)]
struct AppProcess {
    child: Arc<Mutex<Child>>,
}

#[derive(Clone)]
struct AppState {
    info: AppStateInfo,
    process: AppProcess,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppConfig {
    id: String,
    name: String,
    icon: String,
    #[serde(rename = "launchCommand")]
    launch_command: String,
}

#[tauri::command]
async fn get_app_configs(config_path: String) -> Result<Vec<AppConfig>, String> {
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

impl AppState {
    fn is_running(&self) -> bool {
        self.info.exit_result.is_none()
    }
}

struct LaunchedApps(Arc<Mutex<HashMap<String, AppState>>>);

impl Default for LaunchedApps {
    fn default() -> Self {
        LaunchedApps(Arc::new(Mutex::new(HashMap::new())))
    }
}

fn emit_or_log(app: &AppHandle, event: &str, payload: impl Serialize + Clone) {
    let res = app.emit(event, payload);
    if let Err(error) = res {
        log::error!("{error}");
    }
}

#[derive(Copy, Clone)]
struct WaitChildParams {
    timeout: Duration,
}

impl Default for WaitChildParams {
    fn default() -> Self {
        WaitChildParams {
            timeout: Duration::from_millis(100),
        }
    }
}

// this methods locks the mutex and checks if the child process has exited every timeout
// TODO: do I really need this? mb I can just send signal from kill instead of accessing the mutex
async fn wait_child_with_mutex(child: Arc<Mutex<Child>>, params: WaitChildParams) -> AppExitResult {
    loop {
        let res = {
            let mut guard = child.lock().await;
            guard.try_wait()
        };

        match res {
            Ok(Some(status)) => {
                log::debug!("Process exited with status: {:?}", status);
                return {
                    if status.success() {
                        AppExitResult::Success
                    } else if let Some(code) = status.code() {
                        log::debug!("Process exited with code: {}", code);
                        AppExitResult::ExitCode(code)
                    } else if let Some(signal) = status.stopped_signal() {
                        log::debug!("Process stopped by signal: {}", signal);
                        AppExitResult::Signal(signal)
                    } else if let Some(signal) = status.signal() {
                        log::debug!("Process terminated by signal: {}", signal);
                        AppExitResult::Signal(signal)
                    } else {
                        log::debug!("Process exited with unknown status");
                        AppExitResult::Unknown
                    }
                };
            }
            Ok(None) => {
                sleep(params.timeout).await;
            }
            Err(e) => {
                log::error!("Error waiting for process: {}", e);
                return AppExitResult::Unknown;
            }
        }
    }
}

async fn run_process_watcher(app: AppHandle, apps_state: LaunchedApps, config_id: String) {
    let process = {
        let map_guard = apps_state.0.lock().await;
        map_guard
            .get(&config_id)
            .map(|state| Arc::clone(&state.process.child))
    };

    match process {
        Some(process) => {
            let result = wait_child_with_mutex(process, WaitChildParams::default()).await;
            let mut map_guard = apps_state.0.lock().await;
            if let Some(app_state) = map_guard.get_mut(&config_id) {
                log::debug!(
                    "Updating app state for {} with result: {:?}",
                    config_id,
                    result
                );
                app_state.info.exit_result = Some(result);
                emit_or_log(&app, APP_UPDATE_EVENT, app_state.info.clone());
            } else {
                log::debug!("App {} not found in state map", config_id);
            }
        }
        None => {
            log::warn!("Process not found for config_id: {}", config_id);
        }
    }
}

#[tauri::command]
async fn launch_app(
    command: String,
    config_id: String,
    apps_state: State<'_, LaunchedApps>,
    app: AppHandle,
) -> Result<AppStateInfo, String> {
    let mut map_guard = apps_state.0.lock().await;
    if let Some(prev_app_state) = map_guard.get(&config_id) {
        if prev_app_state.is_running() {
            return Err("Application is already started".to_owned());
        }
    }

    let cmd_parts: Vec<&str> = command.split_whitespace().collect();
    let (cmd, args) = cmd_parts.split_first().ok_or("Empty command")?;

    let child = Command::new(cmd)
        .args(args)
        .spawn()
        .map_err(|e| format!("Launch error: {}", e))?;

    let pid = child.id().ok_or("Application immediately closed")?;

    let state = AppState {
        info: AppStateInfo {
            config_id: config_id.to_owned(),
            pid,
            exit_result: None,
        },
        process: AppProcess {
            child: Arc::new(Mutex::new(child)),
        },
    };

    tokio::spawn(run_process_watcher(
        app.to_owned(),
        LaunchedApps(Arc::clone(&apps_state.0)),
        config_id.to_owned(),
    ));
    map_guard.insert(config_id.to_owned(), state.clone());
    emit_or_log(&app, APP_UPDATE_EVENT, state.info.clone());
    Ok(state.info)
}

#[tauri::command]
async fn kill_app(config_id: String, apps_state: State<'_, LaunchedApps>) -> Result<(), String> {
    let mut map_guard = apps_state.0.lock().await;

    if let Some(state) = map_guard.get_mut(&config_id) {
        let mut child = state.process.child.lock().await;
        child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        Ok(())
    } else {
        Err("App not found".to_owned())
    }
}

#[tauri::command]
async fn get_command(
    config_id: String,
    apps_state: State<'_, LaunchedApps>,
) -> Result<Option<AppStateInfo>, ()> {
    let map_guard = apps_state.0.lock().await;
    Ok(map_guard.get(&config_id).map(|s| s.info.clone()))
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
        .invoke_handler(tauri::generate_handler![
            get_app_configs,
            get_command,
            launch_app,
            kill_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::WebviewWindow;
    fn create_test_app() -> (tauri::App<MockRuntime>, WebviewWindow<MockRuntime>) {
        let app = mock_builder()
            .manage(LaunchedApps::default())
            .invoke_handler(tauri::generate_handler![
                get_app_configs,
                get_command
            ])
            .build(mock_context(noop_assets()))
            .expect("failed to build mock app");


        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("Failed to create webview window");
        (app, webview)
    }

    #[tokio::test]
    async fn test_get_command_not_found() {
        let (_app, webview) = create_test_app();

        let config_id = "non_existent_app".to_string();
        let response = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "get_command".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(serde_json::json!({ "configId": config_id })),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        )
        .expect("Failed to get IPC response");
        let result_value: Option<AppStateInfo> = response
            .deserialize()
            .expect("Failed to deserialize response body");
        assert!(result_value.is_none());
    }

}
