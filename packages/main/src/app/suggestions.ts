import { ipcMain } from 'electron/main';
import freedesktopIcons from 'freedesktop-icons';

export function registerSuggestionHandlers() {
    ipcMain.handle(
        'get-freedesktop-icon',
        async (
            _event,
            iconName: string | string[],
            themes?: string | string[],
            exts?: string | string[],
            fallbackPaths?: string | string[],
        ): Promise<string | undefined> => {
            console.log(
                `[main][get-freedesktop-icon] Searching for icon: ${JSON.stringify(iconName)}`,
            );
            const result =
                (await freedesktopIcons(iconName, themes, exts, fallbackPaths)) ||
                undefined;
            console.log(
                `[main][get-freedesktop-icon] Found icon path: ${result}`,
            );
            return result;
        },
    );
}
