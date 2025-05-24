import { Effect } from 'effect';
import fs from 'node:fs';
import { LauncherConfig } from '@app/types';
import { readLauncherConfigFromFile } from './fs.js';
import { invokeLauncherConfigUpdateListeners } from '../events.js';

let launcherConfigWatcher: fs.FSWatcher | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;

export async function getLauncherConfig(
    configPath: string,
): Promise<LauncherConfig> {
    const effect = readLauncherConfigFromFile(configPath);
    return Effect.runPromise(effect);
}

export function watchLauncherConfigFile(configPath: string): () => void {
    if (launcherConfigWatcher) {
        console.warn(
            `Launcher config watcher already active for ${configPath}. Closing existing one.`,
        );
        launcherConfigWatcher.close();
    }

    console.log(`Starting launcher config file watcher for: ${configPath}`);

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
                        console.log(
                            `Launcher config file change detected: ${configPath}`,
                        );
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

    const stopWatching = () => {
        if (launcherConfigWatcher) {
            console.log(
                `Stopping launcher config file watcher for: ${configPath}`,
            );
            launcherConfigWatcher.close();
        }
    };

    return stopWatching;
}
