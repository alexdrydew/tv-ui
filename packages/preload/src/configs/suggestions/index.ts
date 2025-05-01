import { AppConfig } from '@app/types';
import os from 'node:os';
import { ipcRenderer } from 'electron';
import { getDesktopEntries } from './linux.js';
import { fileExists } from '#src/fs/index.js';
import { Effect } from 'effect';
import { randomUUID } from 'crypto';

async function getIconPathFromMain(
    iconName: string,
): Promise<string | undefined> {
    if (await Effect.runPromise(fileExists(iconName))) {
        return iconName;
    }

    // freedesktopIcons can't be called from preload process
    console.log(`Searching icon for ${iconName} using freedesktopIcons...`);
    return ipcRenderer.invoke('get-freedesktop-icon', iconName);
}

export async function suggestAppConfigs(): Promise<AppConfig[]> {
    const platform = process.env['E2E_TEST_PLATFORM'] ?? os.platform();

    if (platform === 'linux') {
        console.info('Suggesting apps using Linux strategy...');
        const entries = await getDesktopEntries();
        console.info(`Found ${entries.length} raw desktop entries.`);
        const suggestions: AppConfig[] = [];
        for (const entry of entries) {
            const command = entry.exec;
            const iconPath = entry.icon
                ? await getIconPathFromMain(entry.icon)
                : undefined;

            const suggestion: AppConfig = {
                id: randomUUID(),
                name: entry.name,
                launchCommand: command,
                icon: iconPath ?? undefined, // Use nullish coalescing
            };
            suggestions.push(suggestion);
        }
        console.info(
            `Returning ${suggestions.length} processed Linux suggestions.`,
        );
        return suggestions;
    }

    console.info(
        `App suggestion not implemented or skipped for platform: ${platform}`,
    );
    return [];
}
