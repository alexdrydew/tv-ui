import { Effect, pipe, Stream, Schema, Data, Exit, Option } from 'effect';
import os from 'node:os';
import path from 'node:path';
import ini from 'ini';
import { readdirEffect, readFileEffect } from '#src/fs/index.js';
import { UnknownException } from 'effect/Cause';
import { FsError } from '#src/fs/errors.js';

const DesktopEntryIniSchema = Schema.Struct({
    'Desktop Entry': Schema.Struct({
        Name: Schema.String,
        Exec: Schema.optional(Schema.String), // Make Exec optional
        Type: Schema.optional(Schema.String), // Optional because we need to check its value
        NoDisplay: Schema.optional(Schema.Union(Schema.String, Schema.Boolean)), // Optional and can be string or boolean
        Icon: Schema.optional(Schema.String),
    }),
});

type DesktopEntryInternal = {
    name: string;
    icon?: string;
    exec: string;
};

class InvalidIniSchemaError extends Data.TaggedError('InvalidIniSchemaError')<{
    readonly reason: string;
}> {}

function parseIniEffect(
    content: string,
): Effect.Effect<object, InvalidIniSchemaError> {
    return Effect.try({
        try: () => ini.parse(content),
        catch: (error) => {
            return new InvalidIniSchemaError({
                reason: `Failed to parse INI file: ${(error as Error).message}`,
            });
        },
    });
}

type DesktopFilesRecursiveStream = Stream.Stream<
    DesktopFilesRecursiveStream | string,
    FsError | UnknownException
>;

function findDesktopFilesStreams(dirPath: string): DesktopFilesRecursiveStream {
    // we may fail to read from the directory at all
    const dirents = Stream.fromIterableEffect(
        readdirEffect(dirPath, { withFileTypes: true }),
    );
    const loggedDirents = dirents.pipe(
        Stream.tap((dirent) =>
            Effect.logDebug(
                `Found directory entry: ${dirent.name} (${dirent.isDirectory() ? 'directory' : 'file'})`,
            ),
        ),
    );
    // then we may fail to read from each entry
    const paths = loggedDirents.pipe(
        Stream.map((dirent) => {
            if (dirent.isDirectory()) {
                return findDesktopFilesStreams(path.join(dirPath, dirent.name));
            } else if (dirent.isFile() && dirent.name.endsWith('.desktop')) {
                return path.join(dirPath, dirent.name);
            }
        }),
        Stream.filter((filePath) => filePath !== undefined),
    );
    return paths;
}

function flattenDesktopFilesStreams(
    streamOfStreams: DesktopFilesRecursiveStream,
): Stream.Stream<Effect.Effect<string, FsError | UnknownException>, never> {
    const f = streamOfStreams.pipe(
        Stream.flatMap((elem) => {
            if (typeof elem === 'string') {
                return Stream.succeed(Effect.succeed(elem));
            }
            return flattenDesktopFilesStreams(elem);
        }),
        Stream.catchAll((error) => Stream.succeed(Effect.fail(error))),
    );
    return f;
}

function findDesktopFilesEffects(
    dirPath: string,
): Stream.Stream<Effect.Effect<string, FsError | UnknownException>, never> {
    const streamOfStreams = findDesktopFilesStreams(dirPath);
    return flattenDesktopFilesStreams(streamOfStreams);
}

function getXdgDataDirs(): string[] {
    const envDirs = process.env['XDG_DATA_DIRS'];
    const defaultDirs = ['/usr/local/share/', '/usr/share/'];
    let result: string[];
    if (envDirs) {
        result = envDirs.split(':').map((dir) => path.resolve(dir));
    } else {
        result = defaultDirs.map((dir) => path.resolve(dir));
    }
    return result.filter(Boolean);
}

function getXdgDataHome(): string {
    const envHome = process.env['XDG_DATA_HOME'];
    const defaultHome = path.join(os.homedir(), '.local/share');
    let result: string;
    if (envHome) {
        result = path.resolve(envHome);
    } else {
        result = path.resolve(defaultHome);
    }
    return result;
}

export async function getDesktopEntries(): Promise<DesktopEntryInternal[]> {
    const xdgDataDirs = getXdgDataDirs();
    const xdgDataHome = getXdgDataHome();

    const searchDirs = [
        ...xdgDataDirs.map((dir) => path.join(dir, 'applications')),
        path.join(xdgDataHome, 'applications'),
    ];

    const dirsStream = Stream.fromIterable(
        new Set(searchDirs.map((dir) => path.resolve(dir))),
    );
    const filesStream = dirsStream.pipe(
        Stream.flatMap(findDesktopFilesEffects),
    );
    const decodedStream = filesStream.pipe(
        Stream.map((filePathEffect) => {
            return pipe(
                filePathEffect,
                Effect.flatMap(readFileEffect),
                Effect.map((bufOrString) => bufOrString.toString('utf-8')),
                Effect.flatMap(parseIniEffect),
                Effect.flatMap(Schema.decodeUnknown(DesktopEntryIniSchema)),
                Effect.map((parsedIni) => {
                    const noDisplay = parsedIni['Desktop Entry'].NoDisplay;
                    if (noDisplay || noDisplay === 'true') {
                        return Option.none();
                    }
                    return Option.some(parsedIni);
                }),
                // Validate and map Exec, filtering out entries where it's missing/empty
                Effect.map(Option.flatMap(validateAndMapExec)),
                Effect.map((validatedIniOpt) => {
                    // Map the Option<ValidatedDesktopEntryIni> to Option<DesktopEntryInternal>
                    return Option.map(validatedIniOpt, (content) => {
                        // content now has 'Desktop Entry'.Exec guaranteed as string
                        return {
                            name: content['Desktop Entry'].Name,
                            icon: content['Desktop Entry'].Icon,
                            exec: content['Desktop Entry'].Exec, // Directly use the validated string
                        };
                    });
                }),
            );
        }),
    );

    const decodedItemEffects = await Effect.runPromise(
        Stream.runCollect(decodedStream),
    );

    const desktopEntries: DesktopEntryInternal[] = [];
    for (const itemEffect of decodedItemEffects) {
        const result = await Effect.runPromiseExit(itemEffect);
        const matched = Exit.match(result, {
            onFailure: (error) => {
                console.log(
                    `Failed to process item when collecting desktop entries: ${error}`,
                );
            },
            onSuccess: (item) => {
                if (Option.isSome(item)) {
                    return item;
                }
            },
        });
        if (matched) {
            desktopEntries.push(matched.value);
        }
    }
    return desktopEntries;
}
