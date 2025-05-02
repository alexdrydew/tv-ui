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

    const entries = Object.entries(resolvedIconsPaths).map(
        async ([iconName, iconPath]) => {
            let iconUrl: string | undefined = undefined;
            if (iconPath) {
                const image = nativeImage.createFromPath(iconPath);
                if (!image.isEmpty()) {
                    iconUrl = image.toDataURL();
                    return [iconName, iconUrl];
                }
                const fileContentBuffer = await Effect.runPromise(
                    readFileEffect(iconPath),
                );
                const fileContent = fileContentBuffer.toString('utf-8');

                if (fileContent.includes('<svg ')) {
                    const base64Content = Buffer.from(
                        fileContent,
                        'utf-8',
                    ).toString('base64');
                    iconUrl = `data:image/svg+xml;base64,${base64Content}`;
                    return [iconName, iconUrl];
                }
                console.warn(
                    `[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Unsupported image format for icon: ${iconName} at path ${iconPath}. Supported formats are PNG, JPEG, and SVG.`,
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
