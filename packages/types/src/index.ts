import type { ChildProcess } from 'node:child_process';
import { z } from 'zod';

export type AppConfigId = string;

export enum AppExitResult {
    Success = 'Success',
    ExitCode = 'ExitCode',
    Signal = 'Signal',
    Unknown = 'Unknown',
}

export type AppExitInfo =
    | { type: AppExitResult.Success }
    | { type: AppExitResult.ExitCode; code: number }
    | { type: AppExitResult.Signal; signal: NodeJS.Signals }
    | { type: AppExitResult.Unknown };

export interface AppStateInfo {
    configId: AppConfigId;
    pid: number;
    exitResult: AppExitInfo | null;
}

export const AppConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    icon: z.optional(z.string()),
    launchCommand: z.string(),
});

export const AppConfigArraySchema = z.array(AppConfigSchema);

export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface AppState extends AppStateInfo {
    process?: ChildProcess;
}

export const APP_UPDATE_EVENT = 'app-updated';
export const CONFIG_UPDATE_EVENT = 'config-updated';

export interface App {
    config: AppConfig;
    instances: AppState[];
}

export function isLaunched(app: App): boolean {
    return app.instances.some((instance) => !instance.exitResult);
}

export function initAppsFromConfigs(configs: AppConfig[]): App[] {
    return configs.map((config) => ({
        config,
        instances: [],
    }));
}
