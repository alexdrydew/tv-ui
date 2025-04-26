import { DesktopEntryView } from '@app/types';
import { Effect, pipe } from 'effect';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ini from 'ini';
import { readFileEffect } from '#src/fs/index.js';
import { UnknownException } from 'effect/Cause';

function parseDesktopFile(
    filePath: string,
): Effect.Effect<DesktopEntryView | null, UnknownException> {
    console.debug(`Attempting to parse desktop file: ${filePath}`);
    return pipe(
        readFileEffect(filePath),
        Effect.map((buffer) => buffer.toString('utf-8')),
        Effect.tap((content) =>
            console.debug(
                `Read content for ${filePath}:`,
                content.slice(0, 100) + '...',
            ),
        ),
        Effect.tryMap({
            try: (content) => ini.parse(content),
            catch: (error) => {
                console.debug(`Failed to parse INI for ${filePath}:`, error);
                // Wrap parsing errors in UnknownException
                return new UnknownException({
                    message: `INI parsing failed for ${filePath}`,
                    cause: error,
                });
            },
        }),
        Effect.tap((parsed) =>
            console.debug(`Parsed INI for ${filePath}:`, parsed),
        ),
        Effect.map((parsed) => {
            // Revert to accessing properties from the nested 'Desktop Entry' object
            const entry = parsed?.['Desktop Entry']; // Use optional chaining just in case

            if (
                !entry || // Check if entry exists
                typeof entry !== 'object' || // Check if entry is an object
                !entry.Name || // Check Name within entry
                entry.NoDisplay === true || // Check NoDisplay (boolean) within entry
                entry.Type !== 'Application' // Check Type within entry
            ) {
                console.debug(
                    `Skipping entry ${filePath}: Invalid, NoDisplay, or not Type=Application.`,
                );
                return null; // Not a valid/visible application entry
            }

            const id = path.basename(filePath, '.desktop');
            const result: DesktopEntryView = {
                id: id,
                name: String(entry.Name), // Use entry.Name
                icon: entry.Icon ? String(entry.Icon) : undefined, // Use entry.Icon
                filePath: filePath,
            };
            console.debug(`Successfully parsed ${filePath} into:`, result);
            return result;
        }),
        // If the file doesn't exist, treat it as null rather than an error for this context
        Effect.catchTag('FsNoSuchFileOrDirError', (e) => {
            console.debug(`File not found, skipping: ${filePath}`, e);
            return Effect.succeed(null);
        }),
        // Catch INI parsing errors specifically and return null
        Effect.catchTag('UnknownException', (e) => {
            console.debug(
                `Caught exception during parsing ${filePath}, returning null:`,
                e,
            );
            return Effect.succeed(null); // Treat parse errors as skippable entries
        }),
    );
}

async function findDesktopFiles(dirPath: string): Promise<string[]> {
    console.debug(`Searching for .desktop files in directory: ${dirPath}`);
    let entries: string[] = [];
    try {
        // Ensure fs.readdir is awaited correctly
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        console.debug(`Found ${dirents.length} dirents in ${dirPath}`);
        for (const dirent of dirents) {
            const fullPath = path.join(dirPath, dirent.name);
            if (dirent.isDirectory()) {
                console.debug(`Recursing into subdirectory: ${fullPath}`);
                // Recurse into subdirectories and await the result
                const subEntries = await findDesktopFiles(fullPath);
                entries = entries.concat(subEntries);
            } else if (dirent.isFile() && dirent.name.endsWith('.desktop')) {
                console.debug(`Found .desktop file: ${fullPath}`);
                entries.push(fullPath);
            } else {
                console.debug(
                    `Skipping non-directory, non-.desktop file: ${fullPath}`,
                );
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // Ignore errors like permission denied or non-existent directories
        if (error.code === 'ENOENT') {
            console.debug(`Directory not found, skipping: ${dirPath}`);
        } else if (error.code === 'EACCES') {
            console.debug(
                `Permission denied for directory, skipping: ${dirPath}`,
            );
        } else {
            // Log other errors as warnings
            console.warn(
                `Unexpected error reading directory ${dirPath}:`,
                error,
            );
        }
    }
    console.debug(
        `Finished searching ${dirPath}, found ${entries.length} .desktop files (including subdirs).`,
    );
    return entries;
}

function getXdgDataDirs(): string[] {
    const envDirs = process.env['XDG_DATA_DIRS'];
    const defaultDirs = ['/usr/local/share/', '/usr/share/'];
    let result: string[];
    if (envDirs) {
        console.debug(`Using XDG_DATA_DIRS from environment: ${envDirs}`);
        // Ensure paths are resolved correctly
        result = envDirs.split(':').map((dir) => path.resolve(dir));
    } else {
        console.debug(
            `XDG_DATA_DIRS not set, using defaults: ${defaultDirs.join(':')}`,
        );
        result = defaultDirs.map((dir) => path.resolve(dir)); // Resolve default paths too
    }
    console.debug('Resolved XDG data directories:', result);
    return result;
}

function getXdgDataHome(): string {
    const envHome = process.env['XDG_DATA_HOME'];
    const defaultHome = path.join(os.homedir(), '.local/share');
    let result: string;
    if (envHome) {
        console.debug(`Using XDG_DATA_HOME from environment: ${envHome}`);
        result = path.resolve(envHome);
    } else {
        console.debug(`XDG_DATA_HOME not set, using default: ${defaultHome}`);
        result = path.resolve(defaultHome); // Resolve default path too
    }
    console.debug('Resolved XDG data home:', result);
    return result;
}

export function getDesktopEntries(): Effect.Effect<
    DesktopEntryView[],
    never // Errors during find/parse are handled and result in empty/partial lists
> {
    console.debug('Starting getDesktopEntries...');
    const xdgDataDirs = getXdgDataDirs();
    const xdgDataHome = getXdgDataHome();

    const searchDirs = [
        ...xdgDataDirs.map((dir) => path.join(dir, 'applications')),
        path.join(xdgDataHome, 'applications'), // Add user-specific directory
    ];
    console.debug('Initial search directories:', searchDirs);

    // Ensure paths are absolute and unique
    const uniqueSearchDirs = [
        ...new Set(searchDirs.map((dir) => path.resolve(dir))),
    ];

    console.debug(
        'Unique search directories for .desktop files:',
        uniqueSearchDirs,
    );

    return pipe(
        Effect.forEach(
            uniqueSearchDirs,
            (dir) =>
                Effect.tryPromise({
                    try: () => findDesktopFiles(dir), // findDesktopFiles handles ENOENT/EACCES internally
                    catch: (error) => {
                        // Catch unexpected errors from findDesktopFiles (e.g., if fs.readdir throws something else)
                        console.error(
                            `Unexpected error calling findDesktopFiles for ${dir}:`,
                            error,
                        );
                        // Treat as an empty list for this directory to allow others to proceed
                        return [] as string[];
                    },
                }),
            { concurrency: 5 }, // Limit concurrency for directory scanning
        ),
        Effect.tap((results) =>
            console.debug(
                'Raw results from findDesktopFiles (nested array):',
                results,
            ),
        ),
        Effect.map((results) => results.flat()), // Flatten the array of arrays
        Effect.tap((allFiles) =>
            console.debug(
                `Found ${allFiles.length} total .desktop file paths:`,
                allFiles,
            ),
        ),
        Effect.flatMap((allFiles) =>
            // Parse files concurrently, allowing individual failures
            Effect.forEach(allFiles, (filePath) => parseDesktopFile(filePath), {
                concurrency: 10, // Increase concurrency for parsing
            }),
        ),
        Effect.tap((parsedResults) =>
            console.debug(
                'Results after parsing (includes nulls):',
                parsedResults,
            ),
        ),
        // Filter out nulls (files not found, skipped, or failed to parse)
        Effect.map((parsedEntries) =>
            parsedEntries.filter(
                (entry): entry is DesktopEntryView => entry !== null,
            ),
        ),
        Effect.tap((finalEntries) =>
            console.debug(
                `Filtered ${finalEntries.length} valid DesktopEntryView objects:`,
                finalEntries,
            ),
        ),
        // Catch any unexpected errors in the overall pipeline (less likely now)
        Effect.catchAll((error) => {
            console.error(
                'Caught unexpected error during desktop entry processing pipeline:',
                error,
            );
            // Return an empty array in case of unexpected failure
            return Effect.succeed([]);
        }),
    );
}
