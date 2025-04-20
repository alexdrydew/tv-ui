import { AppConfig, AppConfigId } from '@app/types';

export type ConfigUpdateListener = (updatedConfigs: AppConfig[]) => void;

const configUpdateListeners: ConfigUpdateListener[] = [];

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
