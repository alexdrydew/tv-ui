import { AppConfig, AppConfigId } from '@app/types';
import { Effect, pipe } from 'effect';
import fs from 'node:fs';
import { invokeConfigUpdateListeners } from '../events.js';
import { ConfigNotFoundError } from './errors.js';
import { readConfigsFromFile, writeConfigsToFileEffect } from './fs.js';
import { suggestAppConfigs, SuggestionResult } from './suggestions/index.js'; // Import the effect

let configWatcher: fs.FSWatcher | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;

export async function getAppConfigs(configPath: string): Promise<AppConfig[]> {
    const effect = readConfigsFromFile(configPath);
    return Effect.runPromise(effect).then((res) => Object.values(res));
}

export async function upsertAppConfig(
    configToUpsert: AppConfig,
    configPath: string,
): Promise<void> {
    const effect = pipe(
        readConfigsFromFile(configPath),
        Effect.map((configsRecord) => {
            configsRecord[configToUpsert.id] = configToUpsert;
            return configsRecord;
        }),
        Effect.flatMap((updatedConfigsRecord) =>
            pipe(
                writeConfigsToFileEffect(configPath, updatedConfigsRecord),
                Effect.tap(() =>
                    invokeConfigUpdateListeners(updatedConfigsRecord),
                ),
            ),
        ),
    );

    return Effect.runPromise(effect);
}

/**
 * Watches the configuration file for changes and triggers updates.
 * @param configPath The path to the configuration file.
 * @returns A function to stop watching the file.
 */
export function watchConfigFile(configPath: string): () => void {
    if (configWatcher) {
        console.warn(
            `Config watcher already active for ${configPath}. Closing existing one.`,
        );
        configWatcher.close();
    }

    console.log(`Starting config file watcher for: ${configPath}`);

    try {
        configWatcher = fs.watch(
            configPath,
            { persistent: false },
            (eventType) => {
                if (eventType === 'change') {
                    if (debounceTimeout) {
                        clearTimeout(debounceTimeout);
                    }
                    debounceTimeout = setTimeout(() => {
                        console.log(
                            `Config file change detected: ${configPath}`,
                        );
                        const effect = readConfigsFromFile(configPath);
                        Effect.runPromise(effect)
                            .then((configsRecord) => {
                                console.log(
                                    `Successfully re-read config file. Invoking listeners.`,
                                );
                                invokeConfigUpdateListeners(configsRecord);
                            })
                            .catch((error) => {
                                console.error(
                                    `Error reading config file after change: ${configPath}`,
                                    error,
                                );
                            });
                        debounceTimeout = null;
                    }, 100); // Debounce for 100ms
                }
            },
        );

        configWatcher.on('error', (error) => {
            console.error(`Config watcher error for ${configPath}:`, error);
        });

        configWatcher.on('close', () => {
            console.log(`Config watcher closed for: ${configPath}`);
            configWatcher = null;
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
                debounceTimeout = null;
            }
        });
    } catch (error) {
        console.error(
            `Failed to start config watcher for ${configPath}:`,
            error,
        );
        return () => {};
    }

    const stopWatching = () => {
        if (configWatcher) {
            console.log(`Stopping config file watcher for: ${configPath}`);
            configWatcher.close();
        }
    };

    return stopWatching;
}

export async function removeAppConfig(
    configIdToRemove: AppConfigId,
    configPath: string,
): Promise<void> {
    const effect = pipe(
        readConfigsFromFile(configPath),
        Effect.flatMap((configsRecord) => {
            if (!(configIdToRemove in configsRecord)) {
                return Effect.fail(
                    new ConfigNotFoundError({ configId: configIdToRemove }),
                );
            }
            delete configsRecord[configIdToRemove];
            return Effect.succeed(configsRecord);
        }),
        Effect.flatMap((updatedConfigsRecord) =>
            pipe(
                writeConfigsToFileEffect(configPath, updatedConfigsRecord),
                Effect.tap(() =>
                    invokeConfigUpdateListeners(updatedConfigsRecord),
                ),
            ),
        ),
    );
    return Effect.runPromise(effect);
}

export async function getSuggestedAppConfigs(): Promise<SuggestionResult> {
    return await suggestAppConfigs();
}
