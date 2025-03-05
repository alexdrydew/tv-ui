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
async fn get_apps() -> Result<Vec<AppConfig>, String> {
    let config_path = dirs::home_dir()
        .ok_or("Home directory not found!")?
        .join("tv-ui.json");

    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    serde_json::from_str(&content)
        .map_err(|e| format!("Config parse error: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_apps])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
