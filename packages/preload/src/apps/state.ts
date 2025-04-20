import type { AppConfigId, AppExitInfo } from '@app/types';
import type { ChildProcess } from 'node:child_process';

/**
 * Represents the runtime state of a single launched application instance
 * within the preload process context.
 */
export interface AppState {
    readonly configId: AppConfigId;
    readonly pid: number;
    exitResult: AppExitInfo | null; // Mutable: Updated when the process exits
    readonly process: ChildProcess; // The actual NodeJS child process object
}

/**
 * In-memory store for tracking the state of launched applications.
 * The key is the AppConfigId, and the value is the AppState object
 * representing the currently running (or most recently exited) instance
 * for that config.
 *
 * Note: This currently assumes only one instance per config ID can be tracked.
 * If multiple instances per config are needed, the value type would need
 * to be an array or map of AppState.
 */
export const launchedApps = new Map<AppConfigId, AppState>();
