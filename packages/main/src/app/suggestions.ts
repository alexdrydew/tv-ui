import {
    GET_FREEDESKTOP_ICONS_CHANNEL,
    GetFreedesktopIconsChannel,
} from '@app/types';
import { ipcMain, nativeImage } from 'electron';
import { findIconPaths } from '@app/native-freedesktop-icons';

export function registerSuggestionHandlers() {
    ipcMain.handle(
        GET_FREEDESKTOP_ICONS_CHANNEL,
        async (
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
                Object.entries(resolvedIconsPaths).map(
                    ([iconName, iconPath]) => {
                        let iconUrl: string | undefined = undefined;
                        if (iconPath) {
                            const image = nativeImage.createFromPath(iconPath);
                            iconUrl = image.toDataURL();
                        }
                        return [iconName, iconUrl];
                    },
                ),
            );
        },
    );
}
