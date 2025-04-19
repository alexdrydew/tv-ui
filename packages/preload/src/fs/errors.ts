import { Data } from 'effect';
import { UnknownException } from 'effect/Cause';

export type FsError =
    | FsFileNotFoundError
    | FsPermissionDeniedError
    | FsIsDirectoryError
    | FsNoSuchFileOrDirError
    | FsNotDirectoryError
    | FsDirectoryNotEmptyError
    | FsFileExistsError
    | FsTooManyOpenFilesError
    | FsOperationNotPermittedError
    | UnknownFSError;

export class FsFileNotFoundError extends Data.TaggedError('FsFileNotFoundError')<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsPermissionDeniedError extends Data.TaggedError(
    'FsPermissionDeniedError',
)<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsIsDirectoryError extends Data.TaggedError('FsIsDirectoryError')<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsNoSuchFileOrDirError extends Data.TaggedError(
    'FsNoSuchFileOrDirError',
)<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsNotDirectoryError extends Data.TaggedError('FsNotDirectoryError')<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsDirectoryNotEmptyError extends Data.TaggedError(
    'FsDirectoryNotEmptyError',
)<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsFileExistsError extends Data.TaggedError('FsFileExistsError')<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsTooManyOpenFilesError extends Data.TaggedError(
    'FsTooManyOpenFilesError',
)<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class FsOperationNotPermittedError extends Data.TaggedError(
    'FsOperationNotPermittedError',
)<{
    readonly cause?: unknown;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

export class UnknownFSError extends Data.TaggedError('UnknownFSError')<{
    readonly cause?: unknown;
    readonly code?: string;
    readonly path?: string;
    readonly syscall?: string;
    readonly message?: string;
}> {}

interface NodeFsError extends Error {
    code?: string;
    path?: string;
    syscall?: string;
}

export function mapFsError(error: unknown): FsError | UnknownException {
    if (error instanceof Error && 'code' in error) {
        const nodeError = error as NodeFsError;
        const props = {
            cause: nodeError,
            path: nodeError.path,
            syscall: nodeError.syscall,
            message: nodeError.message,
        };
        switch (nodeError.code) {
            case 'ENOENT':
                return new FsNoSuchFileOrDirError(props);
            case 'EACCES':
                return new FsPermissionDeniedError(props);
            case 'EISDIR':
                return new FsIsDirectoryError(props);
            case 'ENOTDIR':
                return new FsNotDirectoryError(props);
            case 'ENOTEMPTY':
                return new FsDirectoryNotEmptyError(props);
            case 'EEXIST':
                return new FsFileExistsError(props);
            case 'EMFILE':
                return new FsTooManyOpenFilesError(props);
            case 'EPERM':
                return new FsOperationNotPermittedError(props);
            default:
                return new UnknownFSError({ ...props, code: nodeError.code });
        }
    }
    return new UnknownException(error);
}
