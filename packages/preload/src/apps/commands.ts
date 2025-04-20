import {
    AppConfig,
    AppConfigId,
    AppExitInfo,
    AppExitResult,
    AppState,
    AppState,
    AppStateInfo,
} from '@app/types';
import { ChildProcess, spawn } from 'node:child_process';
import { Data, Effect, pipe } from 'effect';
import { invokeAppUpdateListeners } from '../events.js';
import {
    AppAlreadyRunningError,
    InvalidCommandError,
    SpawnError,
} from './errors.js';
import { launchedApps, AppState } from './state.js';

// Internal Effect-based implementation
function launchAppEffect(
    config: AppConfig,
): Effect.Effect<
    AppStateInfo,
    AppAlreadyRunningError | InvalidCommandError | SpawnError
> {
    return Effect.gen(function* (_) {
        const configId = config.id;
        const command = config.launchCommand;

        // 1. Check if already running
        const existingState = yield* _(
            Effect.sync(() => launchedApps.get(configId)),
        );
        if (existingState && existingState.exitResult === null) {
            return yield* _(Effect.fail(new AppAlreadyRunningError({ configId })));
        }

        // 2. Parse command
        const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);
        if (!parts || parts.length === 0) {
            return yield* _(Effect.fail(new InvalidCommandError({ command })));
        }
        const cmd = parts[0].replace(/"/g, '');
        const args = parts.slice(1).map((arg) => arg.replace(/"/g, ''));

        // 3. Spawn process
        const childProcess = yield* _(
            Effect.try({
                try: () => spawn(cmd, args, { stdio: 'ignore', detached: false }),
                catch: (error) =>
                    new SpawnError({
                        configId,
                        cause: error,
                        message: `Spawn failed: ${error instanceof Error ? error.message : String(error)}`,
                    }),
            }),
        );

        // 4. Check PID asynchronously
        const pid = yield* _(
            Effect.async<number, SpawnError>((resume) => {
                if (childProcess.pid !== undefined) {
                    resume(Effect.succeed(childProcess.pid));
                    return;
                }

                // Handle case where PID is initially undefined (immediate exit/error)
                let spawnErrorMsg = 'Unknown spawn error';
                const errorListener = (err: Error) => {
                    spawnErrorMsg = err.message;
                };
                childProcess.once('error', errorListener);

                // Give a brief moment for error/exit events
                const timeoutId = setTimeout(() => {
                    childProcess.removeListener('error', errorListener); // Clean up temp listener
                    if (childProcess.pid !== undefined) {
                        resume(Effect.succeed(childProcess.pid));
                    } else if (spawnErrorMsg !== 'Unknown spawn error') {
                        resume(
                            Effect.fail(
                                new SpawnError({
                                    configId,
                                    message: `Failed to get PID. Error: ${spawnErrorMsg}`,
                                }),
                            ),
                        );
                    } else {
                        resume(
                            Effect.fail(
                                new SpawnError({
                                    configId,
                                    message:
                                        'Failed to get PID. Process might have exited immediately.',
                                }),
                            ),
                        );
                    }
                }, 50); // 50ms delay - adjust if needed

                // Cleanup function for the async effect
                return Effect.sync(() => clearTimeout(timeoutId));
            }),
        );

        // 5. Create and store initial state
        const initialState: AppState = {
            configId: configId,
            pid: pid,
            exitResult: null,
            process: childProcess,
        };
        yield* _(Effect.sync(() => launchedApps.set(configId, initialState)));
        console.log(`Stored initial state for ${configId}, PID: ${pid}`);

        // 6. Setup listeners (as side effects)
        yield* _(
            Effect.sync(() => {
                const handleExit = (
                    code: number | null,
                    signal: NodeJS.Signals | null,
                ) => {
                    console.log(
                        `App ${configId} (PID: ${pid}) exited. Code: ${code}, Signal: ${signal}`,
                    );
                    let exitInfo: AppExitInfo;
                    if (signal) {
                        exitInfo = { type: AppExitResult.Signal, signal: signal };
                    } else if (code === 0) {
                        exitInfo = { type: AppExitResult.Success };
                    } else if (code !== null) {
                        exitInfo = { type: AppExitResult.ExitCode, code: code };
                    } else {
                        console.warn(
                            `App ${configId} exited with null code and null signal.`,
                        );
                        exitInfo = { type: AppExitResult.Unknown };
                    }

                    const finalState = launchedApps.get(configId);
                    if (finalState) {
                        finalState.exitResult = exitInfo;
                        // Maybe remove process object: delete finalState.process;
                        launchedApps.set(configId, finalState);
                        console.log(
                            `Updated state for ${configId} with exit info.`,
                        );
                        invokeAppUpdateListeners({
                            configId: finalState.configId,
                            pid: finalState.pid,
                            exitResult: finalState.exitResult,
                        });
                    } else {
                        console.warn(
                            `State for exited app ${configId} not found in map.`,
                        );
                    }
                    childProcess.removeAllListeners(); // Clean up here
                };

                const handleError = (err: Error) => {
                    console.error(
                        `Error in launched app ${configId} (PID: ${pid}):`,
                        err,
                    );
                    const errorState = launchedApps.get(configId);
                    if (errorState && errorState.exitResult === null) {
                        errorState.exitResult = { type: AppExitResult.Unknown };
                        // Maybe remove process object: delete errorState.process;
                        launchedApps.set(configId, errorState);
                        console.log(
                            `Updated state for ${configId} due to error.`,
                        );
                        invokeAppUpdateListeners({
                            configId: errorState.configId,
                            pid: errorState.pid,
                            exitResult: errorState.exitResult,
                        });
                    }
                    childProcess.removeAllListeners(); // Clean up here
                };

                childProcess.on('exit', handleExit);
                childProcess.on('error', handleError);
            }),
        );

        // 7. Emit initial running state
        yield* _(
            Effect.sync(() =>
                invokeAppUpdateListeners({
                    configId: initialState.configId,
                    pid: initialState.pid,
                    exitResult: initialState.exitResult,
                }),
            ),
        );
        console.log(`Emitting initial running state for ${configId}`);

        // 8. Return AppStateInfo
        return {
            configId: initialState.configId,
            pid: initialState.pid,
            exitResult: initialState.exitResult,
        };
    });
}

// Exported function remains async and runs the effect
export async function launchApp(config: AppConfig): Promise<AppStateInfo> {
    const effect = launchAppEffect(config);
    // Run the effect and return the promise. Errors in the Effect's
    // error channel will cause the promise to reject.
    return Effect.runPromise(effect);
}

export async function killApp(configId: AppConfigId): Promise<void> {
    const appState = launchedApps.get(configId);


    if (!appState) {
        throw new Error(`App ${configId} not found in managed processes.`);
    }

    if (appState.exitResult !== null) {
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
        if (!appState.exitResult) {
            // Renamed lastExitResult
            appState.exitResult = { type: AppExitResult.Unknown }; // Renamed lastExitResult, Mutate state
            launchedApps.set(configId, appState); // Update map
            invokeAppUpdateListeners({
                configId: appState.configId,
                pid: appState.pid,
                exitResult: appState.exitResult, // Renamed lastExitResult
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
        if (appState.exitResult === null) {
            // Renamed lastExitResult
            appState.exitResult = { type: AppExitResult.Unknown }; // Renamed lastExitResult, Mutate state
            launchedApps.set(configId, appState); // Update map
            invokeAppUpdateListeners({
                configId: appState.configId,
                pid: appState.pid,
                exitResult: appState.exitResult, // Renamed lastExitResult
            });
        }
        throw new Error(`Failed to kill process: ${error.message}`);
    }
}
