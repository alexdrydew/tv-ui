import { AppConfigId } from '@app/types';
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
