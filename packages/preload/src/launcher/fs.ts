import { Effect, pipe, Schema } from 'effect';
import { UnknownException } from 'effect/Cause';
import { ParseError } from 'effect/ParseResult';
import { readFileEffect, writeFileEffect } from '@app/lib/src/fs/index.js';
import { FsError } from '@app/lib/src/fs/errors.js';
import {
    parseJsonEffect,
    JsonParseError,
    JsonStringifyError,
    stringifyJsonEffect,
} from '@app/lib/src/json/index.js';
import { LauncherConfig, LauncherConfigSchema } from '@app/types';

export function readLauncherConfigFromFile(
    configPath: string,
): Effect.Effect<LauncherConfig, FsError | JsonParseError | UnknownException> {
    return pipe(
        readFileEffect(configPath),
        Effect.andThen((content) =>
            parseJsonEffect(
                content,
                `Failed to parse launcher config JSON from ${configPath}`,
            ),
        ),
        Effect.andThen(Schema.decodeUnknown(LauncherConfigSchema)),
        Effect.mapError((error) => {
            if (error instanceof ParseError) {
                return new JsonParseError({
                    cause: error,
                    message: String(error),
                });
            }
            return error;
        }),
    );
}

export function writeLauncherConfigToFileEffect(
    configPath: string,
    config: LauncherConfig,
): Effect.Effect<void, FsError | JsonStringifyError | UnknownException> {
    return pipe(
        stringifyJsonEffect(
            config,
            `Failed to stringify launcher config for ${configPath}`,
            2,
        ),
        Effect.andThen((jsonString) =>
            writeFileEffect(configPath, jsonString, 'utf-8'),
        ),
        Effect.mapError((error) => {
            if (error instanceof JsonStringifyError) {
                return error;
            }
            return error as FsError;
        }),
    );
}
