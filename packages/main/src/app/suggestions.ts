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
            return (
                (await freedesktopIcons(iconName, themes, exts, fallbackPaths)) ||
                undefined
            );
        },
    );
}
        _event,
        iconName: string | string[],
        themes?: string | string[],
        exts?: string | string[],
        fallbackPaths?: string | string[],
    ): Promise<string | undefined> => {
        return (
            (await freedesktopIcons(iconName, themes, exts, fallbackPaths)) ||
            undefined
        );
    },
);
