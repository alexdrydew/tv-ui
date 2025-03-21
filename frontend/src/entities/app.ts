import { AppConfig, AppState, launchApp } from "@/api/application";

export interface App {
  config: AppConfig;
  instances: AppState[];
}

export function is_launched(app: App): boolean {
  return app.instances.length > 0;
}

export function initAppsFromConfigs(configs: AppConfig[]): App[] {
  return configs.map((config) => ({
    config,
    instances: [],
  }));
}

export async function launchAppEntity(app: App): Promise<App> {
  const state = await launchApp(app.config.launchCommand, app.config.id);
  return {
    ...app,
    instances: [...app.instances, state],
  };
}
