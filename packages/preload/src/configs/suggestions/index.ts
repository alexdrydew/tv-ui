import { AppConfig } from '@app/types';
import os from 'node:os';
import { ipcRenderer } from 'electron';
import { getDesktopEntries } from './linux.js';
import { randomUUID } from 'crypto';

/**
 * Fetches data URLs for a list of icon identifiers using a single IPC call.
 * @param iconIdentifiers An array of icon names or absolute paths.
 * @returns A promise that resolves to a Record mapping icon identifiers to their data URLs (or null if not found).
 */
async function getIconDataUrlsFromMain(
    iconIdentifiers: string[],
): Promise<Record<string, string | null>> {
    if (iconIdentifiers.length === 0) {
        console.log('No icon identifiers provided, skipping IPC call.');
        return {};
    }
    console.log(
        `Requesting data URLs for ${iconIdentifiers.length} icon identifiers from main process...`,
    );
    try {
        // Pass the array of identifiers as the first argument.
        const dataUrlMap = await ipcRenderer.invoke(
            'get-freedesktop-icon',
            iconIdentifiers, // Pass the array here
            undefined,
            256,
        );
        console.log(
            `Received data URL map from main process for ${Object.keys(dataUrlMap).length} identifiers.`,
        );
        return dataUrlMap || {}; // Ensure we return an object even if main returns null/undefined
    } catch (error) {
        console.error(
            `Error invoking 'get-freedesktop-icon' for multiple identifiers:`,
            error,
        );
        return {}; // Return empty map on error
    }
}

export async function suggestAppConfigs(): Promise<AppConfig[]> {
    const platform = process.env['E2E_TEST_PLATFORM'] ?? os.platform();

    if (platform === 'linux') {
        console.info('Suggesting apps using Linux strategy...');
        const entries = await getDesktopEntries();
        console.info(`Found ${entries.length} raw desktop entries.`);

        const validEntries = [];
        const iconIdentifiersToFetch: string[] = [];

        // First pass: Filter valid entries and collect icon identifiers
        for (const entry of entries) {
            if (entry.status === 'non-executable') {
                console.info(
                    `Skipping non-executable entry: ${entry.entry.name}`,
                );
                continue;
            } else if (entry.status === 'hidden') {
                console.log(
                    `Skipping hidden entry: ${entry.entry.name} (NoDisplay=true)`,
                );
                continue;
            } else {
                // Entry is 'valid'
                validEntries.push(entry);
                if (entry.entry.icon) {
                    // Avoid adding duplicates if multiple entries use the same icon
                    if (!iconIdentifiersToFetch.includes(entry.entry.icon)) {
                        iconIdentifiersToFetch.push(entry.entry.icon);
                    }
                }
            }
        }

        console.info(
            `Found ${validEntries.length} potentially valid entries. Need to fetch icons for ${iconIdentifiersToFetch.length} unique identifiers.`,
        );

        // Fetch all required icon data URLs in a single batch
        const iconDataUrlMap =
            await getIconDataUrlsFromMain(iconIdentifiersToFetch);

        // Second pass: Construct AppConfig objects using the fetched icons
        const suggestions: AppConfig[] = [];
        for (const entry of validEntries) {
            const command = entry.entry.exec;
            let iconDataUrl: string | undefined = undefined;

            if (entry.entry.icon) {
                const fetchedUrl = iconDataUrlMap[entry.entry.icon];
                if (fetchedUrl) {
                    iconDataUrl = fetchedUrl;
                    console.log(
                        `Found data URL for icon "${entry.entry.icon}" (Entry: ${entry.entry.name})`,
                    );
                } else {
                    console.log(
                        `Data URL not found or invalid for icon "${entry.entry.icon}" (Entry: ${entry.entry.name})`,
                    );
                }
            }

            const suggestion: AppConfig = {
                id: randomUUID(),
                name: entry.entry.name,
                launchCommand: command,
                icon: iconDataUrl, // Assign found data URL or undefined
            };
            suggestions.push(suggestion);
        }

        console.info(
            `Returning ${suggestions.length} processed Linux suggestions after single icon batch processing.`,
        );
        return suggestions;
    }

    console.info(
        `App suggestion not implemented or skipped for platform: ${platform}`,
    );
    return [];
}
