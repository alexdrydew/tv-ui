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
  icon: string | null;
  launchCommand: string;
}

export function launchApp(
  _command: string,
  _configId: string,
): Promise<AppState> {
  throw new Error("Function not implemented.");
}

export function getAppConfigs(_configPath: string): Promise<AppConfig[]> {
  return new Promise(() => []);
}

export function getAppState(_configId: string): Promise<AppState | null> {
  throw new Error("Function not implemented.");
}

export function killApp(_configId: string): Promise<void> {
  throw new Error("Function not implemented.");
}

export function upsertAppConfig(
  _configToUpsert: AppConfig,
  _configPath: string,
): Promise<void> {
  throw new Error("Function not implemented.");
}

export function removeAppConfig(
  _configIdToRemove: string,
  _configPath: string,
): Promise<void> {
  throw new Error("Function not implemented.");
}

export const APP_UPDATE_EVENT = "app-updated";
export const CONFIG_UPDATE_EVENT = "config-updated";
