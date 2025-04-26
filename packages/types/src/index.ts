import type { ChildProcess } from 'node:child_process';
import { Schema } from 'effect';

export type AppConfigId = string;
export type LaunchInstanceId = string; // Unique ID for each launched process instance

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
    launchInstanceId: LaunchInstanceId;
    pid: number;
    exitResult?: AppExitInfo | null;
}

export const AppConfigSchema = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    icon: Schema.optional(Schema.String),
    launchCommand: Schema.String,
});

export const AppConfigArraySchema = Schema.Array(AppConfigSchema);

export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>;

// Internal state representation in preload (includes fiber)
// Note: The 'process' field seems outdated from previous refactors and isn't used.
// It should probably be removed, but keeping it for now to minimize unrelated changes.
export interface AppState extends AppStateInfo {
    process?: ChildProcess; // This seems unused after Fiber refactor
}

export const APP_UPDATE_EVENT = 'app-updated';
export const CONFIG_UPDATE_EVENT = 'config-updated';

// Frontend representation of an App configuration and its running/exited instances
export interface App {
    config: AppConfig;
    instances: AppState[]; // Changed: Now uses AppState which includes launchInstanceId
}

// Checks if *any* instance of this app config is currently running
export function isLaunched(app: App): boolean {
    return app.instances.some((instance) => !instance.exitResult);
}

export function initAppsFromConfigs(configs: AppConfig[]): App[] {
    return configs.map((config) => ({
        config,
        instances: [],
    }));
}

// Represents view information parsed from a Linux .desktop file for display
// This type is removed as requested.
// export interface DesktopEntryView {
//     id: string; // Typically the file name without .desktop
//     name: string;
//     icon?: string; // Optional icon name or path
//     filePath: string; // Full path to the .desktop file
// }
