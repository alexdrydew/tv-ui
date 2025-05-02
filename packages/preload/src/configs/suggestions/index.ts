import { isNodePlatform } from '#src/lib/platform.js';
import { AppConfig } from '@app/types';
import { randomUUID } from 'crypto';
import { Match } from 'effect';
import { ipcRenderer } from 'electron';
import os from 'os';
import { getDesktopEntries, ValidDesktopEntry } from './linux.js';
import { dropDuplicates } from '#src/lib/utils.js';

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

function getPlatform(): NodeJS.Platform {
    const envPlatform = process.env['E2E_TEST_PLATFORM'];
    if (!envPlatform) {
        return os.platform();
    }

    if (!isNodePlatform(envPlatform)) {
        throw new Error(
            `Invalid platform detected: ${envPlatform}. Expected a NodeJS platform.`,
        );
    }
    return envPlatform;
}

async function suggestLinuxAppConfigs(): Promise<AppConfig[]> {
    console.info('Suggesting apps using Linux strategy...');
    const entries = await getDesktopEntries();
    console.info(`Found ${entries.length} raw desktop entries.`);

    let validEntries = entries
        .map((entry) => {
            return Match.value(entry.status).pipe(
                Match.withReturnType<ValidDesktopEntry | undefined>(),
                Match.when('non-executable', (): undefined => {
                    console.info(
                        `Skipping non-executable entry: ${entry.entry.name}`,
                    );
                }),
                Match.when('hidden', (): undefined => {
                    console.log(
                        `Skipping hidden entry: ${entry.entry.name} (NoDisplay=true)`,
                    );
                }),
                Match.when('valid', () => {
                    // this is needed due to a limitation of matching typings
                    if (entry.status === 'valid') {
                        return entry;
                    }
                }),
                Match.exhaustive,
            );
        })
        .filter((el) => el !== undefined);

    validEntries = dropDuplicates(validEntries, 'entry.name');
    const iconDataUrlMap = await getIconDataUrlsFromMain(
        validEntries
            .map((entry) => entry.entry.icon)
            .filter((value) => value !== undefined),
    );

    const suggestions = validEntries.map((entry) => {
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

        return {
            id: randomUUID(),
            name: entry.entry.name,
            launchCommand: command,
            icon: iconDataUrl, // Assign found data URL or undefined
        };
    });

    console.info(
        `Returning ${suggestions.length} processed and deduplicated Linux suggestions.`,
    );
    return suggestions;
}

export async function suggestAppConfigs(
    platform?: NodeJS.Platform,
): Promise<AppConfig[]> {
    return Match.value(platform || getPlatform()).pipe(
        Match.when('linux', async () => {
            return suggestLinuxAppConfigs();
        }),
        Match.orElse(() => {
            console.log(
                `App suggestion not implemented or skipped for platform: ${platform}`,
            );
            return [];
        }),
    );
}
