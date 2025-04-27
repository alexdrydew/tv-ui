import { AppConfig } from '@app/types';
import os from 'node:os';
import { ipcRenderer } from 'electron';
import { getDesktopEntries } from './linux.js';

export async function suggestAppConfigs(): Promise<AppConfig[]> {
    const platform = os.platform();

    if (platform === 'linux') {
        const entries = await getDesktopEntries();
        const suggestions: AppConfig[] = [];
        for (const entry of entries) {
            const command = entry.exec;
            let iconPath: string | undefined | null = undefined;
            if (entry.icon) {
                try {
                    // Request icon path from main process
                    iconPath = await ipcRenderer.invoke(
                        'get-freedesktop-icon',
                        entry.icon,
                    );
                } catch (error) {
                    console.error(
                        `IPC call failed for icon '${entry.icon}':`,
                        error,
                    );
                    iconPath = undefined; // Treat as if no icon found on error
                }
            }

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
