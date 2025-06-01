import { useEffect, useState, useMemo } from 'react';
import {
    getLauncherConfig,
    onLauncherConfigUpdate,
    watchLauncherConfigFile,
    getEnv,
    LauncherConfig,
} from '@app/preload';

export function useLauncherConfig(): {
    config: LauncherConfig | undefined;
    configFilePath: string | undefined;
} {
    const configFilePath = useMemo(() => {
        const envPath = getEnv('TV_UI_LAUNCHER_CONFIG_PATH');
        if (envPath) {
            return envPath;
        }

        return `${getEnv('HOME')}/.config/tv-ui/launcher.json`;
    }, []);

    const [config, setConfig] = useState<LauncherConfig | undefined>();

    useEffect(() => {
        if (!configFilePath) {
            return;
        }
        getLauncherConfig(configFilePath).then(setConfig);
    }, [configFilePath]);

    useEffect(() => {
        console.debug('Setting up launcher config update listener');
        const unsubscribe = onLauncherConfigUpdate(
            (updatedConfig: LauncherConfig) => {
                console.debug(
                    `Received launcher config update via preload listener: ${JSON.stringify(updatedConfig)}`,
                );
                setConfig(updatedConfig);
            },
        );

        return () => {
            console.debug('Removing launcher config update listener');
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!configFilePath) {
            return;
        }

        console.debug(
            `Initiating launcher config file watcher for: ${configFilePath}`,
        );
        const stopWatching = watchLauncherConfigFile(configFilePath);

        return () => {
            console.debug(
                `Stopping launcher config file watcher for: ${configFilePath}`,
            );
            stopWatching();
        };
    }, [configFilePath]);

    return { config, configFilePath };
}
