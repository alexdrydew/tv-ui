import {
    AppConfig,
    AppConfigId,
    AppStateInfo,
    LauncherConfig,
} from '@app/types';

export type ConfigUpdateListener = (updatedConfigs: AppConfig[]) => void;
export type AppUpdateListener = (stateInfo: AppStateInfo) => void;
export type LauncherConfigUpdateListener = (config: LauncherConfig) => void;

const configUpdateListeners: ConfigUpdateListener[] = [];
const appUpdateListeners: AppUpdateListener[] = [];
const launcherConfigUpdateListeners: LauncherConfigUpdateListener[] = [];

/**
 * Registers a listener callback to be invoked when the application configuration is updated.
 * The main process emits a CONFIG_UPDATE_EVENT via IPC when changes occur.
 *
 * @param listener The callback function to execute with the updated AppConfig array.
 * @returns A function to unsubscribe the listener.
 */
export function onConfigUpdate(listener: ConfigUpdateListener): () => void {
    configUpdateListeners.push(listener);
    console.debug(
        `Registered config update listener. Total: ${configUpdateListeners.length}`,
    );

    // Return an unsubscribe function
    return () => {
        const index = configUpdateListeners.indexOf(listener);
        if (index > -1) {
            configUpdateListeners.splice(index, 1);
            console.debug(
                `Unregistered config update listener. Remaining: ${configUpdateListeners.length}`,
            );
        }
    };
}

/**
 * Registers a listener callback to be invoked when an application's state is updated.
 *
 * @param listener The callback function to execute with the AppStateInfo.
 * @returns A function to unsubscribe the listener.
 */
export function onAppUpdate(listener: AppUpdateListener): () => void {
    appUpdateListeners.push(listener);
    console.debug(
        `Registered app update listener. Total: ${appUpdateListeners.length}`,
    );

    // Return an unsubscribe function
    return () => {
        const index = appUpdateListeners.indexOf(listener);
        if (index > -1) {
            appUpdateListeners.splice(index, 1);
            console.debug(
                `Unregistered app update listener. Remaining: ${appUpdateListeners.length}`,
            );
        }
    };
}

/**
 * Registers a listener callback to be invoked when the launcher configuration is updated.
 *
 * @param listener The callback function to execute with the updated LauncherConfig.
 * @returns A function to unsubscribe the listener.
 */
export function onLauncherConfigUpdate(
    listener: LauncherConfigUpdateListener,
): () => void {
    launcherConfigUpdateListeners.push(listener);
    console.debug(
        `Registered launcher config update listener. Total: ${launcherConfigUpdateListeners.length}`,
    );

    return () => {
        const index = launcherConfigUpdateListeners.indexOf(listener);
        if (index > -1) {
            launcherConfigUpdateListeners.splice(index, 1);
            console.debug(
                `Unregistered launcher config update listener. Remaining: ${launcherConfigUpdateListeners.length}`,
            );
        }
    };
}

/**
 * Invokes all registered configuration update listeners with the provided configs.
 * @param updatedConfigsRecord A record containing the latest application configurations.
 */
export function invokeConfigUpdateListeners(
    updatedConfigsRecord: Record<AppConfigId, AppConfig>,
): void {
    const updatedConfigsArray = Object.values(updatedConfigsRecord);
    console.debug(
        `Invoking ${configUpdateListeners.length} config update listeners with ${updatedConfigsArray.length} configs.`,
    );
    [...configUpdateListeners].forEach((listener) => {
        try {
            listener(updatedConfigsArray);
        } catch (error) {
            console.error('Error executing config update listener:', error);
        }
    });
}

/**
 * Invokes all registered application state update listeners with the provided state info.
 * @param stateInfo The latest state information for an application instance.
 */
export function invokeAppUpdateListeners(stateInfo: AppStateInfo): void {
    console.debug(
        `Invoking ${appUpdateListeners.length} app update listeners for configId ${stateInfo.configId}, PID ${stateInfo.pid}.`,
    );
    // Create a snapshot of the listeners array in case listeners modify the array during iteration
    [...appUpdateListeners].forEach((listener) => {
        try {
            // Pass a copy of the state info to prevent accidental mutation by listeners
            listener({ ...stateInfo });
        } catch (error) {
            console.error('Error executing app update listener:', error);
        }
    });
}

/**
 * Invokes all registered launcher configuration update listeners with the provided config.
 * @param config The latest launcher configuration.
 */
export function invokeLauncherConfigUpdateListeners(
    config: LauncherConfig,
): void {
    console.debug(
        `Invoking ${launcherConfigUpdateListeners.length} launcher config update listeners.`,
    );
    [...launcherConfigUpdateListeners].forEach((listener) => {
        try {
            listener({ ...config });
        } catch (error) {
            console.error(
                'Error executing launcher config update listener:',
                error,
            );
        }
    });
}
