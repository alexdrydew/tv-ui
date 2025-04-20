import {
    AppConfig,
    AppConfigId,
    AppExitInfo,
    AppExitResult,
    AppState,
    AppStateInfo,
} from '@app/types';
import { ChildProcess, spawn } from 'node:child_process';
import { invokeAppUpdateListeners } from '../events.js';
import { launchedApps } from './state.js';

export async function launchApp(config: AppConfig): Promise<AppStateInfo> {
    const configId = config.id;
    const command = config.launchCommand;

    const existingState = launchedApps.get(configId);
    if (existingState && existingState.lastExitResult === null) {
        // Renamed lastExitResult
        // App is considered running if state exists and exitResult is null
        throw new Error(`Application ${configId} is already running.`);
    }

    // Basic command parsing (split by space, handle potential quotes later if needed)
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (!parts || parts.length === 0) {
        throw new Error('Empty or invalid command provided.');
    }
    // parts[0] is now guaranteed to exist and TypeScript should infer it correctly
    const cmd = parts[0].replace(/"/g, ''); // Remove quotes from command itself
    const args = parts.slice(1).map((arg) => arg.replace(/"/g, '')); // Remove quotes from args

    let childProcess: ChildProcess;
    try {
        // Spawn the process
        // Options: detached: false (usually), stdio: 'pipe' or 'ignore' or 'inherit'
        // 'shell: true' might be needed for complex commands or shell features,
        // but can have security implications. Avoid if possible.
        childProcess = spawn(cmd, args, {
            stdio: 'ignore', // Prevent stdio pipes from keeping process alive
            detached: false, // Keep child attached unless specifically needed otherwise
            // Consider 'shell: true' if complex commands fail, but be wary of security.
            // shell: process.platform === 'win32' // Example: Use shell on Windows
        });
    } catch (error: any) {
        console.error(`Failed to spawn process for ${configId}:`, error);
        throw new Error(`Launch error: ${error.message}`);
    }

    if (childProcess.pid === undefined) {
        // This can happen if the process fails to spawn immediately
        // Check for immediate exit error
        let spawnError = 'Unknown spawn error';
        const errorListener = (err: Error) => {
            spawnError = err.message;
        };
        childProcess.once('error', errorListener);
        // Give a tiny moment for the error event to potentially fire
        await new Promise((resolve) => setTimeout(resolve, 10));
        childProcess.removeListener('error', errorListener);

        throw new Error(
            `Failed to get PID for launched application. It might have exited immediately or failed to start. Error: ${spawnError}`,
        );
    }

    const initialState: AppState = {
        configId: configId,
        pid: childProcess.pid,
        exitResult: null, // Renamed lastExitResult, null indicates running
        process: childProcess,
    };

    // Store the state immediately
    launchedApps.set(configId, initialState);
    console.log(
        `Stored initial state for ${configId}, PID: ${initialState.pid}`,
    );

    // --- Process Event Listeners ---
    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
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
        const finalState = launchedApps.get(configId);
        if (finalState) {
            finalState.lastExitResult = exitInfo; // Renamed lastExitResult
            // Optionally remove the process object now that it's exited
            // delete finalState.process; // Keep process object for potential inspection?
            launchedApps.set(configId, finalState); // Update map
            console.log(`Updated state for ${configId} with exit info.`);
            // Emit update via internal event system
            invokeAppUpdateListeners({
                configId: finalState.configId,
                pid: finalState.pid,
                exitResult: finalState.lastExitResult, // Renamed lastExitResult
            });
        } else {
            console.warn(`State for exited app ${configId} not found in map.`);
        }
        // Clean up listeners AFTER processing exit
        childProcess.removeAllListeners();
    };

    const handleError = (err: Error) => {
        console.error(
            `Error in launched app ${configId} (PID: ${initialState.pid}):`,
            err,
        );
        // Decide how to handle errors - maybe mark as Unknown exit?
        const errorState = launchedApps.get(configId);
        if (errorState && errorState.lastExitResult === null) {
            // Renamed lastExitResult
            // Only update if not already exited
            errorState.lastExitResult = { type: AppExitResult.Unknown }; // Renamed lastExitResult
            // delete errorState.process;
            launchedApps.set(configId, errorState);
            console.log(`Updated state for ${configId} due to error.`);
            invokeAppUpdateListeners({
                configId: errorState.configId,
                pid: errorState.pid,
                exitResult: errorState.lastExitResult, // Renamed lastExitResult
            });
        }
        // Clean up listeners AFTER processing error
        childProcess.removeAllListeners();
    };

    // Use 'once' for error during spawn, 'on' for ongoing errors/exit
    childProcess.on('exit', handleExit);
    childProcess.on('error', handleError);
    // Note: 'close' event fires after stdio streams close, 'exit' fires when process terminates.
    // Using 'exit' is generally sufficient for knowing when the process ends.

    // Emit initial running state via internal event system
    console.log(`Emitting initial running state for ${configId}`);
    invokeAppUpdateListeners({
        configId: initialState.configId,
        pid: initialState.pid,
        exitResult: initialState.lastExitResult, // Renamed lastExitResult
    });

    // Return the initial state info (without the process object)
    return {
        configId: initialState.configId,
        pid: initialState.pid,
        exitResult: initialState.lastExitResult, // Renamed lastExitResult
    };
}

export async function killApp(configId: AppConfigId): Promise<void> {
    const appState = launchedApps.get(configId);

    if (!appState) {
        throw new Error(`App ${configId} not found in managed processes.`);
    }

    if (appState.lastExitResult !== null) {
        // Renamed lastExitResult
        // App is already exited
        console.warn(
            `Attempted to kill app ${configId} which has already exited.`,
        );
        return; // Nothing to do
    }

    if (!appState.process || appState.process.killed) {
        console.warn(
            `Process for app ${configId} (PID: ${appState.pid}) is missing or already killed.`,
        );
        // Consider updating state if process is missing but exitResult is null
        if (!appState.lastExitResult) {
            // Renamed lastExitResult
            appState.lastExitResult = { type: AppExitResult.Unknown }; // Renamed lastExitResult, Mutate state
            launchedApps.set(configId, appState); // Update map
            invokeAppUpdateListeners({
                configId: appState.configId,
                pid: appState.pid,
                exitResult: appState.lastExitResult, // Renamed lastExitResult
            });
        }
        return; // Nothing more to do
    }

    try {
        // kill() sends SIGTERM by default. Can specify other signals.
        // Returns true if signal was sent, false otherwise.
        const killed = appState.process.kill(); // Sends SIGTERM
        if (!killed) {
            console.warn(
                `Failed to send kill signal to process for app ${configId} (PID: ${appState.pid}). It might have already exited.`,
            );
            // Check if it exited between the check and the kill attempt
            // This check might be redundant if the 'exit' listener is reliable
            if (
                appState.process.exitCode !== null ||
                appState.process.signalCode !== null
            ) {
                console.log(
                    `Process ${appState.pid} seems to have exited just before kill signal was confirmed. State should be updated by 'exit' listener.`,
                );
                // The 'exit' listener should handle this case.
                // If the listener somehow missed it, the state might remain 'running' incorrectly.
            }
        } else {
            console.log(
                `Sent kill signal (SIGTERM) to app ${configId} (PID: ${appState.pid})`,
            );
            // The 'exit' listener attached in launchApp will handle the state update and event emission.
            // No need to manually update state here unless the listener fails.
        }
    } catch (error: any) {
        console.error(
            `Error killing process for app ${configId} (PID: ${appState.pid}):`,
            error,
        );
        // Update state to Unknown if kill fails unexpectedly?
        if (appState.lastExitResult === null) {
            // Renamed lastExitResult
            appState.lastExitResult = { type: AppExitResult.Unknown }; // Renamed lastExitResult, Mutate state
            launchedApps.set(configId, appState); // Update map
            invokeAppUpdateListeners({
                configId: appState.configId,
                pid: appState.pid,
                exitResult: appState.lastExitResult,
            });
        }
        throw new Error(`Failed to kill process: ${error.message}`);
    }
}
