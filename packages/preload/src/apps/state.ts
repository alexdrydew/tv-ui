import type { AppConfigId, AppExitInfo } from '@app/types';
import type { ChildProcess } from 'node:child_process';

export interface AppState {
    readonly configId: AppConfigId;
    readonly pid: number;
    readonly process?: ChildProcess;
    lastExitResult: AppExitInfo | null;
}

export const launchedApps = new Map<AppConfigId, AppState>();
