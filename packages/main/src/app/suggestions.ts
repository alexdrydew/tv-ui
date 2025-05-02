import {
    GET_FREEDESKTOP_ICONS_CHANNEL,
    GetFreedesktopIconsChannel,
} from '@app/types';
import { ipcMain, nativeImage } from 'electron';
import { findIconPaths } from '@app/native-freedesktop-icons';
import { readFileEffect } from '@app/lib/src/fs/index.js';
import { Effect } from 'effect';

const getFreeDesktopIconsHandler: GetFreedesktopIconsChannel['handle'] = async (
    _event,
    { iconNames, themes, size, scale },
): ReturnType<GetFreedesktopIconsChannel['handle']> => {
    if (!Array.isArray(iconNames) || iconNames.length === 0) {
        console.warn(
            `[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Received invalid or empty iconNames array.`,
        );
        return {};
    }

    const resolvedIconsPaths = findIconPaths(iconNames, {
        themes: typeof themes === 'string' ? [themes] : themes,
        size,
        scale,
    });

    console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] findIconPaths resolved:`, JSON.stringify(resolvedIconsPaths)); // Added logging

    const entries = Object.entries(resolvedIconsPaths).map(
        async ([iconName, iconPath]) => {
            console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Processing icon: ${iconName}, Path: ${iconPath}`); // Added logging
            let iconUrl: string | undefined = undefined;
            if (iconPath) {
                console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Attempting nativeImage for: ${iconPath}`); // Added logging
                const image = nativeImage.createFromPath(iconPath);
                if (!image.isEmpty()) {
                    console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] nativeImage succeeded for: ${iconPath}`); // Added logging
                    iconUrl = image.toDataURL();
                    return [iconName, iconUrl];
                }
                console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] nativeImage failed (isEmpty=true) for: ${iconPath}. Checking for SVG...`); // Added logging
                // Read as Buffer instead of string
                let fileContentBuffer: Buffer;
                try {
                    fileContentBuffer = await Effect.runPromise(
                        readFileEffect(iconPath),
                    );
                    console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Successfully read file: ${iconPath}`); // Added logging
                } catch (error) {
                    console.error(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Error reading file ${iconPath}:`, error); // Added logging
                    return [iconName, undefined]; // Return undefined if read fails
                }


                // Check if the start of the buffer looks like SVG
                if (
                    fileContentBuffer
                        .slice(0, 256)
                        .toString('utf-8') // Decode only the part we inspect
                        .includes('<svg ')
                ) {
                    console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Detected SVG for: ${iconPath}. Encoding...`); // Added logging
                    // Correctly encode the *entire* buffer content as base64
                    const base64Content = fileContentBuffer.toString('base64');
                    iconUrl = `data:image/svg+xml;base64,${base64Content}`;
                    console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Encoded SVG data URL for: ${iconName}`); // Added logging
                    return [iconName, iconUrl];
                }
                console.warn(
                    `[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Unsupported image format for icon: ${iconName} at path ${iconPath}. Supported formats are PNG, JPEG, and SVG.`, // Updated warning message with path
                );
            } else {
                 console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] No iconPath found for icon: ${iconName}`); // Added logging
            }
            console.log(`[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Returning undefined URL for icon: ${iconName}`); // Added logging
            return [iconName, iconUrl]; // iconUrl will be undefined here
        },
    );
    return Object.fromEntries(await Promise.all(entries));
};

export function registerSuggestionHandlers() {
    ipcMain.handle(GET_FREEDESKTOP_ICONS_CHANNEL, getFreeDesktopIconsHandler);
}
