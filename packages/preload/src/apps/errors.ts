import { AppConfigId, LaunchInstanceId } from '@app/types';
import { Data } from 'effect';

export class AppAlreadyRunningError extends Data.TaggedError(
    'AppAlreadyRunningError',
)<{
    readonly configId: AppConfigId;
    readonly message?: string;
}> {
    constructor(args: { configId: AppConfigId; message?: string }) {
        super({
            ...args,
            message:
                args.message ??
                `Application ${args.configId} is already running.`,
        });
    }
}

export class InvalidCommandError extends Data.TaggedError('InvalidCommandError')<{
    readonly command: string;
    readonly message?: string;
}> {
    constructor(args: { command: string; message?: string }) {
        super({
            ...args,
            message:
                args.message ??
                `Invalid or empty command provided: "${args.command}"`,
        });
    }
}

export class SpawnError extends Data.TaggedError('SpawnError')<{
    readonly configId: AppConfigId;
    readonly cause?: unknown;
    readonly message?: string;
}> {
    constructor(args: {
        configId: AppConfigId;
        cause?: unknown;
        message?: string;
    }) {
        super({
            ...args,
            message:
                args.message ?? `Failed to spawn process for ${args.configId}.`,
        });
    }
}

export class AppNotFoundError extends Data.TaggedError('AppNotFoundError')<{
    readonly launchInstanceId: LaunchInstanceId;
    readonly message?: string;
}> {
    constructor(args: { launchInstanceId: LaunchInstanceId; message?: string }) {
        super({
            ...args,
            message:
                args.message ??
                `App instance with ID '${args.launchInstanceId}' not found.`,
        });
    }
}

export class AppAlreadyExitedError extends Data.TaggedError(
    'AppAlreadyExitedError',
)<{
    readonly launchInstanceId: LaunchInstanceId;
    readonly message?: string;
}> {
    constructor(args: { launchInstanceId: LaunchInstanceId; message?: string }) {
        super({
            ...args,
            message:
                args.message ??
                `App instance with ID '${args.launchInstanceId}' has already exited.`,
        });
    }
}

export class KillError extends Data.TaggedError('KillError')<{
    readonly launchInstanceId: LaunchInstanceId;
    readonly pid: number;
    readonly cause?: unknown;
    readonly message?: string;
}> {
    constructor(args: {
        launchInstanceId: LaunchInstanceId;
        pid: number;
        cause?: unknown;
        message?: string;
    }) {
        super({
            ...args,
            message:
                args.message ??
                `Failed to kill process with PID ${args.pid} for instance '${args.launchInstanceId}'.`,
        });
    }
}
