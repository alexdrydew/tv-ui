import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { Effect } from 'effect';
import { UnknownException } from 'effect/Cause';
import { mapFsError, type FsError, FsNoSuchFileOrDirError } from './errors.js';
import constants from 'node:constants';

export function readFileEffect(
    ...args: Parameters<typeof readFile>
): Effect.Effect<
    Awaited<ReturnType<typeof readFile>>,
    FsError | UnknownException
> {
    return Effect.tryPromise({
        try: () => readFile(...args),
        catch: mapFsError,
    });
}

export function mkdirEffect(
    ...args: Parameters<typeof mkdir>
): Effect.Effect<
    Awaited<ReturnType<typeof mkdir>>,
    FsError | UnknownException
> {
    return Effect.tryPromise({
        try: () => mkdir(...args),
        catch: mapFsError,
    });
}

export function readdirEffect(
    ...args: Parameters<typeof readdir>
): Effect.Effect<
    Awaited<ReturnType<typeof readdir>>,
    FsError | UnknownException
> {
    return Effect.tryPromise({
        try: () => readdir(...args),
        catch: mapFsError,
    });
}

export function writeFileEffect(
    ...args: Parameters<typeof writeFile>
): Effect.Effect<
    Awaited<ReturnType<typeof writeFile>>,
    FsError | UnknownException
> {
    return Effect.tryPromise({
        try: () => writeFile(...args),
        catch: mapFsError,
    });
}

export const fileExists = (
    filePath: string,
): Effect.Effect<
    boolean,
    Exclude<FsError, FsNoSuchFileOrDirError> | UnknownException
> =>
    Effect.tryPromise({
        try: () => access(filePath, constants.F_OK),
        catch: mapFsError,
    }).pipe(
        Effect.map(() => true),
        Effect.catchTag('FsNoSuchFileOrDirError', () => Effect.succeed(false)),
    );
