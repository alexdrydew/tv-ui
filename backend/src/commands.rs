use serde::{Deserialize, Serialize};
use std::fs;
use std::hash::Hash;
use std::time::Duration;
use std::{collections::HashMap, os::unix::process::ExitStatusExt, sync::Arc};
use tauri::Emitter;
use tauri::{AppHandle, State};
use tokio::process::Child;
use tokio::time::sleep;
use tokio::{process::Command, sync::Mutex};

const APP_UPDATE_EVENT: &str = "app-updated";
const CONFIG_UPDATE_EVENT: &str = "config-updated";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
pub struct AppConfigId(pub String);

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct AppStateInfo {
    #[serde(rename = "configId")]
    pub config_id: AppConfigId,
    pub pid: u32,
    #[serde(rename = "exitResult")]
    pub exit_result: Option<AppExitResult>,
}

#[derive(Clone)]
pub struct AppProcess {
    pub child: Arc<Mutex<Child>>,
}

#[derive(Clone)]
pub struct AppState {
    pub info: AppStateInfo,
    pub process: AppProcess,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct AppConfig {
    pub id: AppConfigId,
    pub name: String,
    pub icon: String,
    #[serde(rename = "launchCommand")]
    pub launch_command: String,
}

#[tauri::command]
pub async fn get_app_configs(config_path: String) -> Result<Vec<AppConfig>, String> {
    read_configs_from_file(&config_path)
}

fn read_configs_from_file(path: &str) -> Result<Vec<AppConfig>, String> {
    match fs::read_to_string(path) {
        Ok(content) => {
            serde_json::from_str(&content).map_err(|e| format!("Config parse error: {}", e))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(format!("Failed to read config file: {}", e)),
    }
}

fn write_configs_to_file(path: &str, configs: &[AppConfig]) -> Result<(), String> {
    let content =
        serde_json::to_string_pretty(configs).map_err(|e| format!("Serialization error: {}", e))?;
    fs::write(path, content).map_err(|e| format!("Failed to write config file: {}", e))
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone, PartialEq)]
pub enum AppExitResult {
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

pub struct LaunchedApps(pub Arc<Mutex<HashMap<AppConfigId, AppState>>>);

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

async fn run_process_watcher(app: AppHandle, apps_state: LaunchedApps, config_id: AppConfigId) {
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
                    "Updating app state for {:?} with result: {:?}", // Changed {} to {:?}
                    config_id,
                    result
                );
                app_state.info.exit_result = Some(result);
                emit_or_log(&app, APP_UPDATE_EVENT, app_state.info.clone());
            } else {
                log::debug!("App {:?} not found in state map", config_id);
            }
        }
        None => {
            log::warn!("Process not found for config_id: {:?}", config_id);
        }
    }
}

#[tauri::command]
pub async fn launch_app(
    command: String,
    config_id: AppConfigId,
    apps_state: State<'_, LaunchedApps>,
    app: AppHandle,
) -> Result<AppStateInfo, String> {
    let mut map_guard = apps_state.0.lock().await;
    if let Some(prev_app_state) = map_guard.get(&config_id) {
        if prev_app_state.is_running() {
            return Err(format!("Application {:?} is already started", config_id));
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
            config_id: config_id.clone(),
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
        config_id.clone(),
    ));
    map_guard.insert(config_id.clone(), state.clone());
    emit_or_log(&app, APP_UPDATE_EVENT, state.info.clone());
    Ok(state.info)
}

#[tauri::command]
pub async fn kill_app(
    config_id: AppConfigId,
    apps_state: State<'_, LaunchedApps>,
) -> Result<(), String> {
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
pub async fn get_app_state(
    config_id: AppConfigId,
    apps_state: State<'_, LaunchedApps>,
) -> Result<Option<AppStateInfo>, ()> {
    let map_guard = apps_state.0.lock().await;
    Ok(map_guard.get(&config_id).map(|s| s.info.clone()))
}

#[tauri::command]
pub async fn create_app_config(
    new_config: AppConfig,
    config_path: String,
    app: AppHandle,
) -> Result<(), String> {
    let mut configs = read_configs_from_file(&config_path)?;

    if configs.iter().any(|c| c.id == new_config.id) {
        return Err(format!(
            "Config with ID '{:?}' already exists.",
            new_config.id
        ));
    }

    configs.push(new_config);

    write_configs_to_file(&config_path, &configs)?;

    emit_or_log(&app, CONFIG_UPDATE_EVENT, configs);

    Ok(())
}

async fn remove_config_from_file(
    config_id_to_remove: AppConfigId,
    config_path: &str,
    apps_state: &LaunchedApps,
) -> Result<Vec<AppConfig>, String> {
    {
        let apps_guard = apps_state.0.lock().await;
        if let Some(state) = apps_guard.get(&config_id_to_remove) {
            if state.is_running() {
                return Err(format!(
                    "Cannot remove config for running app: {:?}",
                    config_id_to_remove
                ));
            }
        }
    }

    let mut configs = read_configs_from_file(config_path)?;

    let initial_len = configs.len();
    configs.retain(|c| c.id != config_id_to_remove);

    if configs.len() == initial_len {
        return Err(format!(
            "Config with ID '{:?}' not found.",
            config_id_to_remove
        ));
    }

    write_configs_to_file(config_path, &configs)?;

    Ok(configs)
}

#[tauri::command]
pub async fn remove_app_config(
    config_id_to_remove: AppConfigId,
    config_path: String,
    app: AppHandle,
    apps_state: State<'_, LaunchedApps>,
) -> Result<(), String> {
    let updated_configs =
        remove_config_from_file(config_id_to_remove, &config_path, &apps_state).await?;
    emit_or_log(&app, CONFIG_UPDATE_EVENT, updated_configs);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile; // Added import

    // --- Tests for read_configs_from_file ---

    #[test]
    fn test_read_configs_file_not_found() {
        let non_existent_path = "this/path/definitely/does/not/exist.json";
        let result = read_configs_from_file(non_existent_path);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_read_configs_invalid_json() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        fs::write(temp_file.path(), "this is not valid json")
            .expect("Failed to write invalid json");
        let result = read_configs_from_file(temp_file.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Config parse error"));
    }

    #[test]
    fn test_read_configs_empty_array() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        fs::write(temp_file.path(), "[]").expect("Failed to write empty array");
        let result = read_configs_from_file(temp_file.path().to_str().unwrap());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_read_configs_valid_data() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let expected_configs = vec![AppConfig {
            id: AppConfigId("test1".to_string()),
            name: "Test App 1".to_string(),
            icon: "icon1.png".to_string(),
            launch_command: "cmd1".to_string(),
        }];
        let json_content =
            serde_json::to_string(&expected_configs).expect("Failed to serialize test data");
        fs::write(temp_file.path(), json_content).expect("Failed to write valid data");

        let result = read_configs_from_file(temp_file.path().to_str().unwrap());
        assert!(result.is_ok());
        let actual_configs = result.unwrap();
        assert_eq!(actual_configs, expected_configs);
    }

    #[test]
    fn test_write_configs_empty() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let configs: Vec<AppConfig> = vec![];
        let result = write_configs_to_file(temp_file.path().to_str().unwrap(), &configs);
        assert!(result.is_ok());

        let content = fs::read_to_string(temp_file.path()).expect("Failed to read back file");
        // Expecting pretty-printed empty array
        assert_eq!(content.trim(), "[]");
    }

    #[test]
    fn test_write_configs_non_empty() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let configs = vec![
            AppConfig {
                id: AppConfigId("app1".to_string()),
                name: "App One".to_string(),
                icon: "icon1.png".to_string(),
                launch_command: "command1".to_string(),
            },
            AppConfig {
                id: AppConfigId("app2".to_string()),
                name: "App Two".to_string(),
                icon: "icon2.png".to_string(),
                launch_command: "command2 --arg".to_string(),
            },
        ];
        let result = write_configs_to_file(temp_file.path().to_str().unwrap(), &configs);
        assert!(result.is_ok());

        let content = fs::read_to_string(temp_file.path()).expect("Failed to read back file");
        let expected_content =
            serde_json::to_string_pretty(&configs).expect("Failed to serialize expected data");
        assert_eq!(content, expected_content);
    }

    #[test]
    fn test_write_then_read_configs() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let path_str = temp_file.path().to_str().unwrap();
        let initial_configs = vec![AppConfig {
            id: AppConfigId("combo".to_string()),
            name: "Combo App".to_string(),
            icon: "combo.ico".to_string(),
            launch_command: "combo --run".to_string(),
        }];

        // Write
        let write_result = write_configs_to_file(path_str, &initial_configs);
        assert!(write_result.is_ok());

        // Read back
        let read_result = read_configs_from_file(path_str);
        assert!(read_result.is_ok());
        let read_configs = read_result.unwrap();
        assert_eq!(read_configs, initial_configs);
    }

    #[tokio::test]
    async fn test_wait_child_success() {
        let child = Command::new("sh")
            .arg("-c")
            .arg("exit 0")
            .spawn()
            .expect("Failed to spawn success process");
        let child_arc = Arc::new(Mutex::new(child));
        let result = wait_child_with_mutex(child_arc, WaitChildParams::default()).await;
        assert!(matches!(result, AppExitResult::Success));
    }

    #[tokio::test]
    async fn test_wait_child_exit_code() {
        let child = Command::new("sh")
            .arg("-c")
            .arg("exit 42")
            .spawn()
            .expect("Failed to spawn exit code process");
        let child_arc = Arc::new(Mutex::new(child));
        let result = wait_child_with_mutex(child_arc, WaitChildParams::default()).await;
        assert!(matches!(result, AppExitResult::ExitCode(42)));
    }

    // --- Tests for remove_config_from_file ---

    #[tokio::test]
    async fn test_remove_config_from_file_success() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let id_to_remove = AppConfigId("app_to_remove".to_string());
        let apps_state = LaunchedApps::default();
        let initial_configs = vec![
            AppConfig {
                id: AppConfigId("app1".to_string()),
                name: "App One".to_string(),
                icon: "icon1.png".to_string(),
                launch_command: "cmd1".to_string(),
            },
            AppConfig {
                id: id_to_remove.clone(),
                name: "App To Remove".to_string(),
                icon: "remove.png".to_string(),
                launch_command: "remove_cmd".to_string(),
            },
            AppConfig {
                id: AppConfigId("app3".to_string()),
                name: "App Three".to_string(),
                icon: "icon3.png".to_string(),
                launch_command: "cmd3".to_string(),
            },
        ];
        let json_content =
            serde_json::to_string(&initial_configs).expect("Failed to serialize initial data");
        fs::write(temp_file.path(), json_content).expect("Failed to write initial config");

        let result = remove_config_from_file(
            id_to_remove.clone(),
            temp_file.path().to_str().unwrap(),
            &apps_state,
        )
        .await;

        assert!(result.is_ok());
        let remaining_configs = result.unwrap();
        assert_eq!(remaining_configs.len(), 2);
        assert!(!remaining_configs.iter().any(|c| c.id == id_to_remove));
        assert!(remaining_configs
            .iter()
            .any(|c| c.id == AppConfigId("app1".to_string())));
        assert!(remaining_configs
            .iter()
            .any(|c| c.id == AppConfigId("app3".to_string())));

        // Verify file content
        let content =
            fs::read_to_string(temp_file.path()).expect("Failed to read config file after removal");
        let read_back_configs: Vec<AppConfig> =
            serde_json::from_str(&content).expect("Failed to parse updated config file");
        assert_eq!(read_back_configs, remaining_configs);
    }

    #[tokio::test]
    async fn test_remove_config_from_file_not_found() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let apps_state = LaunchedApps::default();
        let initial_configs = vec![AppConfig {
            id: AppConfigId("app1".to_string()),
            name: "App One".to_string(),
            icon: "icon1.png".to_string(),
            launch_command: "cmd1".to_string(),
        }];
        let json_content =
            serde_json::to_string(&initial_configs).expect("Failed to serialize initial data");
        fs::write(temp_file.path(), json_content).expect("Failed to write initial config");

        let id_to_remove = AppConfigId("non_existent_app".to_string());
        let result = remove_config_from_file(
            // Call the new function
            id_to_remove.clone(),
            temp_file.path().to_str().unwrap(),
            &apps_state,
        )
        .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains(&format!("Config with ID '{:?}' not found.", id_to_remove)));

        // Verify file content hasn't changed
        let content = fs::read_to_string(temp_file.path())
            .expect("Failed to read config file after failed removal attempt");
        let read_back_configs: Vec<AppConfig> =
            serde_json::from_str(&content).expect("Failed to parse original config file");
        assert_eq!(read_back_configs, initial_configs);
    }

    #[tokio::test]
    async fn test_remove_config_from_file_empty_file() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let apps_state = LaunchedApps::default(); // Need default state
        fs::write(temp_file.path(), "[]").expect("Failed to write empty array");

        let id_to_remove = AppConfigId("any_id".to_string());
        let result = remove_config_from_file(
            id_to_remove.clone(),
            temp_file.path().to_str().unwrap(),
            &apps_state,
        )
        .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains(&format!("Config with ID '{:?}' not found.", id_to_remove)));

        // Verify file content hasn't changed
        let content = fs::read_to_string(temp_file.path())
            .expect("Failed to read config file after failed removal attempt");
        assert_eq!(content.trim(), "[]");
    }

    #[tokio::test]
    async fn test_remove_config_from_file_app_running() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let apps_state = LaunchedApps::default();
        let id_to_remove = AppConfigId("running_app".to_string());

        // Setup: Add a "running" app state
        {
            let mut guard = apps_state.0.lock().await;
            let dummy_child = Command::new("sleep") // Use a real command that can be spawned
                .arg("60") // Sleep long enough for the test
                .spawn()
                .expect("Failed to spawn dummy child");
            let pid = dummy_child.id().unwrap();
            guard.insert(
                id_to_remove.clone(),
                AppState {
                    info: AppStateInfo {
                        config_id: id_to_remove.clone(),
                        pid,
                        exit_result: None, // None indicates running
                    },
                    process: AppProcess {
                        child: Arc::new(Mutex::new(dummy_child)),
                    },
                },
            );
        }

        // Setup: Write config file containing the app to remove
        let initial_configs = vec![AppConfig {
            id: id_to_remove.clone(),
            name: "Running App".to_string(),
            icon: "running.png".to_string(),
            launch_command: "run_cmd".to_string(),
        }];
        let json_content =
            serde_json::to_string(&initial_configs).expect("Failed to serialize initial data");
        fs::write(temp_file.path(), json_content).expect("Failed to write initial config");

        // Act
        let result = remove_config_from_file(
            id_to_remove.clone(),
            temp_file.path().to_str().unwrap(),
            &apps_state,
        )
        .await;

        // Assert
        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("Cannot remove config for running app"));

        // Cleanup: Kill the dummy process if it's still running
        {
            let mut guard = apps_state.0.lock().await;
            if let Some(state) = guard.get_mut(&id_to_remove) {
                let _ = state.process.child.lock().await.kill().await;
            }
        }
    }
}
