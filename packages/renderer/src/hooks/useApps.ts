import { useEffect, useState, useCallback } from 'react';
import { error, debug } from '@/api/logging';
import {
    App,
    AppConfig,
    AppConfigId,
    AppState,
    AppStateInfo,
} from '@app/types';
import {
    getAppConfigs,
    getEnv,
    onAppUpdate,
    onConfigUpdate,
} from '@app/preload';

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

    useEffect(() => {
        debug('Setting up config update listener');
        const unsubscribe = onConfigUpdate((updatedConfigs: AppConfig[]) => {
            debug(
                `Received config update via preload listener: ${updatedConfigs.length} configs`,
            );
            setConfig(updatedConfigs);
        });

        return () => {
            debug('Removing config update listener');
            unsubscribe();
        };
    }, []);
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
 * Subscribes to application state update events via the preload event system.
 * @param onUpdate Callback function to execute when an app state update is received.
 */
export function useAppStateUpdateEventsSubscription(
    onUpdate: (stateInfo: AppStateInfo) => void,
) {
    useEffect(() => {
        debug('Setting up app state update listener');
        const unsubscribe = onAppUpdate((stateInfo: AppStateInfo) => {
            debug(
                `Received app state update via preload listener: ${JSON.stringify(stateInfo)}`,
            );
            onUpdate(stateInfo);
        });

        // Cleanup function
        return () => {
            debug('Removing app state update listener');
            unsubscribe();
        };
    }, [onUpdate]); // Re-subscribe if the onUpdate callback changes
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
                    debug(`Updating existing app config for ID: ${config.id}`);
                    return {
                        ...existingApp,
                        config: config,
                    };
                } else {
                    debug(`Creating new app state for ID: ${config.id}`);
                    return {
                        config: config,
                        instances: [],
                    };
                }
            });

            debug(
                `Updated apps state based on configs. New app count: ${newApps.length}`,
            );
            return newApps;
        });
    }, [appConfigs]);

    const updateApps = useCallback(
        (stateInfo: AppStateInfo) => {
            setApps((currentApps) => {
                if (currentApps === undefined) {
                    error(
                        `Received app update for ${stateInfo.configId} but current apps state is undefined.`,
                    );
                    return undefined;
                }

                const targetAppIndex = currentApps.findIndex(
                    (app) => app.config.id === stateInfo.configId,
                );

                if (targetAppIndex === -1) {
                    error(
                        `Received app update for unknown configId: ${stateInfo.configId}`,
                    );
                    return currentApps;
                }

                const newApps = [...currentApps];
                const targetApp = {
                    ...newApps[targetAppIndex],
                    instances: [...newApps[targetAppIndex].instances],
                };

                const instanceIndex = targetApp.instances.findIndex(
                    (instance) => instance.pid === stateInfo.pid,
                );
                const updatedInstanceState: AppState = {
                    configId: stateInfo.configId,
                    pid: stateInfo.pid,
                    exitResult: stateInfo.exitResult,
                };

                if (instanceIndex === -1) {
                    debug(
                        `Adding new instance (PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                    );
                    targetApp.instances.push(updatedInstanceState);
                } else {
                    debug(
                        `Updating instance (PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                    );
                    targetApp.instances[instanceIndex] = updatedInstanceState;
                }

                newApps[targetAppIndex] = targetApp;

                debug(
                    `Updated apps state: ${JSON.stringify(newApps.map((a) => ({ id: a.config.id, instances: a.instances.length })))}`,
                );
                return newApps;
            });
        },
        [],
    );
    useAppStateUpdateEventsSubscription(updateApps);

    return { apps, configFilePath };
}
