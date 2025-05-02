import { AppConfig } from '@app/types';
import { randomUUID } from 'crypto';
import { Match } from 'effect';
import { ipcRenderer } from 'electron';
import os from 'os';
import { getDesktopEntries, ValidDesktopEntry } from './linux.js';

import { dropDuplicates } from '@app/lib/src/utils.js';
import { isNodePlatform } from '@app/lib/src/platform.js';
import {
    GET_FREEDESKTOP_ICONS_CHANNEL,
    GetFreedesktopIconsArgs,
    GetFreedesktopIconsReturn,
} from '@app/types';

/**
 * Fetches data URLs for a list of icon identifiers using a single IPC call.
 * @param iconIdentifiers An array of icon names or absolute paths.
 * @returns A promise that resolves to a Record mapping icon identifiers to their data URLs (or null if not found).
 */
async function getIconDataUrlsFromMain(
    iconIdentifiers: string[],
): Promise<GetFreedesktopIconsReturn> {
    if (iconIdentifiers.length === 0) {
        console.log('No icon identifiers provided, skipping IPC call.');
        return {};
    }
    console.log(
        `Requesting data URLs for ${iconIdentifiers.length} icon identifiers from main process...`,
    );
    try {
        const args: GetFreedesktopIconsArgs = {
            iconNames: iconIdentifiers,
            size: 256, // Default size, can be parameterized if needed
        };
        const dataUrlMap: GetFreedesktopIconsReturn = await ipcRenderer.invoke(
            GET_FREEDESKTOP_ICONS_CHANNEL,
            args,
        );
        return dataUrlMap;
    } catch (error) {
        console.error(
            `Error invoking '${GET_FREEDESKTOP_ICONS_CHANNEL}' for multiple identifiers:`,
            error,
        );
        return {};
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

    console.log(`Found ${validEntries.length} valid desktop entries.`);
    validEntries = dropDuplicates(validEntries, 'entry.name');
    console.log(
        `Found ${validEntries.length} valid and deduplicated desktop entries.`,
    );

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
            icon: iconDataUrl,
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
