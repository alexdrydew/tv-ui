import { AppConfig, AppConfigArraySchema, AppConfigId } from '@app/types';
import { Effect, pipe, Schema } from 'effect';
import { UnknownException } from 'effect/Cause';
import { FsError } from '@app/lib/src/fs/errors.js';
import { ParseError } from 'effect/ParseResult';
import { readFileEffect, writeFileEffect } from '@app/lib/src/fs/index.js';
import {
    JsonParseError,
    JsonStringifyError,
    parseJsonEffect,
    stringifyJsonEffect,
} from '@app/lib/src/json/index.js';

export function readConfigsFromFile(
    configPath: string,
): Effect.Effect<
    Record<AppConfigId, AppConfig>,
    FsError | JsonParseError | UnknownException
> {
    return pipe(
        readFileEffect(configPath),
        Effect.flatMap((content) =>
            parseJsonEffect(
                content,
                `Failed to parse app configs JSON from ${configPath}`,
            ),
        ),
        Effect.flatMap(Schema.decodeUnknown(AppConfigArraySchema)),
        Effect.mapError((error) => {
            if (error instanceof ParseError) {
                return new JsonParseError({
                    cause: error,
                    message: String(error),
                });
            }
            return error;
        }),
        Effect.map((configs) => {
            const configsMap: Record<AppConfigId, AppConfig> = {};
            for (const config of configs) {
                configsMap[config.id] = config;
            }
            return configsMap;
        }),
    );
}

export function writeConfigsToFileEffect(
    configPath: string,
    configs: Record<AppConfigId, AppConfig>,
): Effect.Effect<void, FsError | JsonStringifyError | UnknownException> {
    return pipe(
        stringifyJsonEffect(
            Object.values(configs),
            `Failed to stringify app configs for ${configPath}`,
            4,
        ),
        Effect.flatMap((content) =>
            writeFileEffect(configPath, content, {
                encoding: 'utf-8',
            }),
        ),
    );
}
