pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::LaunchedApps::default())
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
            commands::get_app_configs,
            commands::get_app_state,
            commands::launch_app,
            commands::kill_app,
            commands::create_app_config,
            commands::remove_app_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::commands::{self, AppConfig, AppProcess, AppState, AppStateInfo, LaunchedApps};
    use std::{fs, sync::Arc, time::Duration};
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
    use tauri::{ipc, Manager, WebviewWindow};
    use tempfile::NamedTempFile;
    use tokio::{
        process::{Child, Command},
        sync::Mutex,
    };

    fn create_test_app() -> (tauri::App<MockRuntime>, WebviewWindow<MockRuntime>) {
        let app = mock_builder()
            .manage(commands::LaunchedApps::default())
            // can't test launch_app due to https://github.com/tauri-apps/tauri/issues/12077
            .invoke_handler(tauri::generate_handler![
                commands::get_app_configs,
                commands::get_app_state,
                commands::kill_app
            ])
            .build(mock_context(noop_assets()))
            .expect("failed to build mock app");

        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("Failed to create webview window");
        (app, webview)
    }

    async fn setup_running_app_state(
        apps_state: &LaunchedApps,
        config_id: AppConfigId,
        sleep_duration: &str,
    ) -> (AppStateInfo, Arc<Mutex<Child>>) {
        let mut apps_guard = apps_state.0.lock().await;
        let child = Command::new("sleep")
            .arg(sleep_duration)
            .spawn()
            .expect("Failed to spawn dummy process");
        let pid = child.id().expect("Failed to get PID");
        let child_arc = Arc::new(Mutex::new(child));

        let state_info = AppStateInfo {
            config_id: config_id.clone(),
            pid,
            exit_result: None,
        };
        let app_state = AppState {
            info: state_info.clone(),
            process: AppProcess {
                child: Arc::clone(&child_arc),
            },
        };
        apps_guard.insert(config_id.clone(), app_state);
        (state_info, child_arc)
    }

    #[tokio::test]
    async fn test_get_app_state_not_found() {
        let (_app, webview) = create_test_app();

        let config_id = commands::AppConfigId("non_existent_app".to_string());
        let response = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "get_app_state".into(),
                callback: ipc::CallbackFn(0),
                error: ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: ipc::InvokeBody::Json(serde_json::json!({ "configId": config_id })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .expect("Failed to get IPC response");
        let result_value: Option<AppStateInfo> = response
            .deserialize()
            .expect("Failed to deserialize response body");
        assert!(result_value.is_none());
    }

    #[tokio::test]
    async fn test_get_app_state_found() {
        let (app, webview) = create_test_app();
        let launched_apps_state = app.state::<LaunchedApps>();
        let config_id = "test_app".to_string();

        let (mock_state_info, _child_arc) =
            setup_running_app_state(&launched_apps_state, config_id.clone(), "100").await;

        let response = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "get_app_state".into(),
                callback: ipc::CallbackFn(0),
                error: ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: ipc::InvokeBody::Json(serde_json::json!({ "configId": config_id })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .expect("Failed to get IPC response");

        let result_value: Option<AppStateInfo> = response
            .deserialize()
            .expect("Failed to deserialize response body");

        assert!(result_value.is_some());
        let returned_state = result_value.unwrap();
        assert_eq!(returned_state.config_id, mock_state_info.config_id);
        assert_eq!(returned_state.pid, mock_state_info.pid);
        assert!(returned_state.exit_result.is_none());
    }

    #[tokio::test]
    async fn test_kill_app_success() {
        let (app, webview) = create_test_app();
        let launched_apps_state = app.state::<LaunchedApps>();
        let config_id = commands::AppConfigId("test_kill_app".to_string());

        let (_mock_state_info, child_arc) =
            setup_running_app_state(&launched_apps_state, config_id.clone(), "60").await;

        let response = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "kill_app".into(),
                callback: ipc::CallbackFn(0),
                error: ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: ipc::InvokeBody::Json(serde_json::json!({ "configId": config_id })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .expect("Failed to get IPC response for kill_app");

        let _: () = response
            .deserialize()
            .expect("Failed to deserialize kill_app response (expected null)");
        tokio::time::sleep(Duration::from_millis(100)).await;
        let mut child_guard = child_arc.lock().await;
        let status = child_guard
            .try_wait()
            .expect("Failed to check process status");
        assert!(status.is_some(), "Process should have exited after kill");
    }

    #[tokio::test]
    async fn test_kill_app_not_found() {
        let (_app, webview) = create_test_app();

        let config_id = commands::AppConfigId("non_existent_app_to_kill".to_string());

        let result = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "kill_app".into(),
                callback: ipc::CallbackFn(0),
                error: ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: ipc::InvokeBody::Json(serde_json::json!({ "configId": config_id })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        );

        assert!(result.is_err());
        let err_val = result.unwrap_err();
        let err_msg = err_val.as_str().expect("Error payload should be a string");
        assert!(
            err_msg.contains("App not found"),
            "Unexpected error message: {}",
            err_msg
        );
    }

    #[tokio::test]
    async fn test_get_app_configs_file_not_found() {
        let (_app, webview) = create_test_app();
        let non_existent_path = "this/path/surely/does/not/exist.json".to_string();

        let response = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "get_app_configs".into(),
                callback: ipc::CallbackFn(0),
                error: ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: ipc::InvokeBody::Json(serde_json::json!({ "configPath": non_existent_path })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .expect("Failed to get IPC response for get_app_configs (not found)");

        let result_value: Vec<AppConfig> = response
            .deserialize()
            .expect("Failed to deserialize get_app_configs response");

        assert!(result_value.is_empty());
    }

    #[tokio::test]
    async fn test_get_app_configs_invalid_json() {
        let (_app, webview) = create_test_app();
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        fs::write(temp_file.path(), "this is not valid json")
            .expect("Failed to write to temp file");

        let result = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "get_app_configs".into(),
                callback: ipc::CallbackFn(0),
                error: ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: ipc::InvokeBody::Json(serde_json::json!({ "configPath": temp_file.path() })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        );

        assert!(result.is_err());
        let err_val = result.unwrap_err();
        let err_msg = err_val.as_str().expect("Error payload should be a string");
        assert!(
            err_msg.contains("Config parse error"),
            "Unexpected error message: {}",
            err_msg
        );
    }

    #[tokio::test]
    async fn test_get_app_configs_success() {
        let (_app, webview) = create_test_app();
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let expected_configs = vec![
            AppConfig {
                id: commands::AppConfigId("app1".to_string()),
                name: "App One".to_string(),
                icon: "icon1.png".to_string(),
                launch_command: "command1".to_string(),
            },
            AppConfig {
                id: commands::AppConfigId("app2".to_string()),
                name: "App Two".to_string(),
                icon: "icon2.png".to_string(),
                launch_command: "command2 --arg".to_string(),
            },
        ];
        let json_content =
            serde_json::to_string(&expected_configs).expect("Failed to serialize test data");
        fs::write(temp_file.path(), json_content).expect("Failed to write to temp file");

        let response = tauri::test::get_ipc_response::<WebviewWindow<MockRuntime>>(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "get_app_configs".into(),
                callback: ipc::CallbackFn(0),
                error: ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: ipc::InvokeBody::Json(serde_json::json!({ "configPath": temp_file.path() })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .expect("Failed to get IPC response for get_app_configs (success)");

        let result_value: Vec<AppConfig> = response
            .deserialize()
            .expect("Failed to deserialize get_app_configs response");

        assert_eq!(result_value.len(), expected_configs.len());
        for expected in expected_configs.iter() {
            assert!(
                result_value.iter().any(|result| result.id == expected.id
                    && result.name == expected.name
                    && result.icon == expected.icon
                    && result.launch_command == expected.launch_command),
                "Expected config not found: {:?}",
                expected
            );
        }
    }
}
