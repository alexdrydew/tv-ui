import { Effect, pipe, Stream, Schema, Data, Exit } from 'effect';
import os from 'node:os';
import path from 'node:path';
import ini from 'ini';
import { UnknownException } from 'effect/Cause';

import { FsError, FsNoSuchFileOrDirError } from '@app/lib/src/fs/errors.js';
import { readdirEffect, readFileEffect } from '@app/lib/src/fs/index.js';

const DesktopEntryIniSchema = Schema.Struct({
    'Desktop Entry': Schema.Struct({
        Name: Schema.String,
        Exec: Schema.optional(Schema.String),
        Type: Schema.optional(Schema.String),
        NoDisplay: Schema.optional(Schema.Union(Schema.String, Schema.Boolean)),
        Icon: Schema.optional(Schema.String),
    }),
});

export type ValidDesktopEntry = {
    entry: {
        name: string;
        icon?: string;
        exec: string;
    };
    status: 'valid';
};
export type DesktopEntryInternal =
    | ValidDesktopEntry
    | {
          entry: {
              name: string;
              icon?: string;
              exec: string;
          };
          status: 'hidden';
      }
    | {
          entry: {
              name: string;
              icon?: string;
          };
          status: 'non-executable';
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
    ).pipe(
        Stream.catchAll((error) => {
            if (error instanceof FsNoSuchFileOrDirError) {
                return Stream.empty;
            }
            return Stream.fail(error);
        }),
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
            } else if (dirent.name.endsWith('.desktop')) {
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

    console.log(
        `Searching for desktop entries in directories: ${searchDirs.join(', ')}`,
    );

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
                Effect.map((parsedIni): DesktopEntryInternal => {
                    if (!parsedIni['Desktop Entry'].Exec) {
                        return {
                            entry: {
                                name: parsedIni['Desktop Entry'].Name,
                                icon: parsedIni['Desktop Entry'].Icon,
                            },
                            status: 'non-executable',
                        };
                    }

                    const entry = {
                        name: parsedIni['Desktop Entry'].Name,
                        icon: parsedIni['Desktop Entry'].Icon,
                        exec: parsedIni['Desktop Entry'].Exec,
                    };

                    const noDisplay = parsedIni['Desktop Entry'].NoDisplay;
                    if (noDisplay || noDisplay === 'true') {
                        return {
                            entry,
                            status: 'hidden',
                        };
                    }

                    return {
                        entry,
                        status: 'valid',
                    };
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
            onSuccess: (item) => item,
        });
        if (matched) {
            desktopEntries.push(matched);
        }
    }
    return desktopEntries;
}
