import { AppConfig, AppState, launchApp } from "@/api/application";

export interface App {
  config: AppConfig;
  instances: AppState[];
}

export function isLaunched(app: App): boolean {
  return app.instances.length > 0;
}

export function initAppsFromConfigs(configs: AppConfig[]): App[] {
  return configs.map((config) => ({
    config,
    instances: [],
  }));
}

export async function instantiateApp(app: App): Promise<AppState> {
  return await launchApp(app.config.launchCommand, app.config.id);
}
