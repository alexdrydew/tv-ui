import { AppConfig } from '@app/types';
import os from 'node:os';
import { getDesktopEntries } from './linux.js';
import freedesktopIcons from 'freedesktop-icons';

export async function suggestAppConfigs(): Promise<AppConfig[]> {
    const platform = os.platform();

    if (platform === 'linux') {
        const entries = getDesktopEntries();
        const suggestions: AppConfig[] = [];
        for (const entry of entries) {
            const command = entry.exec;
            const icon = entry.icon && (await freedesktopIcons(entry.icon));

            if (command) {
                const suggestion: AppConfig = {
                    id: entry.id,
                    name: entry.name,
                    launchCommand: command,
                    icon: icon,
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
