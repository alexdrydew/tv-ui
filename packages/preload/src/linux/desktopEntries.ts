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
    return pipe(
        readFileEffect(filePath),
        Effect.map((buffer) => buffer.toString('utf-8')),
        Effect.tryMap({
            try: (content) => ini.parse(content),
            catch: (error) => {
                // Wrap parsing errors in UnknownException
                return new UnknownException({
                    message: `INI parsing failed for ${filePath}`,
                    cause: error,
                });
            },
        }),
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
                return null; // Not a valid/visible application entry
            }

            const id = path.basename(filePath, '.desktop');
            const result: DesktopEntryView = {
                id: id,
                name: String(entry.Name), // Use entry.Name
                icon: entry.Icon ? String(entry.Icon) : undefined, // Use entry.Icon
                filePath: filePath,
            };
            return result;
        }),
        // If the file doesn't exist, treat it as null rather than an error for this context
        Effect.catchTag('FsNoSuchFileOrDirError', () => {
            return Effect.succeed(null);
        }),
        // Catch INI parsing errors specifically and return null
        Effect.catchTag('UnknownException', () => {
            return Effect.succeed(null); // Treat parse errors as skippable entries
        }),
    );
}

async function findDesktopFiles(dirPath: string): Promise<string[]> {
    let entries: string[] = [];
    try {
        // Ensure fs.readdir is awaited correctly
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        for (const dirent of dirents) {
            const fullPath = path.join(dirPath, dirent.name);
            if (dirent.isDirectory()) {
                // Recurse into subdirectories and await the result
                const subEntries = await findDesktopFiles(fullPath);
                entries = entries.concat(subEntries);
            } else if (dirent.isFile() && dirent.name.endsWith('.desktop')) {
                entries.push(fullPath);
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // Ignore errors like permission denied or non-existent directories
        if (error.code === 'ENOENT') {
            // Directory not found, skip silently
        } else if (error.code === 'EACCES') {
            // Permission denied, skip silently
        } else {
            // Log other errors as warnings
            console.warn(
                `Unexpected error reading directory ${dirPath}:`,
                error,
            );
        }
    }
    return entries;
}

function getXdgDataDirs(): string[] {
    const envDirs = process.env['XDG_DATA_DIRS'];
    const defaultDirs = ['/usr/local/share/', '/usr/share/'];
    let result: string[];
    if (envDirs) {
        // Ensure paths are resolved correctly
        result = envDirs.split(':').map((dir) => path.resolve(dir));
    } else {
        result = defaultDirs.map((dir) => path.resolve(dir)); // Resolve default paths too
    }
    return result;
}

function getXdgDataHome(): string {
    const envHome = process.env['XDG_DATA_HOME'];
    const defaultHome = path.join(os.homedir(), '.local/share');
    let result: string;
    if (envHome) {
        result = path.resolve(envHome);
    } else {
        result = path.resolve(defaultHome); // Resolve default path too
    }
    return result;
}

export function getDesktopEntries(): Effect.Effect<
    DesktopEntryView[],
    never // Errors during find/parse are handled and result in empty/partial lists
> {
    const xdgDataDirs = getXdgDataDirs();
    const xdgDataHome = getXdgDataHome();

    const searchDirs = [
        ...xdgDataDirs.map((dir) => path.join(dir, 'applications')),
        path.join(xdgDataHome, 'applications'), // Add user-specific directory
    ];

    // Ensure paths are absolute and unique
    const uniqueSearchDirs = [
        ...new Set(searchDirs.map((dir) => path.resolve(dir))),
    ];

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
        Effect.map((results) => results.flat()), // Flatten the array of arrays
        Effect.flatMap((allFiles) =>
            // Parse files concurrently, allowing individual failures
            Effect.forEach(allFiles, (filePath) => parseDesktopFile(filePath), {
                concurrency: 10, // Increase concurrency for parsing
            }),
        ),
        // Filter out nulls (files not found, skipped, or failed to parse)
        Effect.map((parsedEntries) =>
            parsedEntries.filter(
                (entry): entry is DesktopEntryView => entry !== null,
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
