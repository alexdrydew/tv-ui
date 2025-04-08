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
  icon: string | null; // Icon is now optional
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

export function upsertAppConfig(
  configToUpsert: AppConfig,
  configPath: string,
): Promise<void> {
  return invoke("upsert_app_config", { configToUpsert, configPath });
}

export function removeAppConfig(
  configIdToRemove: string,
  configPath: string,
): Promise<void> {
  return invoke("remove_app_config", { configIdToRemove, configPath });
}

export const APP_UPDATE_EVENT = "app-updated";
export const CONFIG_UPDATE_EVENT = "config-updated";
