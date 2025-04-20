import { invokeAppUpdateListeners } from '#src/events.js';
import type { AppConfigId, AppExitInfo, LaunchInstanceId } from '@app/types';

export interface AppState {
    readonly launchInstanceId: LaunchInstanceId;
    readonly configId: AppConfigId;
    readonly pid: number;
    lastExitResult?: AppExitInfo | null; // Changed: Made optional and nullable
}
export const launchedApps = new Map<LaunchInstanceId, AppState>();

export const getRunningAppsByConfigId = (configId: AppConfigId): AppState[] => {
    const apps = Array.from(launchedApps.values()).filter(
        (app) => app.configId === configId && app.lastExitResult === undefined, // Check for undefined instead of null
    );
    return apps;
};

export const insertGlobalStateAndNotify = (state: AppState): AppState => {
    if (launchedApps.has(state.launchInstanceId)) {
        console.warn(
            `App with launchInstanceId ${state.launchInstanceId} already exists in the map. Overwriting...`,
        );
    }
    // Ensure lastExitResult is initialized correctly (undefined means running)
    const stateToInsert = { ...state, lastExitResult: undefined };
    launchedApps.set(state.launchInstanceId, stateToInsert);
    invokeAppUpdateListeners({
        configId: stateToInsert.configId,
        launchInstanceId: stateToInsert.launchInstanceId,
        pid: stateToInsert.pid,
        exitResult: null, // Notify renderer that it's running (null means running in AppStateInfo)
    });
    return stateToInsert;
};

export const updateGlobalStateAndNotify = (
    launchInstanceId: LaunchInstanceId,
    exitInfo: AppExitInfo, // Changed: exitInfo is now required
): void => {
    const finalState = launchedApps.get(launchInstanceId);
    if (finalState) {
        // Only update if it hasn't already exited
        if (finalState.lastExitResult === undefined) {
            finalState.lastExitResult = exitInfo;
            console.log(
                `Updated state for ${finalState.configId} (Instance: ${launchInstanceId}, PID: ${finalState.pid}) with exit info: ${JSON.stringify(exitInfo)}`,
            );
            invokeAppUpdateListeners({
                configId: finalState.configId,
                launchInstanceId: finalState.launchInstanceId,
                pid: finalState.pid,
                exitResult: finalState.lastExitResult,
            });
        } else {
            console.warn(
                `State for ${finalState.configId} (Instance: ${launchInstanceId}) already has exit info. Ignoring duplicate update.`,
            );
        }
    } else {
        console.warn(
            `State for naturally exited/errored app (Instance: ${launchInstanceId}) not found in map. Cannot update.`,
        );
    }
};
