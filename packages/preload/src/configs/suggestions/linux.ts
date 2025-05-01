import { Effect, pipe, Stream, Schema, Data } from 'effect';
import os from 'node:os';
import path from 'node:path';
import ini from 'ini';
import { readdirEffect, readFileEffect } from '#src/fs/index.js';
import { UnknownException } from 'effect/Cause';
import { FsError } from '#src/fs/errors.js';

// Custom error for filtering invalid entries
class InvalidDesktopEntryError extends Data.TaggedError('InvalidDesktopEntryError')<{
    readonly reason: string;
}> {}

// Schema for the relevant part of the .desktop file content after ini.parse
const DesktopEntryIniSchema = Schema.Struct({
    // Use optional to handle cases where the section might be missing or the file is malformed
    'Desktop Entry': Schema.optional(Schema.Struct({
        Name: Schema.String,
        Exec: Schema.String,
        Type: Schema.optional(Schema.String), // Optional because we need to check its value
        NoDisplay: Schema.optional(Schema.Union(Schema.String, Schema.Boolean)), // Optional and can be string or boolean
        Icon: Schema.optional(Schema.String),
    })),
});

// Schema for the final output structure
const DesktopEntryInternalSchema = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    icon: Schema.optional(Schema.String),
    filePath: Schema.String,
    exec: Schema.String,
});
type DesktopEntryInternal = Schema.Schema.Type<typeof DesktopEntryInternalSchema>;


function parseDesktopFile(
    filePath: string,
): Effect.Effect<DesktopEntryInternal | null, never> { // Error channel is never
    const parseValidateAndTransform = pipe(
        readFileEffect(filePath), // Effect<Buffer, FsError>
        Effect.map((buffer) => buffer.toString('utf-8')), // Effect<string, FsError>
        Effect.tryMap({ // Effect<unknown, FsError | UnknownException>
            try: (content) => ini.parse(content),
            catch: (error) => new UnknownException({ message: `INI parsing failed for ${filePath}`, cause: error }),
        }),
        // Decode the parsed object using the schema
        // Effect<DecodedIni, FsError | UnknownException | ParseError>
        Effect.flatMap((parsedIni) => Schema.decodeUnknown(DesktopEntryIniSchema)(parsedIni)),
        // Filter based on existence of 'Desktop Entry' and its properties
        Effect.filterOrFail(
            (decoded): decoded is { 'Desktop Entry': NonNullable<typeof decoded['Desktop Entry']> } => // Type guard
                decoded['Desktop Entry'] !== undefined && decoded['Desktop Entry'] !== null,
            () => new InvalidDesktopEntryError({ reason: "Missing 'Desktop Entry' section" })
        ),
        Effect.filterOrFail(
            (decoded) => {
                const entry = decoded['Desktop Entry'];
                const noDisplay = entry.NoDisplay;
                const isHidden = noDisplay === true || String(noDisplay).toLowerCase() === 'true';
                // Ensure Name and Exec are present (already handled by schema) and Type is Application
                return entry.Type === 'Application' && !isHidden;
            },
            () => new InvalidDesktopEntryError({ reason: 'Entry is not a visible application or missing required fields' })
        ),
         // Map to the final DesktopEntryInternal structure
         // Effect<DesktopEntryInternal, FsError | UnknownException | ParseError | InvalidDesktopEntryError>
        Effect.map((decoded) => {
            const entry = decoded['Desktop Entry']; // Now guaranteed to exist by filterOrFail
            const id = path.basename(filePath, '.desktop');
            const result: DesktopEntryInternal = {
                id: id,
                name: entry.Name,
                icon: entry.Icon, // Already optional from schema
                filePath: path.resolve(filePath), // Ensure filePath is absolute
                exec: entry.Exec, // Already required by schema
            };
            // Use the schema to construct the final object for potential future transformations/validations if needed
            // This step is somewhat redundant here as we manually created the object, but good practice.
            return DesktopEntryInternalSchema.makeSync(result);
        }),
    );

     return pipe(
        Effect.logDebug(`Parsing desktop file: ${filePath}`),
        // Execute the pipeline and catch *all* expected errors, returning null
        Effect.flatMap(() => parseValidateAndTransform),
        Effect.tap((entry) => Effect.logDebug(`Successfully parsed and validated ${filePath}`)), // Only logs on success path
        // Catch all errors from the pipeline (FsError, ParseError, UnknownException, InvalidDesktopEntryError)
        Effect.catchAll((error) =>
            pipe(
                Effect.logWarning(
                    `Skipping desktop entry ${filePath} due to error or filter`,
                    error,
                ),
                Effect.andThen(Effect.succeed(null)), // Return null on any error/filter
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
