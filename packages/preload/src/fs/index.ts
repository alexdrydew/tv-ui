import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Effect } from 'effect';
import { UnknownException } from 'effect/Cause';
import { mapFsError, type FsError } from './errors.js';

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
