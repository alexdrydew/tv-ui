import { readFile, writeFile } from 'node:fs/promises';
import type { AppConfig } from '@app/types';
import { test, expect } from './base.js';

import { SINGLE_APP } from './data.js';

test.use({ initialApps: SINGLE_APP });

test('Config file watcher updates UI on external change', async ({
    page,
    configFilePath,
}) => {
    const initialAppName = 'Test App';
    const initialAppId = 'test-app-1';
    const newAppName = 'Watcher App';
    const newAppId = 'watcher-test-app';
    const newAppCommand = '/bin/echo Watcher Test';

    const initialAppTile = page.getByTestId(`app-tile-${initialAppId}`);
    const newAppTile = page.getByTestId(`app-tile-${newAppId}`);

    await expect(
        initialAppTile,
        `Initial app "${initialAppName}" should be visible`,
    ).toBeVisible();
    await expect(
        newAppTile,
        `New app "${newAppName}" should not be visible initially`,
    ).not.toBeVisible();

    expect(
        configFilePath,
        'configFilePath from fixture should be defined',
    ).toBeDefined();
    const currentContent = await readFile(configFilePath!, 'utf-8');
    const currentConfigs: AppConfig[] = JSON.parse(currentContent);

    const newConfig: AppConfig = {
        id: newAppId,
        name: newAppName,
        launchCommand: newAppCommand,
        // Removed 'args'
    };
    const updatedConfigs = [...currentConfigs, newConfig];

    // Add a small delay before writing to ensure the watcher is ready
    await page.waitForTimeout(500);

    await writeFile(
        configFilePath!,
        JSON.stringify(updatedConfigs, null, 2),
        'utf-8',
    );
    console.log(`Updated config file externally: ${configFilePath}`);

    // Wait for the UI to update
    await expect(
        newAppTile,
        `New app "${newAppName}" should become visible after config file change`,
    ).toBeVisible({ timeout: 5000 }); // Increased timeout for watcher debounce + UI update

    // Now remove the initial app
    const configsWithoutInitial = updatedConfigs.filter(
        (config) => config.id !== initialAppId,
    );
    // Add another small delay
    await page.waitForTimeout(500);
    await writeFile(
        configFilePath!,
        JSON.stringify(configsWithoutInitial, null, 2),
        'utf-8',
    );
    console.log(`Removed initial app from config file: ${configFilePath}`);

    // Wait for the UI to update again
    await expect(
        initialAppTile,
        `Initial app "${initialAppName}" should not be visible after removal`,
    ).not.toBeVisible({ timeout: 5000 }); // Increased timeout

    // Verify the new app is still there
    await expect(
        newAppTile,
        `New app "${newAppName}" should still be visible after initial app removal`,
    ).toBeVisible();
});
