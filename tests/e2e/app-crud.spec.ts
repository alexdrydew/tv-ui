import { readFile } from 'node:fs/promises';
import type { AppConfig } from '@app/types';
import { test, expect } from './base.js';
import { SINGLE_APP } from './data.js';

test.use({ initialApps: SINGLE_APP });

test('App tile is rendered when config has an app', async ({ page }) => {
    const appTile = page.getByRole('button', { name: SINGLE_APP[0].name });

    await expect(
        appTile,
        'The AppTile for "Test App" should be visible',
    ).toBeVisible();
    await expect(appTile).toContainText('Test App');
});

test('Add new app config via UI', async ({ page, configFilePath }) => {
    await page.getByRole('button', { name: 'Add App' }).click();

    // Expect the dialog showing suggestions first
    const suggestionsDialog = page.getByRole('dialog', { name: 'Add New App' });
    await expect(
        suggestionsDialog,
        'The "Add New App" dialog (suggestions view) should appear',
    ).toBeVisible();

    // Wait for loading to finish (either suggestions load, show empty, show not-supported, or error)
    // A good indicator that loading is done is the presence of the "Create Manually" button/link.
    const createManuallyButton = suggestionsDialog.getByRole('button', {
        name: /Create Manually/i, // Use regex to match "Create Manually" or "Create Manually Instead?"
    });

    await expect(
        createManuallyButton,
        'The "Create Manually" button/link should become visible',
    ).toBeVisible({ timeout: 10000 }); // Increased timeout for suggestion loading/checking

    // Click the "Create Manually" button/link (works whether suggestions are shown or not)
    await createManuallyButton.click();

    // Now expect the dialog title/content to change for the manual form
    const manualDialog = page.getByRole('dialog', { name: 'Add App Manually' });
    await expect(
        manualDialog,
        'The "Add App Manually" dialog view should appear',
    ).toBeVisible();

    // Fill in the form
    const appName = 'My New Test App';
    const launchCommand = '/bin/true'; // Use a command that exits quickly for this test
    await manualDialog.getByLabel('App Name').fill(appName);
    await manualDialog.getByLabel('Launch Command').fill(launchCommand);

    // Click the "Save App" button
    await manualDialog.getByRole('button', { name: 'Save App' }).click();

    // Wait for the dialog to close
    await expect(
        manualDialog, // Can check either dialog locator, as it should close
        'The Add App dialog should close after saving',
    ).not.toBeVisible();

    // Verify config file update
    expect(
        configFilePath,
        'configFilePath from fixture should be defined',
    ).toBeDefined();

    const configFileContent = await readFile(configFilePath!, 'utf-8');
    const updatedConfigs: AppConfig[] = JSON.parse(configFileContent);

    const addedConfig = updatedConfigs.find(
        (config) => config.name === appName,
    );

    expect(
        addedConfig,
        `Config file should contain an entry for "${appName}"`,
    ).toBeDefined();
    expect(
        addedConfig?.launchCommand,
        `Config entry for "${appName}" should have the correct launch command`,
    ).toBe(launchCommand);
    expect(
        addedConfig?.id,
        `Config entry for "${appName}" should have an ID`,
    ).toBeDefined();

    // Verify the new app tile is visible using its generated ID
    const newAppTile = page.getByTestId(`app-tile-${addedConfig!.id}`);
    await expect(
        newAppTile,
        `The AppTile for "${appName}" (ID: ${addedConfig!.id}) should be visible after adding`,
    ).toBeVisible();
    await expect(newAppTile).toContainText(appName);
});

test('Delete app config via context menu', async ({ page, configFilePath }) => {
    const appNameToDelete = 'Test App';
    const appIdToDelete = 'test-app-1';
    const appTile = page.getByTestId(`app-tile-${appIdToDelete}`);

    await expect(
        appTile,
        `The AppTile for "${appNameToDelete}" should initially be visible`,
    ).toBeVisible();

    // Ensure the app is not running before trying to delete
    const runningIndicator = appTile.locator(
        '[data-testid="running-indicator"]',
    );
    await expect(
        runningIndicator,
        'Running indicator should not be visible before delete',
    ).not.toBeVisible({ timeout: 1000 });

    await appTile.click({ button: 'right' });
    const deleteMenuItem = page.getByRole('menuitem', { name: 'Delete app' });
    await expect(
        deleteMenuItem,
        'The "Delete app" context menu item should be visible',
    ).toBeVisible();
    await deleteMenuItem.click();
    await expect(
        appTile,
        `The AppTile for "${appNameToDelete}" should not be visible after deletion`,
    ).not.toBeVisible();
    expect(
        configFilePath,
        'configFilePath from fixture should be defined',
    ).toBeDefined();

    const configFileContent = await readFile(configFilePath!, 'utf-8');
    const updatedConfigs: AppConfig[] = JSON.parse(configFileContent);

    const deletedConfig = updatedConfigs.find(
        (config) => config.id === appIdToDelete,
    );

    expect(
        deletedConfig,
        `Config file should no longer contain an entry for ID "${appIdToDelete}"`,
    ).toBeUndefined();
});

test('Edit app config via context menu', async ({ page, configFilePath }) => {
    const initialAppName = 'Test App';
    const initialAppId = 'test-app-1';
    const initialLaunchCommand = 'sleep 1';
    const editedAppName = 'Edited Test App';
    const editedLaunchCommand = '/bin/false'; // Use a command that exits quickly

    const appTile = page.getByTestId(`app-tile-${initialAppId}`);

    await expect(
        appTile,
        `The AppTile for "${initialAppName}" should initially be visible`,
    ).toBeVisible();

    // Ensure the app is not running before trying to edit
    const runningIndicator = appTile.locator(
        '[data-testid="running-indicator"]',
    );
    await expect(
        runningIndicator,
        'Running indicator should not be visible before edit',
    ).not.toBeVisible({ timeout: 1000 });

    await appTile.click({ button: 'right' });
    const editMenuItem = page.getByRole('menuitem', { name: 'Edit' });
    await expect(
        editMenuItem,
        'The "Edit" context menu item should be visible',
    ).toBeVisible();
    await editMenuItem.click();
    const dialog = page.getByRole('dialog', { name: 'Edit App' });
    await expect(dialog, 'The "Edit App" dialog should appear').toBeVisible();
    await expect(
        dialog.getByLabel('App Name'),
        'Dialog "App Name" should be pre-filled',
    ).toHaveValue(initialAppName);
    await expect(
        dialog.getByLabel('Launch Command'),
        'Dialog "Launch Command" should be pre-filled',
    ).toHaveValue(initialLaunchCommand);
    await dialog.getByLabel('App Name').fill(editedAppName);
    await dialog.getByLabel('Launch Command').fill(editedLaunchCommand);

    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(
        dialog,
        'The "Edit App" dialog should close after saving',
    ).not.toBeVisible();
    const specificAppTile = page.getByTestId(`app-tile-${initialAppId}`);
    await expect(
        specificAppTile,
        `App tile with ID ${initialAppId} should contain the new name "${editedAppName}"`,
    ).toContainText(editedAppName);
    await expect(
        page.getByRole('button', { name: editedAppName }),
        `The AppTile for "${editedAppName}" should be visible after editing`,
    ).toBeVisible();
    expect(
        configFilePath,
        'configFilePath from fixture should be defined',
    ).toBeDefined();

    const configFileContent = await readFile(configFilePath!, 'utf-8');
    const updatedConfigs: AppConfig[] = JSON.parse(configFileContent);
    const editedConfig = updatedConfigs.find(
        (config) => config.id === initialAppId,
    );

    expect(
        editedConfig,
        `Config file should still contain an entry for ID "${initialAppId}"`,
    ).toBeDefined();
    expect(
        editedConfig?.name,
        `Config entry for ID "${initialAppId}" should have the edited name`,
    ).toBe(editedAppName);
    expect(
        editedConfig?.launchCommand,
        `Config entry for ID "${initialAppId}" should have the edited launch command`,
    ).toBe(editedLaunchCommand);

    // Ensure no config with the old name exists if ID is the primary key
    const configWithOldNameButSameId = updatedConfigs.find(
        (config) =>
            config.name === initialAppName && config.id === initialAppId,
    );
    expect(
        configWithOldNameButSameId,
        `Config file should not contain an entry with the old name "${initialAppName}" for the same ID "${initialAppId}"`,
    ).toBeUndefined();
});
