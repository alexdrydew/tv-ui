import { ipcMain, nativeImage } from 'electron';
import { findIconPaths } from '@app/native-freedesktop-icons';
export function registerSuggestionHandlers() {
    ipcMain.handle(
        'get-freedesktop-icons',
        async (
            _event,
            iconNames: string[],
            themes?: string | string[],
            size?: number,
            scale?: number,
        ): Promise<Record<string, string | undefined>> => {
            // TODO: instead add message type and validate the message
            if (!Array.isArray(iconNames) || iconNames.length === 0) {
                console.warn(
                    '[main][get-freedesktop-icons] Received invalid or empty iconNames array.',
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
