import { Effect } from 'effect';
import fs from 'node:fs';
import { LAUNCHER_CONFIG_UPDATE_CHANNEL, LauncherConfig } from '@app/types';
import { readLauncherConfigFromFile } from './fs.js';
import {
    invokeLauncherConfigUpdateListeners,
    onLauncherConfigUpdate,
} from '../events.js';
import { ipcRenderer } from 'electron';

let launcherConfigWatcher: fs.FSWatcher | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;

export async function getLauncherConfig(
    configPath: string,
): Promise<LauncherConfig> {
    const effect = readLauncherConfigFromFile(configPath);
    const config = await Effect.runPromise(effect);

    return config;
}

export function watchLauncherConfigFile(configPath: string): () => void {
    if (launcherConfigWatcher) {
        console.warn(
            `Launcher config watcher already active for ${configPath}. Closing existing one.`,
        );
        launcherConfigWatcher.close();
    }

    console.log(`Starting launcher config file watcher for: ${configPath}`);

    const onChange = () => {
        console.log(`Launcher config file change detected: ${configPath}`);
        const effect = readLauncherConfigFromFile(configPath);
        Effect.runPromise(effect)
            .then((config) => {
                console.log(
                    `Successfully re-read launcher config file. Invoking listeners.`,
                );
                invokeLauncherConfigUpdateListeners(config);
            })
            .catch((error) => {
                console.error(
                    `Error reading launcher config file after change: ${configPath}`,
                    error,
                );
            });
    };

    try {
        launcherConfigWatcher = fs.watch(
            configPath,
            { persistent: false },
            (eventType) => {
                if (eventType === 'change') {
                    if (debounceTimeout) {
                        clearTimeout(debounceTimeout);
                    }
                    debounceTimeout = setTimeout(() => {
                        onChange();
                        debounceTimeout = null;
                    }, 100);
                }
            },
        );

        launcherConfigWatcher.on('error', (error) => {
            console.error(
                `Launcher config watcher error for ${configPath}:`,
                error,
            );
        });

        launcherConfigWatcher.on('close', () => {
            console.log(`Launcher config watcher closed for: ${configPath}`);
            launcherConfigWatcher = null;
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
                debounceTimeout = null;
            }
        });
    } catch (error) {
        console.error(
            `Failed to start launcher config watcher for ${configPath}:`,
            error,
        );
        return () => {};
    }

    const unsubscribeMainProcess = onLauncherConfigUpdate(
        (updatedConfig: LauncherConfig) => {
            console.log(
                `Received launcher config update via preload listener: ${JSON.stringify(
                    updatedConfig,
                )}`,
            );
            ipcRenderer
                .invoke(LAUNCHER_CONFIG_UPDATE_CHANNEL, updatedConfig)
                .catch((error) => {
                    console.error(
                        'Failed to send updated launcher config to main process:',
                        error,
                    );
                });
        },
    );

    const stopWatching = () => {
        if (launcherConfigWatcher) {
            console.log(
                `Stopping launcher config file watcher for: ${configPath}`,
            );
            launcherConfigWatcher.close();
        }
        unsubscribeMainProcess();
    };

    onChange();

    return stopWatching;
}
