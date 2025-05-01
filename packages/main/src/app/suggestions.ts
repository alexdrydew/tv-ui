import { ipcMain, nativeImage } from 'electron';
import { findIconPath } from '@app/native-freedesktop-icons';

export function registerSuggestionHandlers() {
    ipcMain.handle(
        'get-freedesktop-icon',
        async (
            _event,
            iconName: string[],
            themes?: string | string[],
            size?: number,
            scale?: number,
        ): Promise<string | null> => {
            console.log(
                `[main][get-freedesktop-icon] Searching for icon path (native): ${JSON.stringify(iconName)} with options: ${JSON.stringify({ themes, size, scale })}`,
            );

            const iconPath = findIconPath(iconName, {
                themes: typeof themes === 'string' ? [themes] : themes,
                size,
                scale,
            });

            if (!iconPath) {
                console.log(
                    `[main][get-freedesktop-icon] Icon path not found (native) for: ${JSON.stringify(iconName)}`,
                );
                return null;
            }

            console.log(
                `[main][get-freedesktop-icon] Found icon path (native): ${iconPath}. Creating nativeImage.`,
            );

            try {
                const image = nativeImage.createFromPath(iconPath);
                if (image.isEmpty()) {
                    console.warn(
                        `[main][get-freedesktop-icon] Created nativeImage from path ${iconPath} is empty.`,
                    );
                    return null;
                }
                const dataUrl = image.toDataURL();
                console.log(
                    `[main][get-freedesktop-icon] Successfully created data URL for icon: ${iconPath} (URL length: ${dataUrl.length})`,
                );
                return dataUrl;
            } catch (error) {
                console.error(
                    `[main][get-freedesktop-icon] Failed to create nativeImage or data URL from path ${iconPath}:`,
                    error,
                );
                return null;
            }
        },
    );
}
