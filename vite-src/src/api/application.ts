import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
  id: string;
  name: string;
  icon: string;
  launchCommand: string;
}

export function launchApp(command: string, appId: string): Promise<AppState> {
  return invoke("launch_app", { command, appId });
}

export function getAppConfigs(configPath: string): Promise<AppConfig[]> {
  return invoke("get_app_configs", { configPath });
}

export interface AppState {
  pid: number;
  exit_result:
    | "Success"
    | { ExitCode: number }
    | { Signal: number }
    | "Unknown"
    | null;
}

export function getAppState(appId: string): Promise<AppState | null> {
  return invoke("get_command", { appId });
}

export const APP_UPDATE_EVENT = "app-updated";
