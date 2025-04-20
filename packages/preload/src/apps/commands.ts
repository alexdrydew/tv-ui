import {
    AppConfig,
    AppExitInfo,
    AppExitResult,
    AppStateInfo,
    LaunchInstanceId,
} from '@app/types';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Effect, pipe } from 'effect';
import {
    InvalidCommandError,
    SpawnError,
    AppAlreadyRunningError,
    AppNotFoundError,
    AppAlreadyExitedError,
    KillError,
} from './errors.js';
import {
    launchedApps,
    AppState,
    updateGlobalStateAndNotify,
    insertGlobalStateAndNotify,
    getRunningAppsByConfigId,
} from './state.js';

const createProcessWatcherEffect = (
    appState: AppState,
    childProcess: ChildProcess,
) => {
    // This effect resolves when the process exits or errors *naturally*.
    // It's responsible for the final state update via updateGlobalStateAndNotify.
    return Effect.async<AppExitInfo>((resume) => {
        const pid = childProcess.pid;

        // Ensure PID exists before attaching listeners
        if (pid === undefined) {
            console.error(
                `Cannot watch process for ${appState.configId} (Instance: ${appState.launchInstanceId}) - PID is undefined.`,
            );
            // Immediately resolve with Unknown error if PID is missing
            resume(Effect.succeed({ type: AppExitResult.Unknown }));
            return; // Don't attach listeners
        }

        const handleExit = (
            code: number | null,
            signal: NodeJS.Signals | null,
        ) => {
            console.log(
                `App ${appState.configId} (Instance: ${appState.launchInstanceId}, PID: ${pid}) exited. Code: ${code}, Signal: ${signal}`,
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
                    `App ${appState.configId} (Instance: ${appState.launchInstanceId}, PID: ${pid}) exited with null code and null signal.`,
                );
                exitInfo = { type: AppExitResult.Unknown };
            }
            childProcess.removeAllListeners();
            resume(Effect.succeed(exitInfo));
        };

        const handleError = (err: Error) => {
            console.error(
                `Error in launched app ${appState.configId} (Instance: ${appState.launchInstanceId}, PID: ${pid}):`,
                err,
            );
            // Treat error as an Unknown exit cause
            const exitInfo: AppExitInfo = {
                type: AppExitResult.Unknown,
            };
            childProcess.removeAllListeners();
            resume(Effect.succeed(exitInfo));
        };

        childProcess.on('exit', handleExit);
        childProcess.on('error', handleError);

        // No explicit cleanup needed here as removeAllListeners is called on exit/error
    });
};

// helper function to check PID and get error if it is missing
const checkPid = (
    config: AppConfig,
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
                            configId: config.id,
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

const launchAppEffect = (
    config: AppConfig,
): Effect.Effect<AppStateInfo, InvalidCommandError | SpawnError | AppAlreadyRunningError> => {
    const configId = config.id;
    const launchInstanceId = randomUUID();

    // effect responsible for managing the lifecycle of a single process and updating global state
    const manageProcessLifecycle = (
        appState: AppState,
        childProcess: ChildProcess,
    ): Effect.Effect<void> =>
        pipe(
            createProcessWatcherEffect(appState, childProcess),
            // When the watcher resolves (process exited), update the global state
            Effect.flatMap((exitInfo) =>
                Effect.sync(() =>
                    updateGlobalStateAndNotify(launchInstanceId, exitInfo),
                ),
            ),
            // Ensure state update happens even if the watcher effect is interrupted (though less likely now)
            Effect.ensuring(
                Effect.sync(() => {
                    const currentState = launchedApps.get(launchInstanceId);
                    // If the process watcher didn't update the state (e.g., interrupted before exit), mark as Unknown
                    if (currentState && currentState.lastExitResult === undefined) {
                        console.warn(
                            `Process watcher for ${launchInstanceId} finished without exit info. Marking as Unknown.`,
                        );
                        updateGlobalStateAndNotify(launchInstanceId, {
                            type: AppExitResult.Unknown,
                        });
                    }
                }),
            ),
        );

    return pipe(
        // validation for already running app
        Effect.sync(() => {
            const runningApps = getRunningAppsByConfigId(configId);
            if (runningApps.length > 0) {
                // Fail the effect if already running
                return Effect.fail(
                    new AppAlreadyRunningError({
                        configId,
                        message: `App ${configId} is already running with instance ID ${runningApps[0].launchInstanceId}.`,
                    }),
                );
            }
            // Succeed with void if not running
            return Effect.void;
        }),
        // Use Effect.andThen to proceed only if the previous check succeeded
        Effect.andThen(() => {
            // parse command
            const parts = config.launchCommand.match(/(?:[^\s"]+|"[^"]*")+/g);
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
        // try to get PID or spawn error
        Effect.flatMap((childProcess) =>
            pipe(
                checkPid(config, childProcess),
                Effect.map((pid) => ({ childProcess, pid })),
            ),
        ),
        // fork the process lifecycle management effect
        Effect.flatMap(({ childProcess, pid }) => {
            const appState: AppState = {
                launchInstanceId,
                configId: config.id,
                pid,
                // lastExitResult is initially undefined
            };
            // Fork the watcher effect. We don't need the fiber itself anymore.
            return pipe(
                Effect.forkDaemon(manageProcessLifecycle(appState, childProcess)),
                Effect.map(() => appState), // Return the initial state after forking
            );
        }),
        // create and store initial state, then notify listeners
        Effect.map((appState) => insertGlobalStateAndNotify(appState)),
        // Map the internal AppState back to AppStateInfo for the caller
        Effect.map(
            (appState): AppStateInfo => ({
                configId: appState.configId,
                launchInstanceId: appState.launchInstanceId,
                pid: appState.pid,
                exitResult: null, // Indicate running state to caller
            }),
        ),
    );
};

export async function launchApp(config: AppConfig): Promise<AppStateInfo> {
    const effect = launchAppEffect(config);
    // Run the effect and handle potential errors
    return Effect.runPromise(effect);
}

// --- killApp Implementation ---

const killAppEffect = (
    launchInstanceId: LaunchInstanceId,
): Effect.Effect<
    void,
    AppNotFoundError | AppAlreadyExitedError | KillError
> => {
    return pipe(
        // 1. Find the AppState
        Effect.sync(() => launchedApps.get(launchInstanceId)),
        Effect.flatMap((appState) =>
            appState
                ? Effect.succeed(appState)
                : Effect.fail(new AppNotFoundError({ launchInstanceId })),
        ),
        // 2. Check if already exited
        Effect.flatMap((appState) =>
            appState.lastExitResult !== undefined // Check if undefined (meaning running)
                ? Effect.fail(
                      new AppAlreadyExitedError({
                          launchInstanceId,
                          message: `App instance ${launchInstanceId} has already exited with: ${JSON.stringify(appState.lastExitResult)}`,
                      }),
                  )
                : Effect.succeed(appState),
        ),
        // 3. Attempt to send SIGKILL
        Effect.flatMap((appState) =>
            Effect.try({
                try: () => {
                    console.log(
                        `Attempting to kill process PID ${appState.pid} for instance ${launchInstanceId} with SIGKILL.`,
                    );
                    // process.kill returns true if successful, throws error otherwise
                    const success = process.kill(appState.pid, 'SIGKILL');
                    if (!success) {
                        // This case might be rare, often throws error instead
                        throw new Error(
                            `process.kill(${appState.pid}, 'SIGKILL') returned false.`,
                        );
                    }
                    console.log(
                        `Successfully sent SIGKILL to PID ${appState.pid} for instance ${launchInstanceId}. Waiting for exit event...`,
                    );
                },
                catch: (error) => {
                    console.error(
                        `Failed to send SIGKILL to PID ${appState.pid} for instance ${launchInstanceId}:`,
                        error,
                    );
                    // Check for specific errors if needed (e.g., ESRCH, EPERM)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const code = (error as any)?.code;
                    let message = `Failed to kill process: ${error instanceof Error ? error.message : String(error)}`;
                    if (code === 'ESRCH') {
                        message = `Process with PID ${appState.pid} not found (ESRCH). It might have already exited.`;
                        // If process doesn't exist, maybe update state here?
                        // Or rely on watcher potentially having already updated it.
                        // Let's rely on the watcher for now.
                    } else if (code === 'EPERM') {
                        message = `Permission denied to kill PID ${appState.pid} (EPERM).`;
                    }
                    return new KillError({
                        launchInstanceId,
                        pid: appState.pid,
                        cause: error,
                        message,
                    });
                },
            }),
        ),
        // Ensure the effect returns void on success
        Effect.asVoid,
    );
};

export async function killApp(
    launchInstanceId: LaunchInstanceId,
): Promise<void> {
    // Run the kill effect
    const effect = killAppEffect(launchInstanceId);
    try {
        await Effect.runPromise(effect);
    } catch (error) {
        // Log errors from killAppEffect, but don't necessarily rethrow unless needed by caller
        console.error(`Error killing app instance ${launchInstanceId}:`, error);
        // Rethrow if the caller needs to handle specific kill errors
        // throw error;
    }
    // Note: State update (setting lastExitResult) happens asynchronously
    // when the process watcher detects the 'exit' event triggered by SIGKILL.
}
