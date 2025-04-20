import { invokeAppUpdateListeners } from '#src/events.js';
import type { AppConfigId, AppExitInfo, LaunchInstanceId } from '@app/types';

export interface AppState {
    readonly launchInstanceId: LaunchInstanceId;
    readonly configId: AppConfigId;
    readonly pid: number;
    lastExitResult?: AppExitInfo | null;
}
export const launchedApps = new Map<LaunchInstanceId, AppState>();

export const getRunningAppsByConfigId = (configId: AppConfigId): AppState[] => {
    const apps = Array.from(launchedApps.values()).filter(
        (app) => app.configId === configId && app.lastExitResult === null,
    );
    return apps;
};

export const insertGlobalStateAndNotify = (state: AppState): AppState => {
    if (launchedApps.has(state.launchInstanceId)) {
        console.warn(
            `App with launchInstanceId ${state.launchInstanceId} already exists in the map. Overwriting...`,
        );
    }
    launchedApps.set(state.launchInstanceId, state);
    invokeAppUpdateListeners({
        configId: state.configId,
        launchInstanceId: state.launchInstanceId,
        pid: state.pid,
    });
    return state;
};

export const updateGlobalStateAndNotify = (
    launchInstanceId: LaunchInstanceId,
    exitInfo?: AppExitInfo,
): void => {
    const finalState = launchedApps.get(launchInstanceId);
    if (finalState) {
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
            `State for naturally exited/errored app (Instance: ${launchInstanceId}) not found in map.`,
        );
    }
};
