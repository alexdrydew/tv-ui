import { useEffect, useState, useCallback, useMemo } from 'react';
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
    watchConfigFile,
} from '@app/preload';

export function useAppConfigs(configFileName: string): {
    configs: AppConfig[] | undefined;
    configFilePath: string | undefined;
} {
    const configFilePath = useMemo(() => {
        const envPath = getEnv('TV_UI_CONFIG_PATH');
        if (envPath) {
            return envPath;
        }

        return `${getEnv('HOME')}/.config/tv-ui/${configFileName}`;
    }, [configFileName]);

    const [configs, setConfig] = useState<AppConfig[] | undefined>();

    useEffect(() => {
        if (!configFilePath) {
            return;
        }
        getAppConfigs(configFilePath).then(setConfig).catch(console.error);
    }, [configFilePath]);

    useEffect(() => {
        console.debug('Setting up config update listener');
        const unsubscribe = onConfigUpdate((updatedConfigs: AppConfig[]) => {
            console.debug(
                `Received config update via preload listener: ${updatedConfigs.length} configs`,
            );
            setConfig(updatedConfigs);
        });

        return () => {
            console.debug('Removing config update listener');
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!configFilePath) {
            return;
        }

        console.debug(`Initiating config file watcher for: ${configFilePath}`);
        const stopWatching = watchConfigFile(configFilePath);

        return () => {
            console.debug(
                `Stopping config file watcher for: ${configFilePath}`,
            );
            stopWatching();
        };
    }, [configFilePath]);

    return { configs, configFilePath };
}

export function useAppStateUpdateEventsSubscription(
    onUpdate: (stateInfo: AppStateInfo) => void,
) {
    useEffect(() => {
        console.debug('Setting up app state update listener');
        const unsubscribe = onAppUpdate((stateInfo: AppStateInfo) => {
            console.debug(
                `Received app state update via preload listener: ${JSON.stringify(stateInfo)}`,
            );
            onUpdate(stateInfo);
        });

        return () => {
            console.debug('Removing app state update listener');
            unsubscribe();
        };
    }, [onUpdate]);
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

        console.debug(
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
                    console.debug(
                        `Updating existing app config for ID: ${config.id}`,
                    );
                    return {
                        ...existingApp,
                        config: config,
                    };
                } else {
                    console.debug(
                        `Creating new app state for ID: ${config.id}`,
                    );
                    return {
                        config: config,
                        instances: [],
                    };
                }
            });

            const currentConfigIds = new Set(appConfigs.map((c) => c.id));
            const filteredApps = newApps.filter((app) =>
                currentConfigIds.has(app.config.id),
            );

            console.debug(
                `Updated apps state based on configs. New app count: ${filteredApps.length}`,
            );
            return filteredApps;
        });
    }, [appConfigs]);

    const updateApps = useCallback((stateInfo: AppStateInfo) => {
        setApps((currentApps) => {
            if (currentApps === undefined) {
                console.error(
                    `Received app update for ${stateInfo.configId} (Instance: ${stateInfo.launchInstanceId}) but current apps state is undefined.`,
                );
                return undefined;
            }

            const targetAppIndex = currentApps.findIndex(
                (app) => app.config.id === stateInfo.configId,
            );

            if (targetAppIndex === -1) {
                console.error(
                    `Received app update for unknown/removed configId: ${stateInfo.configId} (Instance: ${stateInfo.launchInstanceId})`,
                );
                return currentApps;
            }

            const newApps = [...currentApps];
            const targetApp = { ...newApps[targetAppIndex] };
            const currentInstances = [...targetApp.instances];

            const instanceIndex = currentInstances.findIndex(
                (instance) =>
                    instance.launchInstanceId === stateInfo.launchInstanceId,
            );

            const updatedInstanceState: AppState = {
                configId: stateInfo.configId,
                launchInstanceId: stateInfo.launchInstanceId,
                pid: stateInfo.pid,
                exitResult: stateInfo.exitResult,
            };

            if (instanceIndex === -1) {
                console.debug(
                    `Adding new instance (Instance: ${stateInfo.launchInstanceId}, PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                );
                targetApp.instances = [
                    ...currentInstances,
                    updatedInstanceState,
                ];
            } else {
                console.debug(
                    `Updating instance (Instance: ${stateInfo.launchInstanceId}, PID: ${stateInfo.pid}) for app ${stateInfo.configId}`,
                );
                const newInstances = [...currentInstances];
                newInstances[instanceIndex] = updatedInstanceState;
                targetApp.instances = newInstances;
            }

            newApps[targetAppIndex] = targetApp;

            console.debug(
                `Updated apps state: ${JSON.stringify(newApps.map((a) => ({ id: a.config.id, instances: a.instances.map((i) => i.launchInstanceId) })))}`,
            );
            return newApps;
        });
    }, []);
    useAppStateUpdateEventsSubscription(updateApps);

    return { apps, configFilePath };
}
