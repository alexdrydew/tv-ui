import { useEffect, useState, useCallback } from 'react';
import { error, debug } from '@/api/logging';
import {
    App,
    AppConfig,
    AppConfigId,
    AppState, // AppState now includes launchInstanceId
    AppStateInfo,
    // LaunchInstanceId, // Removed unused import
} from '@app/types';
import {
    getAppConfigs,
    getEnv,
    onAppUpdate,
    onConfigUpdate,
    watchConfigFile, // Import the new function
} from '@app/preload';

export function useAppConfigs(configFileName: string): {
    configs: AppConfig[] | undefined;
    configFilePath: string | undefined;
} {
    const configFilePath =
        getEnv('TV_UI_CONFIG_PATH') ??
        `/Users/alexdrydew/.config/tv-ui/${configFileName}`;

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
    }, []); // Empty dependency array means this runs once on mount

    // Effect to watch the config file
    useEffect(() => {
        if (!configFilePath) {
            return;
        }

        debug(`Initiating config file watcher for: ${configFilePath}`);
        const stopWatching = watchConfigFile(configFilePath);

        // Cleanup function to stop watching when component unmounts or path changes
        return () => {
            debug(`Stopping config file watcher for: ${configFilePath}`);
            stopWatching();
        };
    }, [configFilePath]); // Re-run if configFilePath changes

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
            // stateInfo now includes launchInstanceId
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

    // Effect to initialize or update apps based on config changes
    useEffect(() => {
        if (appConfigs === undefined) {
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
                    // Keep existing instances, just update the config part
                    return {
                        ...existingApp,
                        config: config,
                    };
                } else {
                    debug(`Creating new app state for ID: ${config.id}`);
                    // New config, initialize with no instances
                    return {
                        config: config,
                        instances: [],
                    };
                }
            });

            // Filter out apps whose configs were removed
            const currentConfigIds = new Set(appConfigs.map((c) => c.id));
            const filteredApps = newApps.filter((app) =>
                currentConfigIds.has(app.config.id),
            );

            debug(
                `Updated apps state based on configs. New app count: ${filteredApps.length}`,
            );
            return filteredApps;
        });
    }, [appConfigs]);

    // Callback to handle state updates for individual instances
    const updateApps = useCallback(
        (stateInfo: AppStateInfo) => {
            // stateInfo contains configId, launchInstanceId, pid, exitResult
            setApps((currentApps) => {
                if (currentApps === undefined) {
                    error(
                        `Received app update for ${stateInfo.configId} (Instance: ${stateInfo.launchInstanceId}) but current apps state is undefined.`,
                    );
                    return undefined;
                }

                const targetAppIndex = currentApps.findIndex(
                    (app) => app.config.id === stateInfo.configId,
                );

                if (targetAppIndex === -1) {
                    // This might happen if the config was removed just before the update arrived
                    error(
                        `Received app update for unknown/removed configId: ${stateInfo.configId} (Instance: ${stateInfo.launchInstanceId})`,
                    );
                    return currentApps;
                }

                const newApps = [...currentApps];
                const targetApp = { ...newApps[targetAppIndex] }; // Shallow copy app
                const currentInstances = [...targetApp.instances]; // Shallow copy instances array

                // Find the specific instance using launchInstanceId
                const instanceIndex = currentInstances.findIndex(
                    (instance) =>
                        instance.launchInstanceId === stateInfo.launchInstanceId,
                );

                // Create the updated instance state object (conforms to AppState)
                const updatedInstanceState: AppState = {
                    configId: stateInfo.configId,
                    launchInstanceId: stateInfo.launchInstanceId,
                    pid: stateInfo.pid,
                    exitResult: stateInfo.exitResult,
                    // process field is not available/needed in renderer state
                };

                if (instanceIndex === -1) {
                    // If it's a new instance (e.g., initial launch update)
                    debug(
                        `Adding new instance (Instance: ${stateInfo.launchInstanceId}, PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                    );
                    targetApp.instances = [...currentInstances, updatedInstanceState];
                } else {
                    // If it's an update to an existing instance (e.g., exit update)
                    debug(
                        `Updating instance (Instance: ${stateInfo.launchInstanceId}, PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                    );
                    const newInstances = [...currentInstances];
                    newInstances[instanceIndex] = updatedInstanceState;
                    targetApp.instances = newInstances;
                }

                newApps[targetAppIndex] = targetApp; // Put the updated app back into the apps array

                debug(
                    `Updated apps state: ${JSON.stringify(newApps.map((a) => ({ id: a.config.id, instances: a.instances.map((i) => i.launchInstanceId) })))}`,
                );
                return newApps;
            });
        },
        [],
    );
    useAppStateUpdateEventsSubscription(updateApps);

    return { apps, configFilePath };
}
