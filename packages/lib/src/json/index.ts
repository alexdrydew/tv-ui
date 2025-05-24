import { Data, Effect } from 'effect';
import { UnknownException } from 'effect/Cause';

export class JsonParseError extends Data.TaggedError('JsonParseError')<{
    readonly cause?: unknown;
    readonly message?: string;
}> {}

export class JsonStringifyError extends Data.TaggedError('JsonStringifyError')<{
    readonly cause?: unknown;
    readonly message?: string;
}> {}

/**
 * Parses a JSON string into an object.
 *
 * @param content The JSON string to parse
 * @param message Optional error message to include if parsing fails
 * @returns Effect that resolves to the parsed object or fails with JsonParseError
 */
export function parseJsonEffect(
    content: string,
    message?: string,
): Effect.Effect<unknown, JsonParseError | UnknownException> {
    return Effect.try({
        try: () => JSON.parse(content),
        catch: (error) => {
            if (error instanceof SyntaxError) {
                return new JsonParseError({
                    cause: error,
                    message: message || 'Failed to parse JSON',
                });
            }
            return new UnknownException(error);
        },
    });
}

/**
 * Stringifies an object to JSON.
 *
 * @param data The object to stringify
 * @param message Optional error message to include if stringification fails
 * @param space Optional space parameter passed to JSON.stringify
 * @returns Effect that resolves to the JSON string or fails with JsonStringifyError
 */
export function stringifyJsonEffect(
    data: unknown,
    message?: string,
    space?: string | number,
): Effect.Effect<string, JsonStringifyError | UnknownException> {
    return Effect.try({
        try: () => JSON.stringify(data, null, space),
        catch: (error) => {
            if (error instanceof Error) {
                return new JsonStringifyError({
                    cause: error,
                    message: message || 'Failed to stringify JSON',
                });
            }
            return new UnknownException(error);
        },
    });
}
