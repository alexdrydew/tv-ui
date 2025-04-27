import { AppConfig } from '@app/types';
import os from 'node:os';
import { ipcRenderer } from 'electron';
import { getDesktopEntries } from './linux.js';

// freedesktopIcons can't be called from preload process
async function getIconPathFromMain(
    iconName: string,
): Promise<string | undefined> {
    return await ipcRenderer.invoke('get-freedesktop-icon', iconName);
}

export async function suggestAppConfigs(): Promise<AppConfig[]> {
    const platform = os.platform();

    if (platform === 'linux') {
        const entries = await getDesktopEntries();
        const suggestions: AppConfig[] = [];
        for (const entry of entries) {
            const command = entry.exec;
            const iconPath = entry.icon
                ? await getIconPathFromMain(entry.icon)
                : undefined;

            if (command) {
                const suggestion: AppConfig = {
                    id: entry.id,
                    name: entry.name,
                    launchCommand: command,
                    icon: iconPath ?? undefined, // Use nullish coalescing
                };
                suggestions.push(suggestion);
            } else {
                console.warn(
                    `Could not determine command for suggestion: ${entry.name} (${entry.filePath})`,
                );
            }
        }
        return suggestions;
    }
    return [];
}
