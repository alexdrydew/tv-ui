import { AppConfig, AppState, launchApp } from "@/api/application";

export interface App {
  config: AppConfig;
}

export type LaunchedApp = App & { state: AppState };

export function is_launched(app: App): app is LaunchedApp {
  return (app as LaunchedApp).state !== undefined;
}

export function initAppsFromConfigs(configs: AppConfig[]): App[] {
  return configs.map((config) => ({
    config,
  }));
}

export async function launchAppEntity(app: App): Promise<LaunchedApp> {
  const state = await launchApp(app.config.launchCommand, app.config.id);
  return {
    ...app,
    state,
  };
}
