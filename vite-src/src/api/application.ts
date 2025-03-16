import { invoke } from "@tauri-apps/api/core";
import type { App } from "@/hooks/useAppConfiguration";

export function launchApp(executablePath: string, appId: string): Promise<number> {
  return invoke("launch_app", { executablePath, appId });
}

export function getApps(configPath: string): Promise<App[]> {
  return invoke("get_apps", { configPath });
}

export interface AppState {
  pid: number;
  exit_result: "Success" | { ExitCode: number } | { Signal: number } | "Unknown" | null;
}

export function getAppState(appId: string): Promise<AppState | null> {
  return invoke("get_command", { appId });
}
