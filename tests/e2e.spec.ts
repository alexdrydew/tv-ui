import type { ElectronApplication, JSHandle } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test as base } from '@playwright/test';
import type { BrowserWindow } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { globSync } from 'glob';
import type { AppConfig } from '@app/types';
import { platform } from 'node:process';
process.env.PLAYWRIGHT_TEST = 'true';

type TestFixtures = {
    electronApp: ElectronApplication;
    configFilePath: string;
    electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
    // New fixture for config file path setup and teardown
    configFilePath: [
        async ({}, use) => {
            const tempConfigDir = join(tmpdir(), `tv-ui-test-${Date.now()}`);
            const configFilePath = join(tempConfigDir, 'tv-ui.json');
            const configDir = dirname(configFilePath);

            const sampleAppConfig: AppConfig[] = [
                {
                    id: 'test-app-1',
                    name: 'Test App',
                    launchCommand: 'sleep 1',
                    args: [],
                    icon: undefined,
                },
            ];

            try {
                await mkdir(configDir, { recursive: true });
                await writeFile(
                    configFilePath,
                    JSON.stringify(sampleAppConfig, null, 2),
                    'utf-8',
                );
                console.log(
                    `Created config file with sample app: ${configFilePath}`,
                );
            } catch (err) {
                console.error(`Failed to create config file: ${err}`);
                throw new Error(
                    `Setup failed: Could not create config file at ${configFilePath}`,
                );
            }
            await use(configFilePath);

            try {
                await rm(tempConfigDir, { recursive: true, force: true });
                console.log(
                    `Cleaned up temporary config dir: ${tempConfigDir}`,
                );
            } catch (err) {
                console.error(
                    `Failed to clean up temporary config dir: ${err}`,
                );
            }
        },
        { scope: 'test', auto: true },
    ],
    electronApp: [
        async ({ configFilePath }, use) => {
            let executablePattern = 'dist/*/root{,.*}';
            if (platform === 'darwin') {
                executablePattern += '/Contents/*/root';
            }

            const [executablePath] = globSync(executablePattern);
            if (!executablePath) {
                throw new Error('App Executable path not found');
            }

            const electronApp = await electron.launch({
                executablePath: executablePath,
                args: ['--no-sandbox'],
                env: {
                    ...process.env,
                    TV_UI_CONFIG_PATH: configFilePath,
                },
            });

            electronApp.on('console', (msg) => {
                if (msg.type() === 'error') {
                    console.error(`[electron][${msg.type()}] ${msg.text()}`);
                }
            });

            await use(electronApp);

            await electronApp.close();
        },
        { scope: 'test', auto: true },
    ],

    page: async ({ electronApp }, use) => {
        const page = await electronApp.firstWindow();
        page.on('pageerror', (error) => {
            console.error(error);
        });
        page.on('console', (msg) => {
            console.log(msg.text());
        });

        await page.waitForLoadState('load');
        await use(page);
    },

    electronVersions: async ({ electronApp }, use) => {
        await use(await electronApp.evaluate(() => process.versions));
    },
});

test('Main window state', async ({ electronApp, page }) => {
    const window: JSHandle<BrowserWindow> =
        await electronApp.browserWindow(page);
    const windowState = await window.evaluate(
        (
            mainWindow,
        ): Promise<{
            isVisible: boolean;
            isDevToolsOpened: boolean;
            isCrashed: boolean;
        }> => {
            const getState = () => ({
                isVisible: mainWindow.isVisible(),
                isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
                isCrashed: mainWindow.webContents.isCrashed(),
            });

            return new Promise((resolve) => {
                if (mainWindow.isVisible()) {
                    resolve(getState());
                } else {
                    mainWindow.once('ready-to-show', () => resolve(getState()));
                }
            });
        },
    );

    expect(windowState.isCrashed, 'The app has crashed').toEqual(false);
    expect(windowState.isVisible, 'The main window was not visible').toEqual(
        true,
    );
    expect(windowState.isDevToolsOpened, 'The DevTools panel was open').toEqual(
        false,
    );
});

test('App layout is rendered', async ({ page }) => {
    const mainElement = page.locator('main.overflow-auto');

    await expect(
        mainElement,
        'The <main> element from TvAppLayout should be visible',
    ).toBeVisible();
});

test('App tile is rendered when config has an app', async ({ page }) => {
    const appTileButton = page.getByRole('button', { name: 'Test App' });

    await expect(
        appTileButton,
        'The AppTile for "Test App" should be visible',
    ).toBeVisible();
});

test('Add new app config via UI', async ({ page, configFilePath }) => {
    await page.getByRole('button', { name: 'Add App' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add New App' });
    await expect(
        dialog,
        'The "Add New App" dialog should appear',
    ).toBeVisible();

    // Fill in the form
    const appName = 'My New Test App';
    const launchCommand = '/bin/true'; // Use a command that exits quickly for this test
    await dialog.getByLabel('App Name').fill(appName);
    await dialog.getByLabel('Launch Command').fill(launchCommand);

    // Click the "Save App" button
    await dialog.getByRole('button', { name: 'Save App' }).click();

    // Wait for the dialog to close
    await expect(
        dialog,
        'The "Add New App" dialog should close after saving',
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

    // Verify the new app tile is visible
    const newAppTile = page.getByRole('button', { name: appName });
    await expect(
        newAppTile,
        `The AppTile for "${appName}" should be visible after adding`,
    ).toBeVisible();
});

test('Delete app config via context menu', async ({ page, configFilePath }) => {
    const appNameToDelete = 'Test App';
    const appTileButton = page.getByRole('button', { name: appNameToDelete });

    await expect(
        appTileButton,
        `The AppTile for "${appNameToDelete}" should initially be visible`,
    ).toBeVisible();

    // Ensure the app is not running before trying to delete
    const runningIndicator = appTileButton.locator(
        '[data-testid="running-indicator"]',
    );
    await expect(
        runningIndicator,
        'Running indicator should not be visible before delete',
    ).not.toBeVisible({ timeout: 1000 });

    await appTileButton.click({ button: 'right' });
    const deleteMenuItem = page.getByRole('menuitem', { name: 'Delete app' });
    await expect(
        deleteMenuItem,
        'The "Delete app" context menu item should be visible',
    ).toBeVisible();
    await deleteMenuItem.click();
    await expect(
        appTileButton,
        `The AppTile for "${appNameToDelete}" should not be visible after deletion`,
    ).not.toBeVisible();
    expect(
        configFilePath,
        'configFilePath from fixture should be defined',
    ).toBeDefined();

    const configFileContent = await readFile(configFilePath!, 'utf-8');
    const updatedConfigs: AppConfig[] = JSON.parse(configFileContent);

    const deletedConfig = updatedConfigs.find(
        (config) => config.name === appNameToDelete,
    );

    expect(
        deletedConfig,
        `Config file should no longer contain an entry for "${appNameToDelete}"`,
    ).toBeUndefined();
});

test('Edit app config via context menu', async ({ page, configFilePath }) => {
    const initialAppName = 'Test App';
    const initialAppId = 'test-app-1';
    const editedAppName = 'Edited Test App';
    const editedLaunchCommand = '/bin/false'; // Use a command that exits quickly

    const appTileButton = page.getByRole('button', { name: initialAppName });

    await expect(
        appTileButton,
        `The AppTile for "${initialAppName}" should initially be visible`,
    ).toBeVisible();

    // Ensure the app is not running before trying to edit
    const runningIndicator = appTileButton.locator(
        '[data-testid="running-indicator"]',
    );
    await expect(
        runningIndicator,
        'Running indicator should not be visible before edit',
    ).not.toBeVisible({ timeout: 1000 });

    await appTileButton.click({ button: 'right' });
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
    ).toHaveValue('sleep 1');
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

    // Ensure no config with the old name exists
    const configWithOldName = updatedConfigs.find(
        (config) => config.name === initialAppName,
    );
    expect(
        configWithOldName,
        `Config file should not contain an entry with the old name "${initialAppName}"`,
    ).toBeUndefined();
});

test('Launch app via UI click', async ({ page }) => {
    const appName = 'Test App';
    const appTileButton = page.getByRole('button', { name: appName });
    const runningIndicator = appTileButton.locator(
        '[data-testid="running-indicator"]',
    );

    await expect(
        appTileButton,
        `The AppTile for "${appName}" should be visible`,
    ).toBeVisible();
    await expect(
        runningIndicator,
        'Running indicator should initially not be visible',
    ).not.toBeVisible();

    // Click to launch
    await appTileButton.click();

    // Verify the running indicator appears
    await expect(
        runningIndicator,
        'Running indicator should become visible after launch',
    ).toBeVisible({ timeout: 2000 });

    await expect(
        runningIndicator,
        'Running indicator should disappear after app exits naturally',
    ).not.toBeVisible({ timeout: 2000 });
});

test('Kill running app via context menu', async ({ page }) => {
    const appName = 'Test App';
    const appTileButton = page.getByRole('button', { name: appName });
    const runningIndicator = appTileButton.locator(
        '[data-testid="running-indicator"]',
    );

    await expect(
        appTileButton,
        `The AppTile for "${appName}" should be visible`,
    ).toBeVisible();
    await expect(
        runningIndicator,
        'Running indicator should initially not be visible',
    ).not.toBeVisible();

    // Launch the app first
    await appTileButton.click();
    await expect(
        runningIndicator,
        'Running indicator should be visible after launch',
    ).toBeVisible({ timeout: 2000 });

    await appTileButton.click({ button: 'right' });
    const killMenuItem = page.getByRole('menuitem', { name: 'Kill' });
    await expect(
        killMenuItem,
        'The "Kill" context menu item should be visible',
    ).toBeVisible();

    // Click Kill
    await killMenuItem.click();

    // Verify the running indicator disappears quickly after killing
    await expect(
        runningIndicator,
        'Running indicator should disappear after killing',
    ).not.toBeVisible({ timeout: 2000 });
});

test('Config file watcher updates UI on external change', async ({
    page,
    configFilePath,
}) => {
    const initialAppName = 'Test App';
    const newAppName = 'Watcher App';
    const newAppId = 'watcher-test-app';
    const newAppCommand = '/bin/echo Watcher Test';

    const initialAppTile = page.getByRole('button', { name: initialAppName });
    const newAppTile = page.getByRole('button', { name: newAppName });

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
        args: [],
    };
    const updatedConfigs = [...currentConfigs, newConfig];

    await page.waitForTimeout(500);

    await writeFile(
        configFilePath!,
        JSON.stringify(updatedConfigs, null, 2),
        'utf-8',
    );
    console.log(`Updated config file externally: ${configFilePath}`);

    await expect(
        newAppTile,
        `New app "${newAppName}" should become visible after config file change`,
    ).toBeVisible({ timeout: 5000 });

    const configsWithoutInitial = updatedConfigs.filter(
        (config) => config.name !== initialAppName,
    );
    await page.waitForTimeout(500);
    await writeFile(
        configFilePath!,
        JSON.stringify(configsWithoutInitial, null, 2),
        'utf-8',
    );
    console.log(`Removed initial app from config file: ${configFilePath}`);

    await expect(
        initialAppTile,
        `Locator for initial app "${initialAppName}" should find 0 elements after removal`,
    ).toHaveCount(0, { timeout: 5000 });

    await expect(
        newAppTile,
        `New app "${newAppName}" should still be visible after initial app removal`,
    ).toBeVisible();
});
