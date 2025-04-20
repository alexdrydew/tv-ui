import {
    AppConfig,
    AppConfigId,
    AppExitInfo,
    AppExitResult,
    AppStateInfo,
    LaunchInstanceId,
} from '@app/types';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Effect, Fiber, pipe } from 'effect';
import { invokeAppUpdateListeners } from '../events.js';
import { InvalidCommandError, SpawnError } from './errors.js'; // Removed AppAlreadyRunningError import
import { launchedApps, AppState } from './state.js';

function launchAppEffect(
    config: AppConfig,
): Effect.Effect<AppStateInfo, InvalidCommandError | SpawnError> { // Removed AppAlreadyRunningError from error channel
    const configId = config.id;
    const launchInstanceId = randomUUID(); // Generate unique ID for this launch

    // effect responsible for updating state and notifying listeners upon natural termination
    const updateStateAndNotify = (
        exitInfo: AppExitInfo,
        pid: number | undefined, // Pass PID for logging/identification
    ): Effect.Effect<void> =>
        Effect.sync(() => {
            // Use launchInstanceId for lookup
            const finalState = launchedApps.get(launchInstanceId);
            if (finalState) {
                // Only update if it hasn't been updated already (e.g., by interruption)
                if (finalState.lastExitResult === null) {
                    finalState.lastExitResult = exitInfo;
                    console.log(
                        `Updated state for ${configId} (Instance: ${launchInstanceId}, PID: ${pid ?? 'unknown'}) with exit info: ${JSON.stringify(exitInfo)}`,
                    );
                    // Pass the full state info including launchInstanceId
                    invokeAppUpdateListeners({
                        configId: finalState.configId,
                        launchInstanceId: finalState.launchInstanceId,
                        pid: finalState.pid, // Use PID from state
                        exitResult: finalState.lastExitResult,
                    });
                } else {
                    console.log(
                        `State for ${configId} (Instance: ${launchInstanceId}, PID: ${pid ?? 'unknown'}) already has exit info. Skipping update.`,
                    );
                }
            } else {
                console.warn(
                    `State for naturally exited/errored app ${configId} (Instance: ${launchInstanceId}, PID: ${pid ?? 'unknown'}) not found in map.`,
                );
            }
        });

    // Effect responsible for managing the lifecycle of a single process
    const manageProcessLifecycle = (
        childProcess: ChildProcess,
    ): Effect.Effect<void> =>
        pipe(
            Effect.async<AppExitInfo>(
                (resume: (effect: Effect.Effect<AppExitInfo>) => void) => {
                    const pid = childProcess.pid; // Capture PID early

                    const handleExit = (
                        code: number | null,
                        signal: NodeJS.Signals | null,
                    ) => {
                        console.log(
                            `App ${configId} (Instance: ${launchInstanceId}, PID: ${pid}) exited naturally. Code: ${code}, Signal: ${signal}`,
                        );
                        let exitInfo: AppExitInfo;
                        if (signal) {
                            exitInfo = {
                                type: AppExitResult.Signal,
                                signal: signal,
                            };
                        } else if (code === 0) {
                            exitInfo = { type: AppExitResult.Success };
                        } else if (code !== null) {
                            exitInfo = {
                                type: AppExitResult.ExitCode,
                                code: code,
                            };
                        } else {
                            console.warn(
                                `App ${configId} (Instance: ${launchInstanceId}, PID: ${pid}) exited with null code and null signal.`,
                            );
                            exitInfo = { type: AppExitResult.Unknown };
                        }
                        childProcess.removeAllListeners();
                        // Resume the effect with the exit information
                        resume(Effect.succeed(exitInfo));
                    };

                    const handleError = (err: Error) => {
                        console.error(
                            `Error in launched app ${configId} (Instance: ${launchInstanceId}, PID: ${pid}):`,
                            err,
                        );
                        const exitInfo: AppExitInfo = {
                            type: AppExitResult.Unknown,
                        };
                        childProcess.removeAllListeners();
                        // Resume the effect with 'Unknown' exit information
                        resume(Effect.succeed(exitInfo));
                    };

                    childProcess.on('exit', handleExit);
                    childProcess.on('error', handleError);

                    // Return the interruptor function
                    // State update on interruption remains here for immediate feedback
                    return Effect.sync(() => {
                        const interruptPid = childProcess.pid; // Use PID captured at interruption time
                        console.log(
                            `Interrupting process lifecycle management for ${configId} (Instance: ${launchInstanceId}, PID: ${interruptPid})`,
                        );
                        childProcess.removeAllListeners();
                        if (
                            !childProcess.killed &&
                            childProcess.exitCode === null
                        ) {
                            console.log(
                                `Sending kill signal to ${configId} (Instance: ${launchInstanceId}, PID: ${interruptPid})`,
                            );
                            const killed = childProcess.kill();
                            if (!killed) {
                                console.warn(
                                    `Failed to send kill signal during interrupt for ${configId} (Instance: ${launchInstanceId}, PID: ${interruptPid}). Process might have already exited.`,
                                );
                            }
                            // Update state immediately upon interruption attempt
                            // Use launchInstanceId for lookup
                            const interruptState =
                                launchedApps.get(launchInstanceId);
                            if (
                                interruptState &&
                                interruptState.lastExitResult === null
                            ) {
                                interruptState.lastExitResult = {
                                    type: AppExitResult.Signal,
                                    signal: 'SIGTERM', // Assume SIGTERM was sent
                                };
                                console.log(
                                    `Updated state for ${configId} (Instance: ${launchInstanceId}, PID: ${interruptState.pid}) due to interruption.`,
                                );
                                // Pass the full state info including launchInstanceId
                                invokeAppUpdateListeners({
                                    configId: interruptState.configId,
                                    launchInstanceId:
                                        interruptState.launchInstanceId,
                                    pid: interruptState.pid,
                                    exitResult: interruptState.lastExitResult,
                                });
                            }
                        }
                    });
                },
            ),
            // Chain the state update effect to run after the async part resolves naturally
            Effect.tap((exitInfo) =>
                updateStateAndNotify(exitInfo, childProcess.pid),
            ),
            // Ensure the overall effect resolves to void
            Effect.asVoid,
        );

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
                                configId, // Keep configId for context in error
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
        // Removed validation for already running app
        // parse command
        Effect.sync(() => {
            const parts =
                config.launchCommand.match(/(?:[^\s"]+|"[^"]*")+/g);
            if (!parts || parts.length === 0) {
                return Effect.fail(
                    new InvalidCommandError({
                        command: config.launchCommand,
                    }),
                );
            }
            const cmd = parts[0].replace(/"/g, '');
            const args = parts.slice(1).map((arg) => arg.replace(/"/g, ''));
            return Effect.succeed({ cmd, args });
        }),
        Effect.flatten, // Flatten the nested Effect
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
                // Pass the childProcess directly to manageProcessLifecycle
                Effect.runFork(manageProcessLifecycle(childProcess)),
                Effect.map((fiber) => ({ pid, fiber })),
            ),
        ),
        // Create and store initial state
        Effect.map(({ pid, fiber }) => {
            // Explicitly type initialState to match AppState
            const initialState: AppState = {
                configId: configId,
                launchInstanceId: launchInstanceId, // Include launchInstanceId
                pid: pid,
                lastExitResult: null,
                fiber: fiber,
            };
            // Use launchInstanceId as the key
            launchedApps.set(launchInstanceId, initialState);
            return initialState;
        }),
        // Emit initial running state (side effect)
        Effect.tap((initialState) => {
            // Pass the full state info including launchInstanceId
            invokeAppUpdateListeners({
                configId: initialState.configId,
                launchInstanceId: initialState.launchInstanceId,
                pid: initialState.pid,
                exitResult: initialState.lastExitResult,
            });
            console.log(
                `Emitting initial running state for ${configId} (Instance: ${launchInstanceId})`,
            );
        }),
        // Map to final AppStateInfo result for the launchApp caller
        Effect.map((initialState) => ({
            configId: initialState.configId,
            launchInstanceId: initialState.launchInstanceId, // Include launchInstanceId
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

// Changed: Accepts launchInstanceId instead of configId
export async function killApp(launchInstanceId: LaunchInstanceId): Promise<void> {
    // Use launchInstanceId for lookup
    const appState = launchedApps.get(launchInstanceId);

    if (!appState) {
        console.warn(`App instance ${launchInstanceId} not found for killing.`);
        // Consider throwing an error or returning a specific status
        return;
    }

    if (appState.lastExitResult !== null) {
        console.warn(
            `Attempted to kill app instance ${launchInstanceId} which has already exited.`,
        );
        return; // Nothing to do
    }

    if (!appState.fiber) {
        console.error(
            `App instance ${launchInstanceId} is marked as running but has no associated fiber. State inconsistency.`,
        );
        // Attempt to clean up state
        appState.lastExitResult = { type: AppExitResult.Unknown };
        // Pass the full state info including launchInstanceId
        invokeAppUpdateListeners({
            configId: appState.configId,
            launchInstanceId: appState.launchInstanceId,
            pid: appState.pid,
            exitResult: appState.lastExitResult,
        });
        // Consider throwing an error
        return;
    }

    console.log(
        `Requesting interruption for app instance ${launchInstanceId} (PID: ${appState.pid}) via fiber.`,
    );
    try {
        // Interrupt the fiber. The logic within manageProcessLifecycle's
        // asyncInterrupt interruptor will handle the actual process killing and state update.
        await Effect.runPromise(Fiber.interrupt(appState.fiber));
        console.log(`Fiber interruption for ${launchInstanceId} completed.`);
    } catch (error) {
        console.error(
            `Error during fiber interruption for ${launchInstanceId}:`,
            error,
        );
        // The state might have been updated by the interruptor already,
        // but if the interruption itself failed, the state might be inconsistent.
        // Check state again and update if necessary
        const currentState = launchedApps.get(launchInstanceId);
        if (currentState && currentState.lastExitResult === null) {
            currentState.lastExitResult = { type: AppExitResult.Unknown };
            // Pass the full state info including launchInstanceId
            invokeAppUpdateListeners({
                configId: currentState.configId,
                launchInstanceId: currentState.launchInstanceId,
                pid: currentState.pid,
                exitResult: currentState.lastExitResult,
            });
        }
        // Re-throw or handle the error appropriately
        throw new Error(
            `Failed to interrupt fiber for app instance ${launchInstanceId}: ${error}`,
        );
    }
}
