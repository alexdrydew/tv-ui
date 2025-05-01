import { ipcMain, nativeImage } from 'electron';
import { findIconPath } from '@app/native-freedesktop-icons';
import path from 'node:path'; // Import the path module
import fs from 'node:fs/promises'; // Import fs promises

// Helper function to check if a path exists and is a file
async function pathIsFile(filePath: string): Promise<boolean> {
    try {
        const stats = await fs.stat(filePath);
        return stats.isFile();
    } catch (error: any) {
        // ENOENT means file/dir doesn't exist, treat as not a file
        if (error.code === 'ENOENT') {
            return false;
        }
        // Log other errors but still return false
        console.error(
            `[main][pathIsFile] Error checking path ${filePath}:`,
            error,
        );
        return false;
    }
}

export function registerSuggestionHandlers() {
    ipcMain.handle(
        'get-freedesktop-icon',
        async (
            _event,
            iconNames: string[], // Expecting an array now based on findIconPath signature
            themes?: string | string[],
            size?: number,
            scale?: number,
        ): Promise<string | null> => {
            if (!Array.isArray(iconNames) || iconNames.length === 0) {
                console.warn(
                    '[main][get-freedesktop-icon] Received invalid or empty iconNames array.',
                );
                return null;
            }

            const firstIconIdentifier = iconNames[0];
            let resolvedIconPath: string | null = null;

            console.log(
                `[main][get-freedesktop-icon] Processing icon identifier: ${firstIconIdentifier}`,
            );

            // Check if the first identifier is an absolute path and points to a file
            if (
                path.isAbsolute(firstIconIdentifier) &&
                (await pathIsFile(firstIconIdentifier))
            ) {
                console.log(
                    `[main][get-freedesktop-icon] Identifier ${firstIconIdentifier} is an absolute path to a file. Using it directly.`,
                );
                resolvedIconPath = firstIconIdentifier;
            } else {
                // Otherwise, treat it as a name and search using findIconPath
                console.log(
                    `[main][get-freedesktop-icon] Identifier ${firstIconIdentifier} is not an absolute path or file. Searching by name (native): ${JSON.stringify(iconNames)} with options: ${JSON.stringify({ themes, size, scale })}`,
                );
                resolvedIconPath = findIconPath(iconNames, {
                    themes: typeof themes === 'string' ? [themes] : themes,
                    size,
                    scale,
                });

                if (!resolvedIconPath) {
                    console.log(
                        `[main][get-freedesktop-icon] Icon path not found (native lookup) for: ${JSON.stringify(iconNames)}`,
                    );
                    // Optionally, try the remaining names if the first one failed?
                    // For now, we stick to the original behavior of only using the result of findIconPath.
                } else {
                    console.log(
                        `[main][get-freedesktop-icon] Found icon path via native lookup: ${resolvedIconPath}`,
                    );
                }
            }

            // If no path was resolved either way, return null
            if (!resolvedIconPath) {
                console.log(
                    `[main][get-freedesktop-icon] No icon path resolved for identifier: ${firstIconIdentifier}`,
                );
                return null;
            }

            console.log(
                `[main][get-freedesktop-icon] Attempting to create nativeImage from resolved path: ${resolvedIconPath}`,
            );

            try {
                const image = nativeImage.createFromPath(resolvedIconPath);
                if (image.isEmpty()) {
                    console.warn(
                        `[main][get-freedesktop-icon] Created nativeImage from path ${resolvedIconPath} is empty.`,
                    );
                    return null;
                }
                const dataUrl = image.toDataURL();
                console.log(
                    `[main][get-freedesktop-icon] Successfully created data URL for icon: ${resolvedIconPath} (URL length: ${dataUrl.length})`,
                );
                return dataUrl;
            } catch (error) {
                console.error(
                    `[main][get-freedesktop-icon] Failed to create nativeImage or data URL from path ${resolvedIconPath}:`,
                    error,
                );
                return null;
            }
        },
    );
}
