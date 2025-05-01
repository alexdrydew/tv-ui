import { Effect, pipe, Stream } from 'effect';
import os from 'node:os';
import path from 'node:path';
import ini from 'ini';
import { readdirEffect, readFileEffect } from '#src/fs/index.js';
import { UnknownException } from 'effect/Cause';
import { FsError } from '#src/fs/errors.js';

type DesktopEntryInternal = {
    id: string; // Typically the file name without .desktop
    name: string;
    icon?: string; // Optional icon name or path
    filePath: string; // Full path to the .desktop file
    exec?: string; // The command from the Exec field
};

function parseDesktopFile(
    filePath: string,
): Effect.Effect<DesktopEntryInternal | null, never> {
    return pipe(
        Effect.logDebug(`Parsing desktop file: ${filePath}`),
        Effect.flatMap(() => readFileEffect(filePath)), // Can fail with Fs*Error
        Effect.tapError((error) =>
            Effect.logWarning(`Error reading file ${filePath}`, error),
        ),
        Effect.map((buffer) => buffer.toString('utf-8')),
        Effect.tryMap({
            // Can fail with UnknownException (parsing)
            try: (content) => ini.parse(content),
            catch: (error) => {
                return new UnknownException({
                    message: `INI parsing failed for ${filePath}`,
                    cause: error,
                });
            },
        }),
        Effect.map((parsed) => {
            const entry = parsed?.['Desktop Entry'];

            if (
                !entry ||
                typeof entry !== 'object' ||
                !entry.Name ||
                !entry.Exec || // Ensure Exec exists
                entry.NoDisplay === true ||
                String(entry.NoDisplay).toLowerCase() === 'true' ||
                entry.Type !== 'Application'
            ) {
                return null; // Not a valid/visible application entry or missing Exec
            }

            const id = path.basename(filePath, '.desktop');
            // Basic parsing of Exec: take the part before the first space, if any,
            // or the whole string. This is a simplification.
            // A more robust parser would handle quotes and placeholders like %f, %U etc.
            // const command = String(entry.Exec).split(' ')[0]; // Simplistic command extraction

            const result: DesktopEntryInternal = {
                id: id,
                name: String(entry.Name),
                icon: entry.Icon ? String(entry.Icon) : undefined,
                filePath: path.resolve(filePath), // Ensure filePath is absolute
                exec: String(entry.Exec), // Store the raw Exec string for now
            };
            return result;
        }),
        Effect.tap((entry) =>
            entry
                ? Effect.logDebug(`Successfully parsed ${filePath}`)
                : Effect.logDebug(
                      `Skipping invalid/filtered entry ${filePath}`,
                  ),
        ),
        Effect.catchAll((error) =>
            pipe(
                Effect.logWarning(
                    `Skipping desktop entry due to error reading/parsing ${filePath}`,
                    error,
                ),
                Effect.andThen(Effect.succeed(null)), // Ensure the pipeline continues with null
            ),
        ),
    );
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

    filesStream.pipe(
        Stream.map((filePathEffect) => {
            pipe(Effect.flatMap(parseDesktopFile));
        }),
    );

    filesStream.pipe(
        Stream.tap((filePath) =>
            filePath.Effect.logDebug(`Found .desktop file: ${filePath}`),
        ),
    );

    const effect = pipe(
        Effect.map((results) => results.flat()),
        Effect.tap((allFiles) =>
            Effect.logDebug(
                `Found ${allFiles.length} potential .desktop files`,
            ),
        ),
        Effect.flatMap((allFiles) =>
            Effect.forEach(allFiles, (filePath) => parseDesktopFile(filePath)),
        ),
        Effect.map((parsedEntries) =>
            parsedEntries.filter(
                (entry): entry is DesktopEntryInternal => entry !== null,
            ),
        ),
        Effect.tap((entries) =>
            Effect.logInfo(
                `Successfully processed ${entries.length} desktop entries`,
            ),
        ),
        Effect.catchAll((error) =>
            pipe(
                Effect.logError(
                    'Caught unexpected error during desktop entry processing pipeline',
                    error,
                ),
                Effect.andThen(Effect.succeed([])), // Return empty array on pipeline error
            ),
        ),
    );
    return Effect.runPromise(effect);
}
