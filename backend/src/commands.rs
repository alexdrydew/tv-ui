use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Duration;
use std::{collections::HashMap, os::unix::process::ExitStatusExt, sync::Arc};
use tauri::Emitter;
use tauri::{AppHandle, State};
use tokio::process::Child;
use tokio::time::sleep;
use tokio::{process::Command, sync::Mutex};

const APP_UPDATE_EVENT: &str = "app-updated";
const CONFIG_UPDATE_EVENT: &str = "config-updated";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct AppStateInfo {
    #[serde(rename = "configId")]
    pub config_id: String,
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
    pub id: String,
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

pub struct LaunchedApps(pub Arc<Mutex<HashMap<String, AppState>>>);

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
pub async fn launch_app(
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
pub async fn kill_app(
    config_id: String,
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
    config_id: String,
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
            "Config with ID '{}' already exists.",
            new_config.id
        ));
    }

    configs.push(new_config);

    write_configs_to_file(&config_path, &configs)?;

    emit_or_log(&app, CONFIG_UPDATE_EVENT, configs);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

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
            id: "test1".to_string(),
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
                id: "app1".to_string(),
                name: "App One".to_string(),
                icon: "icon1.png".to_string(),
                launch_command: "command1".to_string(),
            },
            AppConfig {
                id: "app2".to_string(),
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
            id: "combo".to_string(),
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
}
