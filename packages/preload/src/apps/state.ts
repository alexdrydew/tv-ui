import type { AppConfigId, AppExitInfo } from '@app/types';
import type { Fiber } from 'effect';

export interface AppState {
    readonly configId: AppConfigId;
    readonly pid: number;
    readonly fiber?: Fiber.RuntimeFiber<void, never>;
    lastExitResult: AppExitInfo | null;
}

export const launchedApps = new Map<AppConfigId, AppState>();
