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
): Effect.Effect<DesktopEntryView | null, never> { // Changed error type to never
    return pipe(
        readFileEffect(filePath), // Can fail with Fs*Error
        Effect.map((buffer) => buffer.toString('utf-8')),
        Effect.tryMap({ // Can fail with UnknownException (parsing)
            try: (content) => ini.parse(content),
            catch: (error) => {
                // console.debug(`INI parsing failed for ${filePath}:`, error); // Optional: Log for debugging
                // Wrap parsing errors but they will be caught by catchAll below
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
                entry.NoDisplay === true || // NoDisplay can be string 'true' or boolean true
                String(entry.NoDisplay).toLowerCase() === 'true' ||
                entry.Type !== 'Application'
            ) {
                return null; // Not a valid/visible application entry
            }

            const id = path.basename(filePath, '.desktop');
            const result: DesktopEntryView = {
                id: id,
                name: String(entry.Name),
                icon: entry.Icon ? String(entry.Icon) : undefined,
                filePath: path.resolve(filePath), // Ensure filePath is absolute
            };
            return result;
        }),
        // Catch ALL errors (Fs*Error, UnknownException from parsing, etc.) and return null
        Effect.catchAll((_error) => {
            // Optional: Log the suppressed error for debugging
            // console.debug(`Skipping desktop entry due to error reading/parsing ${filePath}:`, _error);
            return Effect.succeed(null);
        }),
    );
}

async function findDesktopFiles(dirPath: string): Promise<string[]> {
    let entries: string[] = [];
    try {
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        for (const dirent of dirents) {
            const fullPath = path.join(dirPath, dirent.name);
            if (dirent.isDirectory()) {
                const subEntries = await findDesktopFiles(fullPath);
                entries = entries.concat(subEntries);
            } else if (dirent.isFile() && dirent.name.endsWith('.desktop')) {
                entries.push(fullPath);
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
            // Skip silently for not found or permission denied
        } else {
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
        result = envDirs.split(':').map((dir) => path.resolve(dir));
    } else {
        result = defaultDirs.map((dir) => path.resolve(dir));
    }
    // Filter out empty strings that might result from splitting "::" or trailing ":"
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

export function getDesktopEntries(): Effect.Effect<
    DesktopEntryView[],
    never // Errors during find/parse are handled and result in empty/partial lists
> {
    const xdgDataDirs = getXdgDataDirs();
    const xdgDataHome = getXdgDataHome();

    const searchDirs = [
        ...xdgDataDirs.map((dir) => path.join(dir, 'applications')),
        path.join(xdgDataHome, 'applications'),
    ];

    const uniqueSearchDirs = [
        ...new Set(searchDirs.map((dir) => path.resolve(dir))),
    ];

    return pipe(
        Effect.forEach(
            uniqueSearchDirs,
            (dir) =>
                Effect.tryPromise({
                    try: () => findDesktopFiles(dir),
                    catch: (error) => {
                        console.error(
                            `Unexpected error calling findDesktopFiles for ${dir}:`,
                            error,
                        );
                        return [] as string[]; // Treat as empty list for this directory
                    },
                }),
            { concurrency: 5 },
        ),
        Effect.map((results) => results.flat()),
        Effect.flatMap((allFiles) =>
            Effect.forEach(allFiles, (filePath) => parseDesktopFile(filePath), {
                concurrency: 10,
            }),
        ),
        Effect.map((parsedEntries) =>
            parsedEntries.filter(
                (entry): entry is DesktopEntryView => entry !== null,
            ),
        ),
        Effect.catchAll((error) => {
            // This catchAll is a safeguard, but errors should ideally be handled earlier
            console.error(
                'Caught unexpected error during desktop entry processing pipeline:',
                error,
            );
            return Effect.succeed([]); // Return empty array on unexpected failure
        }),
    );
}
