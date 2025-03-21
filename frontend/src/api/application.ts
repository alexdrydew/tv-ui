import { invoke } from "@tauri-apps/api/core";

export type AppExitResult =
  | "Success"
  | { ExitCode: number }
  | { Signal: number }
  | "Unknown"
  | null;

export interface AppState {
  id: string;
  pid: number;
  exitResult: AppExitResult;
}
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

export function getAppState(appId: string): Promise<AppState | null> {
  return invoke("get_command", { appId });
}

export const APP_UPDATE_EVENT = "app-updated";
