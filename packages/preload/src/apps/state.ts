import type { AppConfigId, AppExitInfo } from '@app/types';
import type { ChildProcess } from 'node:child_process';

export interface AppState {
    readonly configId: AppConfigId;
    readonly pid: number;
    readonly process?: ChildProcess;
    exitResult: AppExitInfo | null; // Renamed from lastExitResult
}

export const launchedApps = new Map<AppConfigId, AppState>();
