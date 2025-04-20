import { Data } from 'effect';
import { UnknownException } from 'effect/Cause';

export type ProcessError =
    | ProcessNotFoundError
    | PermissionDeniedError
    | UnknownProcessError;

export class ProcessNotFoundError extends Data.TaggedError(
    'ProcessNotFoundError',
)<{
    readonly cause?: unknown;
    readonly pid?: number;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class PermissionDeniedError extends Data.TaggedError(
    'PermissionDeniedError',
)<{
    readonly cause?: unknown;
    readonly pid?: number;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class UnknownProcessError extends Data.TaggedError('UnknownProcessError')<{
    readonly cause?: unknown;
    readonly code?: string;
    readonly pid?: number;
    readonly syscall?: string;
    readonly message?: string;
}> {}

interface NodeProcessError extends Error {
    code?: string;
    syscall?: string;
    // Node's process.kill errors don't typically include pid directly in the error object
}

export function mapProcessError(
    error: unknown,
    pid?: number,
): ProcessError | UnknownException {
    if (error instanceof Error && 'code' in error) {
        const nodeError = error as NodeProcessError;
        const props = {
            cause: nodeError,
            pid: pid, // Add pid for context
            syscall: nodeError.syscall,
            message: nodeError.message,
        };
        switch (nodeError.code) {
            case 'ESRCH': // No such process
                return new ProcessNotFoundError(props);
            case 'EPERM': // Operation not permitted
                return new PermissionDeniedError(props);
            default:
                return new UnknownProcessError({
                    ...props,
                    code: nodeError.code,
                });
        }
    }
    // If it's not a recognizable Node error, wrap it
    return new UnknownException(error);
}
