import {
    AppConfig,
    AppExitInfo,
    AppExitResult,
    AppStateInfo,
    LaunchInstanceId,
} from '@app/types';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Effect, Fiber, pipe } from 'effect';
import { invokeAppUpdateListeners } from '../events.js';
import {
    InvalidCommandError,
    SpawnError,
    AppAlreadyRunningError,
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
    return (resume: (effect: Effect.Effect<AppExitInfo>) => void) => {
        const pid = childProcess.pid;

        const handleExit = (
            code: number | null,
            signal: NodeJS.Signals | null,
        ) => {
            console.log(
                `App ${appState.configId} (Instance: ${appState.launchInstanceId}, PID: ${pid}) exited naturally. Code: ${code}, Signal: ${signal}`,
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
            const exitInfo: AppExitInfo = {
                type: AppExitResult.Unknown,
            };
            childProcess.removeAllListeners();
            resume(Effect.succeed(exitInfo));
        };

        childProcess.on('exit', handleExit);
        childProcess.on('error', handleError);
    };
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
): Effect.Effect<AppStateInfo, InvalidCommandError | SpawnError> => {
    const configId = config.id;
    const launchInstanceId = randomUUID();

    // effect responsible for managing the lifecycle of a single process and updating global state
    const manageProcessLifecycle = (
        appState: AppState,
        childProcess: ChildProcess,
    ): Effect.Effect<void> =>
        pipe(
            Effect.async<AppExitInfo>(
                createProcessWatcherEffect(appState, childProcess),
            ),
            Effect.tap((exitInfo) =>
                updateGlobalStateAndNotify(launchInstanceId, exitInfo),
            ),
        );

    return pipe(
        // validation for already running app
        Effect.sync(() => {
            const runningApps = getRunningAppsByConfigId(configId);
            if (runningApps.length > 0) {
                return Effect.fail(
                    new AppAlreadyRunningError({
                        configId,
                        message: `App ${configId} is already running with instance ID ${runningApps[0].launchInstanceId}.`,
                    }),
                );
            }
            return Effect.void;
        }),
        // parse command
        Effect.flatMap(() => {
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
            const appState = {
                launchInstanceId,
                configId: config.id,
                pid,
            };
            return pipe(
                Effect.runFork(manageProcessLifecycle(appState, childProcess)),
                Effect.map((fiber) => ({ appState, fiber })),
            );
        }),
        // create and store initial state
        // TODO: store fiber?
        Effect.map(({ appState }) => insertGlobalStateAndNotify(appState)),
    );
};

export async function launchApp(config: AppConfig): Promise<AppStateInfo> {
    const effect = launchAppEffect(config);
    return Effect.runPromise(effect);
}

// Changed: Accepts launchInstanceId instead of configId
export async function killApp(
    launchInstanceId: LaunchInstanceId,
): Promise<void> {
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
