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
import { killProcessEffect } from '#src/lib/process/index.js';
import { ProcessNotFoundError } from '#src/lib/process/errors.js';

const createProcessWatcherEffect = (
    appState: AppState,
    childProcess: ChildProcess,
    pid: number,
) => {
    return Effect.async<AppExitInfo>((resume) => {
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
    });
};

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
        }, 50);
        return Effect.sync(() => clearTimeout(timeoutId));
    });

const launchAppEffect = (
    config: AppConfig,
): Effect.Effect<
    AppStateInfo,
    InvalidCommandError | SpawnError | AppAlreadyRunningError
> => {
    const configId = config.id;
    const launchInstanceId = randomUUID();

    const manageProcessLifecycle = (
        appState: AppState,
        childProcess: ChildProcess,
        pid: number,
    ): Effect.Effect<void> =>
        pipe(
            createProcessWatcherEffect(appState, childProcess, pid),
            Effect.map((exitInfo) =>
                updateGlobalStateAndNotify(launchInstanceId, exitInfo),
            ),
            Effect.ensuring(
                Effect.sync(() => {
                    const currentState = launchedApps.get(launchInstanceId);
                    if (
                        currentState &&
                        currentState.lastExitResult === undefined
                    ) {
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
                return Effect.fail(
                    new AppAlreadyRunningError({
                        configId,
                        message: `App ${configId} is already running with instance ID ${runningApps[0].launchInstanceId}.`,
                    }),
                );
            }
            return Effect.void;
        }),
        Effect.andThen(() => {
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
        Effect.andThen(({ cmd, args }) =>
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
        Effect.andThen((childProcess) =>
            pipe(
                checkPid(config, childProcess),
                Effect.map((pid) => ({ childProcess, pid })),
            ),
        ),
        // fork the process lifecycle management effect
        Effect.andThen(({ childProcess, pid }) => {
            const appState: AppState = {
                launchInstanceId,
                configId: config.id,
                pid,
            };
            return pipe(
                Effect.forkDaemon(
                    manageProcessLifecycle(appState, childProcess, pid),
                ),
                Effect.map(() => appState),
            );
        }),
        // create and store initial state, then notify listeners
        Effect.andThen((appState) => insertGlobalStateAndNotify(appState)),
    );
};

export async function launchApp(config: AppConfig): Promise<AppStateInfo> {
    const effect = launchAppEffect(config);
    return Effect.runPromise(effect);
}

const killAppEffect = (
    launchInstanceId: LaunchInstanceId,
): Effect.Effect<
    void,
    AppNotFoundError | AppAlreadyExitedError | KillError
> => {
    return pipe(
        // TODO: technically we can kill other app with this due to a race condition if pid is reused before our watcher sees that app has exited
        Effect.sync(() => launchedApps.get(launchInstanceId)),
        Effect.andThen((appState) =>
            appState
                ? Effect.succeed(appState)
                : Effect.fail(new AppNotFoundError({ launchInstanceId })),
        ),
        // check if already exited
        Effect.andThen((appState) =>
            appState.lastExitResult !== undefined
                ? Effect.fail(
                      new AppAlreadyExitedError({
                          launchInstanceId,
                          message: `App instance ${launchInstanceId} has already exited with: ${JSON.stringify(appState.lastExitResult)}`,
                      }),
                  )
                : Effect.succeed(appState),
        ),
        // attempt to send SIGKILL using the new effect
        Effect.andThen((appState) =>
            pipe(
                killProcessEffect(appState.pid, 'SIGKILL'),
                Effect.mapError((processError) => {
                    let message = `Failed to kill process: ${processError.message}`;
                    if (processError instanceof ProcessNotFoundError) {
                        message = `Process with PID ${appState.pid} not found (ESRCH). It might have already exited.`;
                    }
                    return new KillError({
                        launchInstanceId: appState.launchInstanceId,
                        pid: appState.pid,
                        cause: processError,
                        message,
                    });
                }),
            ),
        ),
    );
};

export async function killApp(
    launchInstanceId: LaunchInstanceId,
): Promise<void> {
    const effect = killAppEffect(launchInstanceId);
    try {
        await Effect.runPromise(effect);
    } catch (error) {
        console.error(`Error killing app instance ${launchInstanceId}:`, error);
    }
}
