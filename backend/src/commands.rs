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
    pub icon: Option<String>,
    #[serde(rename = "launchCommand")]
    pub launch_command: String,
}

#[tauri::command]
pub async fn get_app_configs(config_path: String) -> Result<Vec<AppConfig>, String> {
    read_configs_from_file(&config_path).map(|map| map.into_values().collect())
}

fn read_configs_from_file(path: &str) -> Result<HashMap<AppConfigId, AppConfig>, String> {
    match fs::read_to_string(path) {
        Ok(content) => {
            let configs_vec: Vec<AppConfig> =
                serde_json::from_str(&content).map_err(|e| format!("Config parse error: {}", e))?;
            let configs_map = configs_vec
                .into_iter()
                .map(|config| (config.id.clone(), config))
                .collect();
            Ok(configs_map)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(e) => Err(format!("Failed to read config file: {}", e)),
    }
}

fn write_configs_to_file(
    path: &str,
    configs: &HashMap<AppConfigId, AppConfig>,
) -> Result<(), String> {
    let configs_vec: Vec<&AppConfig> = configs.values().collect();
    let content = serde_json::to_string_pretty(&configs_vec)
        .map_err(|e| format!("Serialization error: {}", e))?;
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
                    "Updating app state for {:?} with result: {:?}",
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

async fn upsert_config_in_file(
    config_to_upsert: AppConfig,
    config_path: &str,
) -> Result<HashMap<AppConfigId, AppConfig>, String> {
    let mut configs = read_configs_from_file(config_path)?;

    configs.insert(config_to_upsert.id.clone(), config_to_upsert);

    write_configs_to_file(config_path, &configs)?;

    Ok(configs)
}

#[tauri::command]
pub async fn upsert_app_config(
    config_to_upsert: AppConfig,
    config_path: String,
    app: AppHandle,
) -> Result<(), String> {
    let updated_configs_map = upsert_config_in_file(config_to_upsert, &config_path).await?;
    let updated_configs_vec: Vec<AppConfig> = updated_configs_map.into_values().collect();
    emit_or_log(&app, CONFIG_UPDATE_EVENT, updated_configs_vec);
    Ok(())
}

async fn remove_config_from_file(
    config_id_to_remove: AppConfigId,
    config_path: &str,
    apps_state: &LaunchedApps,
) -> Result<HashMap<AppConfigId, AppConfig>, String> {
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

    if configs.remove(&config_id_to_remove).is_none() {
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
    let updated_configs_map =
        remove_config_from_file(config_id_to_remove, &config_path, &apps_state).await?;
    let updated_configs_vec: Vec<AppConfig> = updated_configs_map.into_values().collect();
    emit_or_log(&app, CONFIG_UPDATE_EVENT, updated_configs_vec);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    // --- Tests for upsert_config_in_file ---

    #[tokio::test]
    async fn test_upsert_config_in_file_insert() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let path_str = temp_file.path().to_str().unwrap();

        fs::write(path_str, "[]").expect("Failed to write empty array");

        let new_config = AppConfig {
            id: AppConfigId("new_app".to_string()),
            name: "New App".to_string(),
            icon: None,
            launch_command: "new_cmd".to_string(),
        };

        let result = upsert_config_in_file(new_config.clone(), path_str).await;

        assert!(result.is_ok());
        let returned_configs_map = result.unwrap();

        assert_eq!(returned_configs_map.len(), 1);
        assert!(returned_configs_map.contains_key(&new_config.id));
        assert_eq!(returned_configs_map.get(&new_config.id), Some(&new_config));

        let read_back_configs_map = read_configs_from_file(path_str).unwrap();
        assert_eq!(read_back_configs_map, returned_configs_map);
    }

    #[tokio::test]
    async fn test_upsert_config_in_file_update() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let path_str = temp_file.path().to_str().unwrap();
        let id_to_update = AppConfigId("app_to_update".to_string());

        let initial_config_original = AppConfig {
            id: id_to_update.clone(),
            name: "App To Update (Original)".to_string(),
            icon: Some("update_original.png".to_string()),
            launch_command: "update_cmd_original".to_string(),
        };
        let other_config = AppConfig {
            id: AppConfigId("other_app".to_string()),
            name: "Other App".to_string(),
            icon: None,
            launch_command: "other_cmd".to_string(),
        };
        let mut initial_configs_map = HashMap::new();
        initial_configs_map.insert(id_to_update.clone(), initial_config_original.clone());
        initial_configs_map.insert(other_config.id.clone(), other_config.clone());

        write_configs_to_file(path_str, &initial_configs_map).unwrap();

        let updated_config = AppConfig {
            id: id_to_update.clone(),
            name: "App To Update (Updated)".to_string(),
            icon: None,
            launch_command: "update_cmd_updated".to_string(),
        };

        let result = upsert_config_in_file(updated_config.clone(), path_str).await;

        assert!(result.is_ok());
        let returned_configs_map = result.unwrap();

        assert_eq!(returned_configs_map.len(), 2);
        assert!(returned_configs_map.contains_key(&id_to_update));
        assert_eq!(
            returned_configs_map.get(&id_to_update),
            Some(&updated_config)
        );
        assert_eq!(
            returned_configs_map.get(&other_config.id),
            Some(&other_config)
        );

        let read_back_configs_map = read_configs_from_file(path_str).unwrap();
        assert_eq!(read_back_configs_map, returned_configs_map);
    }

    #[tokio::test]
    async fn test_upsert_config_in_file_empty_file_insert() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let path_str = temp_file.path().to_str().unwrap();
        fs::write(path_str, "[]").expect("Failed to write empty array");

        let new_config = AppConfig {
            id: AppConfigId("first_app".to_string()),
            name: "First App".to_string(),
            icon: Some("first.ico".to_string()),
            launch_command: "first_cmd".to_string(),
        };

        let result = upsert_config_in_file(new_config.clone(), path_str).await;

        assert!(result.is_ok());
        let returned_configs_map = result.unwrap();

        assert_eq!(returned_configs_map.len(), 1);
        assert!(returned_configs_map.contains_key(&new_config.id));
        assert_eq!(returned_configs_map.get(&new_config.id), Some(&new_config));

        let read_back_configs_map = read_configs_from_file(path_str).unwrap();
        assert_eq!(read_back_configs_map, returned_configs_map);
    }

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
        let config1 = AppConfig {
            id: AppConfigId("test1".to_string()),
                name: "Test App 1".to_string(),
                icon: Some("icon1.png".to_string()),
            launch_command: "cmd1".to_string(),
        };
        let config2 = AppConfig {
            id: AppConfigId("test2".to_string()),
            name: "Test App 2 No Icon".to_string(),
            icon: None,
            launch_command: "cmd2".to_string(),
        };
        let expected_configs_vec = vec![config1.clone(), config2.clone()];
        let json_content =
            serde_json::to_string(&expected_configs_vec).expect("Failed to serialize test data");
        fs::write(temp_file.path(), json_content).expect("Failed to write valid data");

        let result = read_configs_from_file(temp_file.path().to_str().unwrap());
        assert!(result.is_ok());
        let actual_configs_map = result.unwrap();

        let mut expected_configs_map = HashMap::new();
        expected_configs_map.insert(config1.id.clone(), config1);
        expected_configs_map.insert(config2.id.clone(), config2);

        assert_eq!(actual_configs_map.len(), 2);
        assert_eq!(actual_configs_map, expected_configs_map);
    }

    #[test]
    fn test_write_configs_empty() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let configs: HashMap<AppConfigId, AppConfig> = HashMap::new();
        let result = write_configs_to_file(temp_file.path().to_str().unwrap(), &configs);
        assert!(result.is_ok());

        let content = fs::read_to_string(temp_file.path()).expect("Failed to read back file");
        assert_eq!(content.trim(), "[]");
    }

    #[test]
    fn test_write_configs_non_empty() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let config1 = AppConfig {
            id: AppConfigId("app1".to_string()),
                name: "App One".to_string(),
                icon: Some("icon1.png".to_string()),
            launch_command: "command1".to_string(),
        };
        let config2 = AppConfig {
            id: AppConfigId("app2".to_string()),
            name: "App Two".to_string(),
            icon: None,
            launch_command: "command2 --arg".to_string(),
        };
        let mut configs_map = HashMap::new();
        configs_map.insert(config1.id.clone(), config1.clone());
        configs_map.insert(config2.id.clone(), config2.clone());

        let result = write_configs_to_file(temp_file.path().to_str().unwrap(), &configs_map);
        assert!(result.is_ok());

        let content = fs::read_to_string(temp_file.path()).expect("Failed to read back file");
        let read_back_vec: Vec<AppConfig> =
            serde_json::from_str(&content).expect("Failed to parse written content");
        let mut read_back_map = HashMap::new();
        for config in read_back_vec {
            read_back_map.insert(config.id.clone(), config);
        }
        assert_eq!(read_back_map, configs_map);
    }

    #[test]
    fn test_write_then_read_configs() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let path_str = temp_file.path().to_str().unwrap();
        let config1 = AppConfig {
            id: AppConfigId("combo".to_string()),
                name: "Combo App".to_string(),
                icon: Some("combo.ico".to_string()),
            launch_command: "combo --run".to_string(),
        };
        let config2 = AppConfig {
            id: AppConfigId("combo2".to_string()),
            name: "Combo App No Icon".to_string(),
            icon: None,
            launch_command: "combo2 --run".to_string(),
        };
        let mut initial_configs_map = HashMap::new();
        initial_configs_map.insert(config1.id.clone(), config1.clone());
        initial_configs_map.insert(config2.id.clone(), config2.clone());

        // Write
        let write_result = write_configs_to_file(path_str, &initial_configs_map);
        assert!(write_result.is_ok());

        // Read back
        let read_result = read_configs_from_file(path_str);
        assert!(read_result.is_ok());
        let read_configs_map = read_result.unwrap();
        assert_eq!(read_configs_map, initial_configs_map);
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

        let config1 = AppConfig {
            id: AppConfigId("app1".to_string()),
            name: "App One".to_string(),
            icon: Some("icon1.png".to_string()),
            launch_command: "cmd1".to_string(),
        };
        let config_to_remove = AppConfig {
            id: id_to_remove.clone(),
            name: "App To Remove".to_string(),
            icon: Some("remove.png".to_string()),
            launch_command: "remove_cmd".to_string(),
        };
        let config3 = AppConfig {
            id: AppConfigId("app3".to_string()),
            name: "App Three".to_string(),
            icon: None,
            launch_command: "cmd3".to_string(),
        };
        let mut initial_configs_map = HashMap::new();
        initial_configs_map.insert(config1.id.clone(), config1.clone());
        initial_configs_map.insert(id_to_remove.clone(), config_to_remove.clone());
        initial_configs_map.insert(config3.id.clone(), config3.clone());

        write_configs_to_file(temp_file.path().to_str().unwrap(), &initial_configs_map)
            .expect("Failed to write initial config");

        let result = remove_config_from_file(
            id_to_remove.clone(),
            temp_file.path().to_str().unwrap(),
            &apps_state,
        )
        .await;

        assert!(result.is_ok());
        let remaining_configs_map = result.unwrap();
        assert_eq!(remaining_configs_map.len(), 2);
        assert!(!remaining_configs_map.contains_key(&id_to_remove));
        assert!(remaining_configs_map.contains_key(&config1.id));
        assert!(remaining_configs_map.contains_key(&config3.id));

        let read_back_map = read_configs_from_file(temp_file.path().to_str().unwrap())
            .expect("Failed to read config file after removal");
        assert_eq!(read_back_map, remaining_configs_map);
    }

    #[tokio::test]
    async fn test_remove_config_from_file_not_found() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let apps_state = LaunchedApps::default();
        let config1 = AppConfig {
            id: AppConfigId("app1".to_string()),
            name: "App One".to_string(),
            icon: Some("icon1.png".to_string()),
            launch_command: "cmd1".to_string(),
        };
        let mut initial_configs_map = HashMap::new();
        initial_configs_map.insert(config1.id.clone(), config1.clone());

        write_configs_to_file(temp_file.path().to_str().unwrap(), &initial_configs_map)
            .expect("Failed to write initial config");

        let id_to_remove = AppConfigId("non_existent_app".to_string());
        let result = remove_config_from_file(
            id_to_remove.clone(),
            temp_file.path().to_str().unwrap(),
            &apps_state,
        )
        .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains(&format!("Config with ID '{:?}' not found.", id_to_remove)));

        let read_back_map = read_configs_from_file(temp_file.path().to_str().unwrap())
            .expect("Failed to read config file after failed removal attempt");
        assert_eq!(read_back_map, initial_configs_map);
    }

    #[tokio::test]
    async fn test_remove_config_from_file_empty_file() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let apps_state = LaunchedApps::default();
        let empty_map: HashMap<AppConfigId, AppConfig> = HashMap::new();
        write_configs_to_file(temp_file.path().to_str().unwrap(), &empty_map)
            .expect("Failed to write empty map");

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

        let read_back_map = read_configs_from_file(temp_file.path().to_str().unwrap())
            .expect("Failed to read config file after failed removal attempt");
        assert!(read_back_map.is_empty());
    }

    #[tokio::test]
    async fn test_remove_config_from_file_app_running() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let apps_state = LaunchedApps::default();
        let id_to_remove = AppConfigId("running_app".to_string());

        // Setup: Add a "running" app state
        {
            let mut guard = apps_state.0.lock().await;
            let dummy_child = Command::new("sleep")
                .arg("60")
                .spawn()
                .expect("Failed to spawn dummy child");
            let pid = dummy_child.id().unwrap();
            guard.insert(
                id_to_remove.clone(),
                AppState {
                    info: AppStateInfo {
                        config_id: id_to_remove.clone(),
                        pid,
                        exit_result: None,
                    },
                    process: AppProcess {
                        child: Arc::new(Mutex::new(dummy_child)),
                    },
                },
            );
        }

        let config_to_remove = AppConfig {
            id: id_to_remove.clone(),
            name: "Running App".to_string(),
            icon: Some("running.png".to_string()),
            launch_command: "run_cmd".to_string(),
        };
        let mut initial_configs_map = HashMap::new();
        initial_configs_map.insert(id_to_remove.clone(), config_to_remove.clone());
        write_configs_to_file(temp_file.path().to_str().unwrap(), &initial_configs_map)
            .expect("Failed to write initial config");

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

        {
            let mut guard = apps_state.0.lock().await;
            if let Some(state) = guard.get_mut(&id_to_remove) {
                let _ = state.process.child.lock().await.kill().await;
            }
        }
    }
}
