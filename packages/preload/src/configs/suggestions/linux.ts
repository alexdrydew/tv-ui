import { DesktopEntryView } from '@app/types';
import { Effect, pipe } from 'effect';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ini from 'ini';
import { readFileEffect } from '#src/fs/index.js';
import { UnknownException } from 'effect/Cause';
import { AppConfigSchema } from '@app/types/src'; // Import AppConfigSchema for validation if needed, or just AppConfig type
import { Schema } from '@effect/schema';

// Define an extended type locally for parsing, including the exec command
type DesktopEntryInternal = DesktopEntryView & { exec?: string };

function parseDesktopFile(
    filePath: string,
): Effect.Effect<DesktopEntryInternal | null, never> { // Return internal type
    return pipe(
        readFileEffect(filePath), // Can fail with Fs*Error
        Effect.map((buffer) => buffer.toString('utf-8')),
        Effect.tryMap({ // Can fail with UnknownException (parsing)
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
        Effect.catchAll((_error) => {
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
    } catch (error: unknown) {
        // Check if error is an object with a 'code' property
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error.code === 'ENOENT' || error.code === 'EACCES')
        ) {
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

// This function now effectively returns DesktopEntryInternal[]
export function getDesktopEntries(): Effect.Effect<
    DesktopEntryInternal[], // Return internal type
    never
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
                    // Provide a specific type for the caught error
                    catch: (error: unknown) => {
                        console.error(
                            `Unexpected error calling findDesktopFiles for ${dir}:`,
                            error,
                        );
                        // Ensure the catch returns the expected type (string[])
                        return [] as string[];
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
            // Filter out nulls and ensure type correctness
            parsedEntries.filter(
                (entry): entry is DesktopEntryInternal => entry !== null,
            ),
        ),
        Effect.catchAll((error) => {
            console.error(
                'Caught unexpected error during desktop entry processing pipeline:',
                error,
            );
            return Effect.succeed([]);
        }),
    );
}
