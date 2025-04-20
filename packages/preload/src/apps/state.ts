import type { AppConfigId, AppExitInfo, LaunchInstanceId } from '@app/types';
import type { Fiber } from 'effect';

// Re-export LaunchInstanceId for internal use if needed, though importing from @app/types is preferred
export type { LaunchInstanceId };

export interface AppState {
    readonly configId: AppConfigId;
    readonly launchInstanceId: LaunchInstanceId; // Added
    readonly pid: number;
    readonly fiber?: Fiber.RuntimeFiber<void, never>;
    lastExitResult: AppExitInfo | null;
}

// Changed: Key is now LaunchInstanceId
export const launchedApps = new Map<LaunchInstanceId, AppState>();
