import {
    GET_FREEDESKTOP_ICONS_CHANNEL,
    GetFreedesktopIconsChannel,
} from '@app/types';
import { ipcMain, nativeImage } from 'electron';
import { findIconPaths } from '@app/native-freedesktop-icons';
import { readFileEffect } from '@app/lib/src/fs/index.js';
import { Effect } from 'effect';

async function tryGetIconUrl(
    iconName: string,
    iconPath: string,
): Promise<string | undefined> {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
        return image.toDataURL();
    }

    const fileContent = await Effect.runPromise(readFileEffect(iconPath));

    if (fileContent.includes('<svg')) {
        const base64Content = Buffer.from(fileContent, 'utf-8').toString(
            'base64',
        );
        return `data:image/svg+xml;base64,${base64Content}`;
    }

    console.warn(
        `[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Unsupported image format for icon: ${iconName} at path ${iconPath}. Supported formats are PNG, JPEG, and SVG.`,
    );
    return undefined;
}

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
            if (!iconPath) {
                return [iconName, undefined];
            }
            const iconUrl = await tryGetIconUrl(iconName, iconPath);
            return [iconName, iconUrl];
        },
    );
    return Object.fromEntries(await Promise.all(entries));
};

export function registerSuggestionHandlers() {
    ipcMain.handle(GET_FREEDESKTOP_ICONS_CHANNEL, getFreeDesktopIconsHandler);
}
