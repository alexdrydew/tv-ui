import { ipcMain } from 'electron/main';
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
                `[main][get-freedesktop-icon] Searching for icon (native): ${JSON.stringify(iconName)} with options: ${JSON.stringify({ themes, size, scale })}`,
            );

            const result = findIconPath(iconName, {
                themes: typeof themes === 'string' ? [themes] : themes,
                size,
                scale,
            });

            console.log(
                `[main][get-freedesktop-icon] Found icon path (native): ${result}`,
            );
            return result;
        },
    );
}
