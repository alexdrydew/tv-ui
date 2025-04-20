import {
    AppConfig,
    AppConfigId,
    AppExitInfo,
    AppExitResult,
    AppStateInfo,
} from '@app/types';
import { spawn, ChildProcess } from 'node:child_process';
import { Effect, Fiber, pipe, asyncInterrupt, unit } from 'effect';
import { invokeAppUpdateListeners } from '../events.js';
import {
    AppAlreadyRunningError,
    InvalidCommandError,
    SpawnError,
} from './errors.js';
import { launchedApps, AppState } from './state.js';

function launchAppEffect(
    config: AppConfig,
): Effect.Effect<
    AppStateInfo,
    AppAlreadyRunningError | InvalidCommandError | SpawnError
> {
    const configId = config.id;

    // Effect responsible for managing the lifecycle of a single process
    const manageProcessLifecycle = (
        pid: number,
        childProcess: ChildProcess,
    ): Effect.Effect<void> =>
        asyncInterrupt<void>((resume: (effect: Effect.Effect<void>) => void) => {
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
                    finalState.lastExitResult = exitInfo;
                    // No need to update map here, it's the same object reference
                    console.log(
                        `Updated state for ${configId} with exit info.`,
                    );
                    invokeAppUpdateListeners({
                        configId: finalState.configId,
                        pid: finalState.pid,
                        exitResult: finalState.lastExitResult,
                    });
                } else {
                    console.warn(
                        `State for exited app ${configId} not found in map.`,
                    );
                }
                childProcess.removeAllListeners();
                resume(unit); // Signal completion of the effect
            };

            const handleError = (err: Error) => {
                console.error(
                    `Error in launched app ${configId} (PID: ${pid}):`,
                    err,
                );
                const errorState = launchedApps.get(configId);
                if (errorState && errorState.lastExitResult === null) {
                    errorState.lastExitResult = { type: AppExitResult.Unknown };
                    console.log(`Updated state for ${configId} due to error.`);
                    invokeAppUpdateListeners({
                        configId: errorState.configId,
                        pid: errorState.pid,
                        exitResult: errorState.lastExitResult,
                    });
                }
                childProcess.removeAllListeners();
                // Signal completion even on error, as the process lifecycle has ended
                resume(unit);
            };

            childProcess.on('exit', handleExit);
            childProcess.on('error', handleError);

            // Return the interruptor function
            return Effect.sync(() => {
                console.log(
                    `Interrupting process lifecycle management for ${configId} (PID: ${pid})`,
                );
                childProcess.removeAllListeners();
                if (!childProcess.killed && childProcess.exitCode === null) {
                    console.log(`Sending kill signal to ${configId} (PID: ${pid})`);
                    const killed = childProcess.kill(); // Sends SIGTERM
                    if (!killed) {
                        console.warn(
                            `Failed to send kill signal during interrupt for ${configId} (PID: ${pid}). Process might have already exited.`,
                        );
                    }
                    // Update state immediately upon interruption attempt
                    const interruptState = launchedApps.get(configId);
                    if (interruptState && interruptState.lastExitResult === null) {
                        interruptState.lastExitResult = {
                            type: AppExitResult.Signal,
                            signal: 'SIGTERM', // Assume SIGTERM was sent
                        };
                        console.log(
                            `Updated state for ${configId} due to interruption.`,
                        );
                        invokeAppUpdateListeners({
                            configId: interruptState.configId,
                            pid: interruptState.pid,
                            exitResult: interruptState.lastExitResult,
                        });
                    }
                }
                // No need to resume here, interruption stops the effect
            });
        });

    // Helper function to check PID asynchronously
    const checkPid = (
        childProcess: ChildProcess,
    ): Effect.Effect<number, SpawnError> =>
        Effect.async<number, SpawnError>((resume) => {
            if (childProcess.pid !== undefined) {
                resume(Effect.succeed(childProcess.pid));
                return;
            }
            let spawnErrorMsg = 'Unknown spawn error';
            const errorListener = (err: Error) => {
                spawnErrorMsg = err.message;
            };
            childProcess.once('error', errorListener);
            const timeoutId = setTimeout(() => {
                childProcess.removeListener('error', errorListener);
                if (childProcess.pid !== undefined) {
                    resume(Effect.succeed(childProcess.pid));
                } else {
                    resume(
                        Effect.fail(
                            new SpawnError({
                                configId,
                                message:
                                    spawnErrorMsg !== 'Unknown spawn error'
                                        ? `Failed to get PID. Error: ${spawnErrorMsg}`
                                        : 'Failed to get PID. Process might have exited immediately.',
                            }),
                        ),
                    );
                }
            }, 50); // Reduced timeout for faster feedback
            // Cleanup timeout on effect disposal (though less critical here)
            return Effect.sync(() => clearTimeout(timeoutId));
        });

    return pipe(
        // validate that app is not already running
        Effect.sync(() => launchedApps.get(configId)),
        Effect.flatMap((existingState) =>
            existingState && existingState.lastExitResult === null
                ? Effect.fail(new AppAlreadyRunningError({ configId }))
                : Effect.succeed(config),
        ),
        // parse command
        Effect.flatMap((currentConfig) => {
            const parts =
                currentConfig.launchCommand.match(/(?:[^\s"]+|"[^"]*")+/g);
            if (!parts || parts.length === 0) {
                return Effect.fail(
                    new InvalidCommandError({
                        command: currentConfig.launchCommand,
                    }),
                );
            }
            const cmd = parts[0].replace(/"/g, '');
            const args = parts.slice(1).map((arg) => arg.replace(/"/g, ''));
            return Effect.succeed({ cmd, args });
        }),
        // spawn process
        Effect.flatMap(({ cmd, args }) =>
            Effect.try({
                try: () =>
                    spawn(cmd, args, { stdio: 'ignore', detached: false }),
                catch: (error) =>
                    new SpawnError({
                        configId,
                        cause: error,
                        message: `Spawn failed: ${error instanceof Error ? error.message : String(error)}`,
                    }),
            }),
        ),
        // check PID asynchronously
        Effect.flatMap((childProcess) =>
            pipe(
                checkPid(childProcess),
                Effect.map((pid) => ({ childProcess, pid })),
            ),
        ),
        // Fork the process lifecycle management effect
        Effect.flatMap(({ childProcess, pid }) =>
            pipe(
                Effect.runFork(manageProcessLifecycle(pid, childProcess)),
                Effect.map((fiber) => ({ pid, fiber })),
            ),
        ),
        // Create and store initial state
        Effect.map(({ pid, fiber }) => {
            // Explicitly type initialState to match AppState
            const initialState: AppState = {
                configId: configId,
                pid: pid,
                lastExitResult: null,
                fiber: fiber, // fiber is Fiber.RuntimeFiber<void, never>
            };
            launchedApps.set(configId, initialState); // Store the state with the fiber
            return initialState;
        }),
        // Emit initial running state (side effect)
        Effect.tap((initialState) => {
            invokeAppUpdateListeners({
                configId: initialState.configId,
                pid: initialState.pid,
                exitResult: initialState.lastExitResult,
            });
            console.log(`Emitting initial running state for ${configId}`);
        }),
        // Map to final AppStateInfo result for the launchApp caller
        Effect.map((initialState) => ({
            configId: initialState.configId,
            pid: initialState.pid,
            exitResult: initialState.lastExitResult,
        })),
    );
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
        console.warn(`App ${configId} not found for killing.`);
        // Consider throwing an error or returning a specific status
        return;
    }

    if (appState.lastExitResult !== null) {
        console.warn(
            `Attempted to kill app ${configId} which has already exited.`,
        );
        return; // Nothing to do
    }

    if (!appState.fiber) {
        console.error(
            `App ${configId} is marked as running but has no associated fiber. State inconsistency.`,
        );
        // Attempt to clean up state
        appState.lastExitResult = { type: AppExitResult.Unknown };
        invokeAppUpdateListeners({
            configId: appState.configId,
            pid: appState.pid,
            exitResult: appState.lastExitResult,
        });
        // Consider throwing an error
        return;
    }

    console.log(`Requesting interruption for app ${configId} (PID: ${appState.pid}) via fiber.`);
    try {
        // Interrupt the fiber. The logic within manageProcessLifecycle's
        // asyncInterrupt interruptor will handle the actual process killing and state update.
        await Effect.runPromise(Fiber.interrupt(appState.fiber));
        console.log(`Fiber interruption for ${configId} completed.`);
    } catch (error) {
        console.error(`Error during fiber interruption for ${configId}:`, error);
        // The state might have been updated by the interruptor already,
        // but if the interruption itself failed, the state might be inconsistent.
        // Check state again and update if necessary
        const currentState = launchedApps.get(configId);
        if (currentState && currentState.lastExitResult === null) {
            currentState.lastExitResult = { type: AppExitResult.Unknown };
            invokeAppUpdateListeners({
                configId: currentState.configId,
                pid: currentState.pid,
                exitResult: currentState.lastExitResult,
            });
        }
        // Re-throw or handle the error appropriately
        throw new Error(`Failed to interrupt fiber for app ${configId}: ${error}`);
    }
}
