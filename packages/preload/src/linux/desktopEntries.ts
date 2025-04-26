    import { DesktopEntryView } from '@app/types';
    import { Effect, pipe } from 'effect';
    import fs from 'node:fs/promises';
    import os from 'node:os';
    import path from 'node:path';
    import ini from 'ini';
    import { FsError, FsNoSuchFileOrDirError } from '#src/fs/errors.js';
    import { readFileEffect } from '#src/fs/index.js';
    import { UnknownException } from 'effect/Cause';

    // Standard locations for .desktop files on Linux
    const DESKTOP_ENTRY_DIRS = [
        '/usr/share/applications',
        '/usr/local/share/applications',
        path.join(os.homedir(), '.local/share/applications'),
    ];

    // Function to safely read and parse a .desktop file
    function parseDesktopFile(
        filePath: string,
    ): Effect.Effect<DesktopEntryView | null, FsError | UnknownException> {
        return pipe(
            readFileEffect(filePath),
            Effect.map((buffer) => buffer.toString('utf-8')),
            Effect.tryMap({
                try: (content) => ini.parse(content),
                catch: (error) => new UnknownException(error), // Consider a specific INI parse error
            }),
            Effect.map((parsed) => {
                const entry = parsed['Desktop Entry'];
                if (
                    !entry ||
                    typeof entry !== 'object' ||
                    !entry.Name ||
                    entry.NoDisplay === 'true' || // Skip hidden entries
                    entry.Type !== 'Application' // Only include applications
                ) {
                    return null; // Not a valid/visible application entry
                }

                const id = path.basename(filePath, '.desktop');
                return {
                    id: id,
                    name: String(entry.Name), // Ensure name is string
                    icon: entry.Icon ? String(entry.Icon) : undefined,
                    filePath: filePath,
                };
            }),
            // If the file doesn't exist, treat it as null rather than an error for this context
            Effect.catchTag('FsNoSuchFileOrDirError', () => Effect.succeed(null)),
        );
    }

    // Function to find all .desktop files in a directory recursively (optional depth)
    async function findDesktopFiles(dirPath: string): Promise<string[]> {
        let entries: string[] = [];
        try {
            const dirents = await fs.readdir(dirPath, { withFileTypes: true });
            for (const dirent of dirents) {
                const fullPath = path.join(dirPath, dirent.name);
                if (dirent.isDirectory()) {
                    // Optionally recurse, but standard dirs usually don't nest much
                    // entries = entries.concat(await findDesktopFiles(fullPath));
                } else if (dirent.isFile() && dirent.name.endsWith('.desktop')) {
                    entries.push(fullPath);
                }
            }
        } catch (error: any) {
            // Ignore errors like permission denied or non-existent directories
            if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
                console.warn(`Error reading directory ${dirPath}:`, error);
            }
        }
        return entries;
    }

    // Main function to get all desktop entries
    export function getDesktopEntries(): Effect.Effect<
        DesktopEntryView[],
        never // Errors are handled internally or logged
    > {
        return pipe(
            Effect.forEach(
                DESKTOP_ENTRY_DIRS,
                (dir) =>
                    Effect.tryPromise({
                        try: () => findDesktopFiles(dir),
                        catch: (error) => new UnknownException(error), // Should be caught by findDesktopFiles, but belt-and-suspenders
                    }),
                { concurrency: 'inherit' }, // Process directories concurrently
            ),
            Effect.map((results) => results.flat()), // Flatten the array of arrays
            Effect.flatMap((allFiles) =>
                Effect.forEach(allFiles, (filePath) => parseDesktopFile(filePath), {
                    concurrency: 'inherit', // Parse files concurrently
                }),
            ),
            Effect.map((parsedEntries) =>
                parsedEntries.filter(
                    (entry): entry is DesktopEntryView => entry !== null,
                ),
            ),
            // In case of errors finding/parsing, return empty list for now
            Effect.catchAll((error) => {
                console.error('Error fetching desktop entries:', error);
                return Effect.succeed([]);
            }),
        );
    }
