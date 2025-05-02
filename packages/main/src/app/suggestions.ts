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
                    iconUrl = image.toDataURL();
                    return [iconName, iconUrl];
                }
                // Read as Buffer instead of string
                const fileContentBuffer = await Effect.runPromise(
                    readFileEffect(iconPath),
                );

                // Check if the start of the buffer looks like SVG
                if (
                    fileContentBuffer
                        .slice(0, 256)
                        .toString('utf-8') // Decode only the part we inspect
                        .includes('<svg ')
                ) {
                    // Correctly encode the *entire* buffer content as base64
                    const base64Content = fileContentBuffer.toString('base64');
                    iconUrl = `data:image/svg+xml;base64,${base64Content}`;
                    return [iconName, iconUrl];
                }
                console.warn(
                    `[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Unsupported image format for icon: ${iconName}. Supported formats are PNG, JPEG, and SVG.`, // Updated warning message
                );
            }
            return [iconName, iconUrl];
        },
    );
    return Object.fromEntries(await Promise.all(entries));
};

export function registerSuggestionHandlers() {
    ipcMain.handle(GET_FREEDESKTOP_ICONS_CHANNEL, getFreeDesktopIconsHandler);
}
