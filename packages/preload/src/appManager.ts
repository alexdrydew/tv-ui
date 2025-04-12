import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
    type AppConfig,
    type AppConfigId,
    type AppState,
    type AppStateInfo,
    AppExitResult,
    type AppExitInfo,
    APP_UPDATE_EVENT,
    CONFIG_UPDATE_EVENT,
} from './types.js';

export class AppManager {
    // Stores the state of currently managed (potentially running) applications
    #launchedApps: Map<AppConfigId, AppState> = new Map();

    // --- Configuration File Handling ---

    async #readConfigsFromFile(
        configPath: string,
    ): Promise<Map<AppConfigId, AppConfig>> {
        try {
            const content = await fs.readFile(configPath, {
                encoding: 'utf-8',
            });
            const configsArray: AppConfig[] = JSON.parse(content);
            const configsMap = new Map<AppConfigId, AppConfig>();
            for (const config of configsArray) {
                // Basic validation
                if (config.id && config.name && config.launchCommand) {
                    configsMap.set(config.id, config);
                } else {
                    console.warn('Skipping invalid config entry:', config);
                }
            }
            return configsMap;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // File not found is okay, return empty map
                return new Map();
            }
            // Log other errors but treat as empty config to avoid crashing
            console.error(
                `Failed to read or parse config file "${configPath}":`,
                error,
            );
            // Rethrow specific errors if needed, or handle more gracefully
            // For now, return empty map to allow app to potentially continue
            return new Map();
            // throw new Error(`Failed to read config file: ${error.message}`);
        }
    }

    async #writeConfigsToFile(
        configPath: string,
        configs: Map<AppConfigId, AppConfig>,
    ): Promise<void> {
        try {
            const configsArray = Array.from(configs.values());
            const content = JSON.stringify(configsArray, null, 2); // Pretty print JSON
            // Ensure directory exists before writing
            await fs.mkdir(path.dirname(configPath), { recursive: true });
            await fs.writeFile(configPath, content, { encoding: 'utf-8' });
        } catch (error: any) {
            console.error(
                `Failed to write config file "${configPath}":`,
                error,
            );
            throw new Error(`Failed to write config file: ${error.message}`);
        }
    }

    // --- Public API Methods (called via IPC) ---

    async getAppConfigs(configPath: string): Promise<AppConfig[]> {
        const configsMap = await this.#readConfigsFromFile(configPath);
        return Array.from(configsMap.values());
    }

    async getAppState(configId: AppConfigId): Promise<AppStateInfo | null> {
        const appState = this.#launchedApps.get(configId);
        // Return only the serializable info part, not the process object
        return appState ? { ...appState, process: undefined } : null;
    }

    async launchApp(
        command: string,
        configId: AppConfigId,
    ): Promise<AppStateInfo> {
        const existingState = this.#launchedApps.get(configId);
        if (existingState && existingState.exitResult === null) {
            // App is considered running if state exists and exitResult is null
            throw new Error(`Application ${configId} is already running.`);
        }

        // Basic command parsing (split by space, handle potential quotes later if needed)
        const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
        if (parts.length === 0) {
            throw new Error('Empty command provided.');
        }
        const cmd = parts[0].replace(/"/g, ''); // Remove quotes from command itself
        const args = parts.slice(1).map((arg) => arg.replace(/"/g, '')); // Remove quotes from args

        let childProcess: ChildProcess;
        try {
            // Spawn the process
            // Options: detached: false (usually), stdio: 'pipe' or 'ignore' or 'inherit'
            // 'shell: true' might be needed for complex commands or shell features,
            // but can have security implications. Avoid if possible.
            childProcess = spawn(cmd, args, {
                stdio: 'ignore',
                detached: false,
            });
        } catch (error: any) {
            console.error(`Failed to spawn process for ${configId}:`, error);
            throw new Error(`Launch error: ${error.message}`);
        }

        if (childProcess.pid === undefined) {
            // This can happen if the process fails to spawn immediately
            throw new Error(
                'Failed to get PID for launched application. It might have exited immediately or failed to start.',
            );
        }

        const initialState: AppState = {
            configId: configId,
            pid: childProcess.pid,
            exitResult: null, // null indicates running
            process: childProcess,
        };

        // Store the state immediately
        this.#launchedApps.set(configId, initialState);

        // --- Process Event Listeners ---
        const handleExit = (
            code: number | null,
            signal: NodeJS.Signals | null,
        ) => {
            console.log(
                `App ${configId} (PID: ${initialState.pid}) exited. Code: ${code}, Signal: ${signal}`,
            );
            let exitInfo: AppExitInfo;
            if (signal) {
                exitInfo = { type: AppExitResult.Signal, signal: signal };
            } else if (code === 0) {
                exitInfo = { type: AppExitResult.Success };
            } else if (code !== null) {
                exitInfo = { type: AppExitResult.ExitCode, code: code };
            } else {
                // Should not happen if either code or signal is always present on exit
                console.warn(
                    `App ${configId} exited with null code and null signal.`,
                );
                exitInfo = { type: AppExitResult.Unknown };
            }

            // Update the stored state
            const finalState = this.#launchedApps.get(configId);
            if (finalState) {
                finalState.exitResult = exitInfo;
                // Optionally remove the process object now that it's exited
                // delete finalState.process;
                this.#launchedApps.set(configId, finalState); // Update map
                // Emit update to renderer
                sendToRenderer(APP_UPDATE_EVENT, {
                    ...finalState,
                    process: undefined,
                });
            } else {
                console.warn(
                    `State for exited app ${configId} not found in map.`,
                );
            }
            // Clean up listeners
            childProcess.removeAllListeners();
        };

        const handleError = (err: Error) => {
            console.error(
                `Error in launched app ${configId} (PID: ${initialState.pid}):`,
                err,
            );
            // Decide how to handle errors - maybe mark as Unknown exit?
            const errorState = this.#launchedApps.get(configId);
            if (errorState && errorState.exitResult === null) {
                // Only update if not already exited
                errorState.exitResult = { type: AppExitResult.Unknown };
                // delete errorState.process;
                this.#launchedApps.set(configId, errorState);
                sendToRenderer(APP_UPDATE_EVENT, {
                    ...errorState,
                    process: undefined,
                });
            }
            // Clean up listeners
            childProcess.removeAllListeners();
        };

        childProcess.on('exit', handleExit);
        childProcess.on('error', handleError);
        // Note: 'close' event fires after stdio streams close, 'exit' fires when process terminates.
        // Using 'exit' is generally sufficient for knowing when the process ends.

        // Emit initial running state
        sendToRenderer(APP_UPDATE_EVENT, {
            ...initialState,
            process: undefined,
        });

        // Return the initial state info
        return { ...initialState, process: undefined };
    }

    async killApp(configId: AppConfigId): Promise<void> {
        const appState = this.#launchedApps.get(configId);

        if (!appState) {
            throw new Error(`App ${configId} not found in managed processes.`);
        }

        if (appState.exitResult !== null) {
            // App is already exited
            console.warn(
                `Attempted to kill app ${configId} which has already exited.`,
            );
            return;
        }

        if (!appState.process || appState.process.killed) {
            console.warn(
                `Process for app ${configId} is missing or already killed.`,
            );
            // Consider updating state if process is missing but exitResult is null
            if (!appState.exitResult) {
                appState.exitResult = { type: AppExitResult.Unknown };
                sendToRenderer(APP_UPDATE_EVENT, {
                    ...appState,
                    process: undefined,
                });
            }
            return;
        }

        try {
            // kill() sends SIGTERM by default. Can specify other signals.
            // Returns true if signal was sent, false otherwise.
            const killed = appState.process.kill();
            if (!killed) {
                console.warn(
                    `Failed to send kill signal to process for app ${configId} (PID: ${appState.pid}). It might have already exited.`,
                );
                // Check if it exited between the check and the kill attempt
                if (
                    appState.process.exitCode !== null ||
                    appState.process.signalCode !== null
                ) {
                    // Manually trigger exit handling if the listener didn't catch it
                    const code = appState.process.exitCode;
                    const signal = appState.process.signalCode;
                    console.log(
                        `Manually handling exit for ${configId}. Code: ${code}, Signal: ${signal}`,
                    );

                    let exitInfo: AppExitInfo;
                    if (signal)
                        exitInfo = {
                            type: AppExitResult.Signal,
                            signal: signal,
                        };
                    else if (code === 0)
                        exitInfo = { type: AppExitResult.Success };
                    else if (code !== null)
                        exitInfo = { type: AppExitResult.ExitCode, code: code };
                    else exitInfo = { type: AppExitResult.Unknown };

                    appState.exitResult = exitInfo;
                    sendToRenderer(APP_UPDATE_EVENT, {
                        ...appState,
                        process: undefined,
                    });
                }
            } else {
                console.log(
                    `Sent kill signal to app ${configId} (PID: ${appState.pid})`,
                );
            }
            // The 'exit' listener attached in launchApp will handle the state update and event emission.
        } catch (error: any) {
            console.error(
                `Error killing process for app ${configId} (PID: ${appState.pid}):`,
                error,
            );
            // Update state to Unknown if kill fails unexpectedly?
            if (appState.exitResult === null) {
                appState.exitResult = { type: AppExitResult.Unknown };
                sendToRenderer(APP_UPDATE_EVENT, {
                    ...appState,
                    process: undefined,
                });
            }
            throw new Error(`Failed to kill process: ${error.message}`);
        }
    }

    async upsertAppConfig(
        configToUpsert: AppConfig,
        configPath: string,
    ): Promise<void> {
        // Basic validation
        if (
            !configToUpsert.id ||
            !configToUpsert.name ||
            !configToUpsert.launchCommand
        ) {
            throw new Error('Invalid application configuration provided.');
        }

        const configsMap = await this.#readConfigsFromFile(configPath);
        configsMap.set(configToUpsert.id, configToUpsert);
        await this.#writeConfigsToFile(configPath, configsMap);

        // Notify renderer about the config change
        const updatedConfigs = Array.from(configsMap.values());
        sendToRenderer(CONFIG_UPDATE_EVENT, updatedConfigs);
    }

    async removeAppConfig(
        configIdToRemove: AppConfigId,
        configPath: string,
    ): Promise<void> {
        // Check if the app is currently running
        const runningState = this.#launchedApps.get(configIdToRemove);
        if (runningState && runningState.exitResult === null) {
            throw new Error(
                `Cannot remove config for running app: ${configIdToRemove}`,
            );
        }

        const configsMap = await this.#readConfigsFromFile(configPath);
        if (!configsMap.has(configIdToRemove)) {
            throw new Error(`Config with ID '${configIdToRemove}' not found.`);
        }

        configsMap.delete(configIdToRemove);
        await this.#writeConfigsToFile(configPath, configsMap);

        // Also remove from internal state if it exists (even if exited)
        this.#launchedApps.delete(configIdToRemove);

        // Notify renderer about the config change
        const updatedConfigs = Array.from(configsMap.values());
        sendToRenderer(CONFIG_UPDATE_EVENT, updatedConfigs);
    }
}
