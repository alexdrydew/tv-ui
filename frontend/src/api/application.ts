import { invoke } from "@tauri-apps/api/core";

export type AppExitResult =
  | "Success"
  | { ExitCode: number }
  | { Signal: number }
  | "Unknown"
  | null;

export interface AppState {
  configId: string;
  pid: number;
  exitResult: AppExitResult;
}
export interface AppConfig {
  id: string;
  name: string;
  icon: string;
  launchCommand: string;
}

export function launchApp(
  command: string,
  configId: string,
): Promise<AppState> {
  return invoke("launch_app", { command, configId });
}

export function getAppConfigs(configPath: string): Promise<AppConfig[]> {
  return invoke("get_app_configs", { configPath });
}

export function getAppState(configId: string): Promise<AppState | null> {
  return invoke("get_app_state", { configId });
}

export function killApp(configId: string): Promise<void> {
  return invoke("kill_app", { configId });
}

export function createAppConfig(
  newConfig: AppConfig,
  configPath: string,
): Promise<void> {
  return invoke("create_app_config", { newConfig, configPath });
}

export const APP_UPDATE_EVENT = "app-updated";
