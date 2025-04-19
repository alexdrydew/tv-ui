import { AppConfig, AppConfigArraySchema, AppConfigId } from '@app/types';
import { Data, Effect, pipe } from 'effect';
import { UnknownException } from 'effect/Cause';
import { FsError } from '#src/fs/errors.js';
import { readFileEffect, writeFileEffect } from '#src/fs/index.js';
import * as z from 'zod';
export class JsonParseError extends Data.TaggedError('JsonParseError')<{
    readonly cause?: unknown;
    readonly message?: string;
}> {}

export class JsonStringifyError extends Data.TaggedError('JsonStringifyError')<{
    readonly cause?: unknown;
    readonly message?: string;
}> {}

const wrapZodError = <T extends object>(
    error: T,
): T extends z.ZodError ? JsonParseError : T => {
    if (error instanceof z.ZodError) {
        return new JsonParseError({
            message: error.message,
            cause: error,
        }) as T extends z.ZodError ? JsonParseError : T;
    } else {
        return error as T extends z.ZodError ? JsonParseError : T;
    }
};

export function readConfigsFromFile(
    configPath: string,
): Effect.Effect<
    Record<AppConfigId, AppConfig>,
    FsError | JsonParseError | UnknownException
> {
    return pipe(
        readFileEffect(configPath),
        Effect.map((bufOrString) => bufOrString.toString('utf-8')),
        Effect.tryMap({
            try: JSON.parse,
            catch: (error) => {
                if (error instanceof SyntaxError) {
                    return new JsonParseError({ cause: error });
                }
                return new UnknownException(error);
            },
        }),
        Effect.flatMap(AppConfigArraySchema.effect.parse),
        Effect.mapError(wrapZodError),
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
        Effect.try({
            try: () => JSON.stringify(Object.values(configs), null, 4),
            catch: (error) => new JsonStringifyError({ cause: error }),
        }),
        Effect.flatMap((content) =>
            writeFileEffect(configPath, content, {
                encoding: 'utf-8',
            }),
        ),
    );
}
