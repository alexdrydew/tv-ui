import {
    GET_FREEDESKTOP_ICONS_CHANNEL,
    GetFreedesktopIconsChannel,
} from '@app/types';
import { ipcMain, nativeImage } from 'electron';
import { findIconPaths } from '@app/native-freedesktop-icons';

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

    return Object.fromEntries(
        Object.entries(resolvedIconsPaths).map(([iconName, iconPath]) => {
            let iconUrl: string | undefined = undefined;
            if (iconPath) {
                const ext = iconPath.split('.').pop();
                if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
                    const image = nativeImage.createFromPath(iconPath);
                    iconUrl = image.toDataURL();
                } else {
                    console.warn(
                        `[main][${GET_FREEDESKTOP_ICONS_CHANNEL}] Unsupported image format for icon: ${iconName}. Supported formats are PNG and JPEG.`,
                    );
                }
            }
            return [iconName, iconUrl];
        }),
    );
};

export function registerSuggestionHandlers() {
    ipcMain.handle(GET_FREEDESKTOP_ICONS_CHANNEL, getFreeDesktopIconsHandler);
}
