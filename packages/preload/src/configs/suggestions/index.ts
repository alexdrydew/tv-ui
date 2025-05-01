import { AppConfig } from '@app/types';
import os from 'node:os';
import { ipcRenderer } from 'electron';
import { getDesktopEntries } from './linux.js';
// Remove fileExists import as it's no longer needed here
// import { fileExists } from '#src/fs/index.js';
// Remove Effect import if fileExists was the only reason for it
// import { Effect } from 'effect';
import { randomUUID } from 'crypto';

/**
 * Asks the main process to resolve an icon identifier (name or path)
 * and return its data URL.
 * @param iconIdentifier The icon name or absolute path from the .desktop file.
 * @returns A promise that resolves to the data URL string or undefined if not found/error.
 */
async function getIconDataUrlFromMain(
    iconIdentifier: string,
): Promise<string | undefined> {
    // Always delegate to the main process.
    // The main process handler ('get-freedesktop-icon') is responsible for
    // determining if the identifier is a path or a name, finding the icon,
    // and converting it to a data URL.
    console.log(
        `Requesting data URL for icon identifier "${iconIdentifier}" from main process...`,
    );
    try {
        // Pass the identifier as the first element of the array,
        // as expected by the main process handler.
        const dataUrl = await ipcRenderer.invoke('get-freedesktop-icon', [
            iconIdentifier,
        ]);
        if (dataUrl) {
            console.log(
                `Received data URL for icon identifier "${iconIdentifier}" (Length: ${dataUrl.length})`,
            );
        } else {
            console.log(
                `Main process did not find or could not generate data URL for icon identifier "${iconIdentifier}".`,
            );
        }
        return dataUrl; // Will be the data URL string or null/undefined
    } catch (error) {
        console.error(
            `Error invoking 'get-freedesktop-icon' for identifier "${iconIdentifier}":`,
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
                let iconDataUrl: string | undefined = undefined;

                if (entry.entry.icon) {
                    // Always call the main process to get the data URL
                    iconDataUrl = await getIconDataUrlFromMain(
                        entry.entry.icon,
                    );
                }

                const suggestion: AppConfig = {
                    id: randomUUID(),
                    name: entry.entry.name,
                    launchCommand: command,
                    icon: iconDataUrl, // Assign found data URL or undefined
                };
                return suggestion;
            }
        });

        const resolvedSuggestions = await Promise.all(suggestionPromises);
        const suggestions = resolvedSuggestions.filter(
            (s): s is AppConfig => s !== null,
        );

        console.info(
            `Returning ${suggestions.length} processed Linux suggestions after parallel icon processing.`,
        );
        return suggestions;
    }

    console.info(
        `App suggestion not implemented or skipped for platform: ${platform}`,
    );
    return [];
}
