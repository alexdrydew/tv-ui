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
    // Check if the iconName is already a valid path
    if (await Effect.runPromise(fileExists(iconName))) {
        return iconName;
    }

    // If not a direct path, ask the main process to find it using freedesktop-icons
    console.log(`Searching icon for ${iconName} using freedesktopIcons...`);
    try {
        const foundPath = await ipcRenderer.invoke(
            'get-freedesktop-icon',
            iconName,
        );
        console.log(
            `Found icon for ${iconName}: ${foundPath ?? 'Not Found'}`,
        );
        return foundPath; // Will be undefined if not found
    } catch (error) {
        console.error(
            `Error invoking 'get-freedesktop-icon' for ${iconName}:`,
            error,
        );
        return undefined;
    }
}

export async function suggestAppConfigs(): Promise<AppConfig[]> {
    const platform = process.env['E2E_TEST_PLATFORM'] ?? os.platform();

    if (platform === 'linux') {
        console.info('Suggesting apps using Linux strategy...');
        const entries = await getDesktopEntries();
        console.info(`Found ${entries.length} raw desktop entries.`);

        // Create an array of promises, each resolving to an AppConfig or null
        const suggestionPromises = entries.map(async (entry) => {
            if (entry.status === 'non-executable') {
                console.info(
                    `Skipping non-executable entry: ${entry.entry.name}`,
                );
                return null; // Skip this entry
            } else if (entry.status === 'hidden') {
                console.log(
                    `Skipping hidden entry: ${entry.entry.name} (NoDisplay=true)`,
                );
                return null; // Skip this entry
            } else {
                // Entry is 'valid'
                const command = entry.entry.exec;
                let iconPath: string | undefined = undefined;

                if (entry.entry.icon) {
                    // Only search if an icon name is provided
                    iconPath = await getIconPathFromMain(entry.entry.icon);
                }

                const suggestion: AppConfig = {
                    id: randomUUID(),
                    name: entry.entry.name,
                    launchCommand: command,
                    icon: iconPath, // Assign found path or undefined
                };
                return suggestion;
            }
        });

        // Wait for all promises to resolve
        const resolvedSuggestions = await Promise.all(suggestionPromises);

        // Filter out the null results (skipped entries)
        const suggestions = resolvedSuggestions.filter(
            (s): s is AppConfig => s !== null,
        );

        console.info(
            `Returning ${suggestions.length} processed Linux suggestions after parallel icon search.`,
        );
        return suggestions;
    }

    console.info(
        `App suggestion not implemented or skipped for platform: ${platform}`,
    );
    return [];
}
