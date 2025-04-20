import { useEffect, useState, useCallback } from 'react';
import { error, debug } from '@/api/logging';
import {
    App,
    AppConfig,
    AppState,
    AppStateInfo,
    initAppsFromConfigs,
} from '@app/types';
import { getAppConfigs, getEnv, onConfigUpdate } from '@app/preload'; // Import onConfigUpdate

export function useAppConfigs(configFileName: string): {
    configs: AppConfig[] | undefined;
    configFilePath: string | undefined;
} {
    const configFilePath =
        getEnv('TV_UI_CONFIG_PATH') ??
        `/Users/alexdrydew/.config/tv-ui/${configFileName}`;

    // useEffect(() => {
    //   const appConfigDir = new Promise(() => "/Users/alexdrydew/.config/tv-ui");
    //   appConfigDir.then(async (path) => {
    //     setConfigFilePath(path + "/" + configFileName);
    //   });
    // }, [configFileName]);

    const [configs, setConfig] = useState<AppConfig[] | undefined>();

    useEffect(() => {
        if (!configFilePath) {
            return;
        }
        getAppConfigs(configFilePath).then(setConfig).catch(error);
    }, [configFilePath]);

    // Listen for config updates from the preload script
    useEffect(() => {
        debug('Setting up config update listener');
        const unsubscribe = onConfigUpdate((updatedConfigs: AppConfig[]) => {
            debug(
                `Received config update via preload listener: ${updatedConfigs.length} configs`,
            );
            setConfig(updatedConfigs);
        });

        // Cleanup function
        return () => {
            debug('Removing config update listener');
            unsubscribe();
        };
    }, []); // Run only once on mount

    // // Listen for config updates from the main process via IPC (OLD CODE)
    // useEffect(() => {
    //     const configUpdateListener = (
    //         _event: unknown,
    //         updatedConfigs: AppConfig[],
    //     ) => {
    //         debug(
    //             `IPC Event Received [${CONFIG_UPDATE_EVENT}]: ${JSON.stringify(updatedConfigs)}`,
    //         );
    //         setConfig(updatedConfigs);
    //     };
    //
    //     debug(`Setting up IPC listener for ${CONFIG_UPDATE_EVENT}`);
    //     window.ipcRenderer.on(CONFIG_UPDATE_EVENT, configUpdateListener);
    //
    //     // Cleanup function
    //     return () => {
    //         debug(`Removing IPC listener for ${CONFIG_UPDATE_EVENT}`);
    //         window.ipcRenderer.removeListener(
    //             CONFIG_UPDATE_EVENT,
    //             configUpdateListener,
    //         );
    //     };
    // }, []); // Run only once

    return { configs, configFilePath };
}

/**
 * Subscribes to application state update events from the main process.
 * @param _onUpdate Callback function to execute when an app state update is received.
 */
export function useAppStateUpdateEventsSubscription(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _onUpdate: (stateInfo: AppStateInfo) => void,
) {
    // useEffect(() => {
    //     const appUpdateListener = (
    //         _event: unknown,
    //         stateInfo: AppStateInfo,
    //     ) => {
    //         debug(
    //             `IPC Event Received [${APP_UPDATE_EVENT}]: ${JSON.stringify(stateInfo)}`,
    //         );
    //         onUpdate(stateInfo);
    //     };
    //
    //     debug(`Setting up IPC listener for ${APP_UPDATE_EVENT}`);
    //     window.ipcRenderer.on(APP_UPDATE_EVENT, appUpdateListener);
    //
    //     // Cleanup function
    //     return () => {
    //         debug(`Removing IPC listener for ${APP_UPDATE_EVENT}`);
    //         window.ipcRenderer.removeListener(
    //             APP_UPDATE_EVENT,
    //             appUpdateListener,
    //         );
    //     };
    // }, [onUpdate]); // Re-subscribe if the onUpdate callback changes
}

export function useApps(): {
    apps: App[] | undefined;
    configFilePath: string | undefined;
} {
    const { configs: appConfigs, configFilePath } = useAppConfigs('tv-ui.json');
    const [apps, setApps] = useState<App[] | undefined>([]);

    useEffect(() => {
        if (appConfigs === undefined) {
            setApps(undefined);
            return;
        }

        if (appConfigs === undefined) {
            debug('App configs are undefined, setting apps to undefined.');
            setApps(undefined);
            return;
        }

        debug(
            `Processing config update. New config count: ${appConfigs.length}`,
        );

        // Update apps state based on new configs, preserving existing state where possible
        setApps((prevApps) => {
            const prevAppsMap = new Map<AppConfigId, App>();
            if (prevApps) {
                for (const app of prevApps) {
                    prevAppsMap.set(app.config.id, app);
                }
            }

            const newApps = appConfigs.map((config) => {
                const existingApp = prevAppsMap.get(config.id);
                if (existingApp) {
                    // Preserve existing app state, update config
                    debug(`Updating existing app config for ID: ${config.id}`);
                    return {
                        ...existingApp,
                        config: config, // Update the config part
                    };
                } else {
                    // New app config
                    debug(`Creating new app state for ID: ${config.id}`);
                    return {
                        config: config,
                        instances: [], // Initialize instances for new app
                    };
                }
            });

            debug(
                `Updated apps state based on configs. New app count: ${newApps.length}`,
            );
            return newApps;
        });
    }, [appConfigs]); // Dependency remains appConfigs

    const updateApps = useCallback(
        (stateInfo: AppStateInfo) => {
            setApps((currentApps) => {
                if (currentApps === undefined) {
                    error(
                        `Received app update for ${stateInfo.configId} but current apps state is undefined.`,
                    );
                    return undefined; // Or handle appropriately
                }

                const targetAppIndex = currentApps.findIndex(
                    (app) => app.config.id === stateInfo.configId,
                );

                if (targetAppIndex === -1) {
                    error(
                        `Received app update for unknown configId: ${stateInfo.configId}`,
                    );
                    return currentApps; // No change if config ID doesn't match
                }

                // Create a new array for immutability
                const newApps = [...currentApps];
                // Clone the target app and its instances
                const targetApp = {
                    ...newApps[targetAppIndex],
                    instances: [...newApps[targetAppIndex].instances],
                };

                const instanceIndex = targetApp.instances.findIndex(
                    (instance) => instance.pid === stateInfo.pid,
                );

                // Map AppStateInfo from main process to the AppState used in renderer/entities
                const updatedInstanceState: AppState = {
                    configId: stateInfo.configId,
                    pid: stateInfo.pid,
                    exitResult: stateInfo.exitResult,
                };

                if (instanceIndex === -1) {
                    // New instance launched
                    debug(
                        `Adding new instance (PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                    );
                    targetApp.instances.push(updatedInstanceState);
                } else {
                    // Update existing instance state (e.g., exitResult changed)
                    debug(
                        `Updating instance (PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                    );
                    targetApp.instances[instanceIndex] = updatedInstanceState;
                }

                // Update the app in the new array
                newApps[targetAppIndex] = targetApp;

                debug(
                    `Updated apps state: ${JSON.stringify(newApps.map((a) => ({ id: a.config.id, instances: a.instances.length })))}`,
                );
                return newApps;
            });
        },
        [], // No dependencies needed for the callback itself
    );

    // Subscribe to app state updates
    useAppStateUpdateEventsSubscription(updateApps);

    return { apps, configFilePath };
}
