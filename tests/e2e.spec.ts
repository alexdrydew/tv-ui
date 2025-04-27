import type { ElectronApplication, JSHandle } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test as base } from '@playwright/test';
import type { BrowserWindow } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { globSync } from 'glob';
import type { AppConfig } from '@app/types';
import { platform as nodePlatform } from 'node:process';
import { pathToFileURL } from 'node:url';
process.env.PLAYWRIGHT_TEST = 'true';

// Minimal valid PNG data (1x1 transparent pixel)
const minimalPngData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

type TestFixtures = {
    electronApp: ElectronApplication;
    configFilePath: string;
    setupEnv: Record<string, string>;
    electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
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
                    // Removed 'args' as it's not part of AppConfig anymore
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
    setupEnv: [
        async ({}, use) => {
            await use({});
        },
        { scope: 'test', auto: true },
    ],
    electronApp: [
        async ({ configFilePath, setupEnv }, use) => {
            let executablePattern = 'dist/*/root{,.*}';
            if (nodePlatform === 'darwin') {
                executablePattern += '/Contents/*/root';
            }

            const [executablePath] = globSync(executablePattern);
            if (!executablePath) {
                throw new Error('App Executable path not found');
            }

            const electronApp = await electron.launch({
                executablePath: executablePath,
                args: ['--no-sandbox'],
                // Pass environment variables from the test fixture's 'options' or defaults
                env: {
                    ...process.env, // Pass existing env vars
                    TV_UI_CONFIG_PATH: configFilePath, // Standard config path
                    ...setupEnv,
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
    // Updated selector to match TvAppLayout structure
    const mainElement = page.locator('main.py-8');

    await expect(
        mainElement,
        'The <main> element from TvAppLayout should be visible',
    ).toBeVisible();
});

test('App tile is rendered when config has an app', async ({ page }) => {
    // Using data-testid for more robust selection
    const appTile = page.getByTestId('app-tile-test-app-1');

    await expect(
        appTile,
        'The AppTile for "Test App" (ID: test-app-1) should be visible',
    ).toBeVisible();
    await expect(appTile).toContainText('Test App');
});

test('Add new app config via UI', async ({ page, configFilePath }) => {
    await page.getByRole('button', { name: 'Add App' }).click();
    const initialDialog = page.getByRole('dialog', { name: 'Add New App' });
    await expect(
        initialDialog,
        'The "Add New App" initial choice dialog should appear',
    ).toBeVisible();

    // Click the "Create Manually" button
    await initialDialog
        .getByRole('button', { name: 'Create Manually' })
        .click();

    // Now expect the manual form dialog
    const manualDialog = page.getByRole('dialog', { name: 'Add App Manually' });
    await expect(
        manualDialog,
        'The "Add App Manually" dialog should appear',
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
        manualDialog,
        'The "Add App Manually" dialog should close after saving',
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

test('Launch app via UI click', async ({ page }) => {
    const appName = 'Test App';
    const appId = 'test-app-1';
    const appTile = page.getByTestId(`app-tile-${appId}`);
    const runningIndicator = appTile.locator(
        '[data-testid="running-indicator"]',
    );

    await expect(
        appTile,
        `The AppTile for "${appName}" should be visible`,
    ).toBeVisible();
    await expect(
        runningIndicator,
        'Running indicator should initially not be visible',
    ).not.toBeVisible();

    // Click to launch
    await appTile.click();

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
    const appId = 'test-app-1';
    const appTile = page.getByTestId(`app-tile-${appId}`);
    const runningIndicator = appTile.locator(
        '[data-testid="running-indicator"]',
    );

    await expect(
        appTile,
        `The AppTile for "${appName}" should be visible`,
    ).toBeVisible();
    await expect(
        runningIndicator,
        'Running indicator should initially not be visible',
    ).not.toBeVisible();

    // Launch the app first
    await appTile.click();
    await expect(
        runningIndicator,
        'Running indicator should be visible after launch',
    ).toBeVisible({ timeout: 2000 });

    await appTile.click({ button: 'right' });
    // The Kill menu item might be within a submenu if multiple instances can run
    // Assuming single instance kill for now
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
        (config) => config.id !== initialAppId,
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

type LinuxTestFixtures = {
    tempDir: string;
    electronApp: ElectronApplication;
    configFilePath: string;
    setupEnv: Record<string, string>;
};

// Test Linux-specific features by mocking the environment
const linuxEnvTest = test.extend<LinuxTestFixtures>({
    tempDir: [
        async ({}, use) => {
            const tempDir = join(tmpdir(), `tv-ui-test-linux-${Date.now()}`);
            await mkdir(tempDir, { recursive: true });
            await use(tempDir);
            await rm(tempDir, { recursive: true, force: true });
        },
        { scope: 'test' },
    ],
    setupEnv: [
        async ({ tempDir }, use) => {
            const xdgDataHome = join(tempDir, 'home', '.local', 'share');
            const xdgDataDirShare = join(tempDir, 'usr', 'share');
            const testConfigPath = join(tempDir, 'test-config.json');

            // Ensure the config directory exists and create an empty config file
            // so the app doesn't crash on startup trying to read/watch it.
            await mkdir(dirname(testConfigPath), { recursive: true });
            await writeFile(testConfigPath, '[]', 'utf-8'); // Create empty config

            await use({
                E2E_TEST_PLATFORM: 'linux', // Force Linux suggestion logic
                XDG_DATA_DIRS: xdgDataDirShare, // Point to temp /usr/share
                XDG_DATA_HOME: xdgDataHome, // Point to temp ~/.local/share
                HOME: join(tempDir, 'home'), // Set HOME for os.homedir() consistency
                TV_UI_CONFIG_PATH: testConfigPath, // Use the created path
            });
        },
        { scope: 'test', auto: true },
    ],
});

linuxEnvTest.describe('Linux Specific Features (Mocked)', () => {
    // Define scenarios for testing icon specification in .desktop files
    const scenarios = [
        { iconSpecifier: 'test-app-icon', testNameSuffix: 'by name' },
        { iconSpecifier: '{{ICON_FILE_PATH}}', testNameSuffix: 'by full path' }, // Placeholder
    ];

    for (const scenario of scenarios) {
        linuxEnvTest(
            `Suggest app from OS shows icon ${scenario.testNameSuffix} from .desktop file`,
            async ({ page, electronApp, setupEnv, tempDir }) => {
                // --- Test Setup ---
                const xdgDataHome = setupEnv['XDG_DATA_HOME'];
                const xdgDataDirShare = setupEnv['XDG_DATA_DIRS'];
                const appDir = join(xdgDataHome, 'applications');
                const iconDir = join(
                    xdgDataDirShare,
                    'icons',
                    'hicolor', // Using a standard theme directory
                    '48x48', // Standard size
                    'apps', // Standard type
                );
                const iconFileName = 'test-app-icon.png'; // Actual icon file
                const iconFilePath = join(iconDir, iconFileName); // Full path to the actual icon file

                // Resolve the placeholder for the full path scenario AFTER iconFilePath is defined
                const iconValueForDesktopFile =
                    scenario.iconSpecifier === '{{ICON_FILE_PATH}}'
                        ? iconFilePath // Use the full path for this scenario
                        : scenario.iconSpecifier; // Use the name ('test-app-icon') for the other

                // Use unique names for desktop file and app to avoid conflicts between test runs
                const uniqueAppName = `Test Icon App ${scenario.testNameSuffix}`;
                const uniqueDesktopFileName = `test-icon-app-${scenario.testNameSuffix.replace(/ /g, '-')}.desktop`;
                const desktopFilePath = join(appDir, uniqueDesktopFileName);
                const desktopFileId = uniqueDesktopFileName.replace(
                    '.desktop',
                    '',
                ); // ID used in testid

                await mkdir(appDir, { recursive: true });
                await mkdir(iconDir, { recursive: true });

                // Create the .desktop file with the correct Icon= value for the current scenario
                const desktopFileContent = `
[Desktop Entry]
Version=1.0
Type=Application
Name=${uniqueAppName}
Exec=/usr/bin/test-icon-app-${scenario.testNameSuffix.replace(/ /g, '-')} %U
Icon=${iconValueForDesktopFile}
Terminal=false
Categories=Utility;
NoDisplay=false
`;
                await writeFile(desktopFilePath, desktopFileContent, 'utf-8');
                // Ensure the actual icon file exists
                await writeFile(iconFilePath, minimalPngData);

                // --- Attach Loggers ---
                electronApp.on('window', async (window) => {
                    // Log console messages from the new window's renderer process
                window.on('console', (msg) => {
                    if (msg.type() === 'error') {
                        console.error(
                            `[testSpecificApp][renderer][${msg.type()}] ${msg.text()}`,
                        );
                    } else {
                        console.log(
                            `[testSpecificApp][renderer][${msg.type()}] ${msg.text()}`,
                        );
                    }
                });
                // Log crashes
                window.on('crash', () => {
                    console.error(
                        '[testSpecificApp][renderer] Renderer crashed',
                    );
                });
                // Log page errors
                window.on('pageerror', (error) => {
                    console.error(
                        `[testSpecificApp][renderer] Page error: ${error}`,
                    );
                });
            });
            electronApp.on('console', (msg) => {
                // Logs from main process
                if (msg.type() === 'error') {
                    console.error(
                        `[testSpecificApp][main][${msg.type()}] ${msg.text()}`,
                    );
                } else {
                    console.log(
                        `[testSpecificApp][main][${msg.type()}] ${msg.text()}`,
                    );
                }
            });

            // --- Page Load ---
            page = await electronApp.firstWindow(); // Reassign page for this specific test run
            if (!page) {
                throw new Error('testSpecificApp failed to open a window.');
            }

            // Wait for the page to load, potentially longer timeout if needed
            try {
                await page.waitForLoadState('load', { timeout: 15000 }); // Increased timeout
                console.log('[testSpecificApp] Page loaded.');
            } catch (e) {
                console.error(
                    '[testSpecificApp] Page load timed out or failed.',
                );
                const screenshotPath = join(
                    tempDir,
                    `page-load-failure-${scenario.testNameSuffix.replace(/ /g, '-')}.png`,
                );
                await page.screenshot({ path: screenshotPath });
                console.error(`Screenshot saved to ${screenshotPath}`);
                throw e;
            }

            // --- UI Navigation ---
            await page.getByRole('button', { name: 'Add App' }).click();
            const initialDialog = page.getByRole('dialog', {
                name: 'Add New App',
            });
            await expect(initialDialog).toBeVisible();
            await initialDialog
                .getByRole('button', { name: 'Select from OS' })
                .click();

            // 4. Verify Suggestion and Icon
            const selectDialog = page.getByRole('dialog', {
                name: 'Select App from System',
            });
            await expect(selectDialog).toBeVisible();

            // Wait for suggestions to load (adjust timeout if needed)
            await expect(
                selectDialog.getByText('Loading suggestions...'),
            ).not.toBeVisible({ timeout: 10000 });

            // Use the unique desktop file ID derived earlier for the testId
            const suggestedAppButton = selectDialog.getByTestId(
                `suggested-app-${desktopFileId}`,
            );
            await expect(
                suggestedAppButton,
                `Suggested app button for ${uniqueAppName} should be visible`,
            ).toBeVisible();
            // Check for the unique name
            await expect(
                suggestedAppButton,
                `Suggested app button should contain text "${uniqueAppName}"`,
            ).toContainText(uniqueAppName);

            const iconImage = suggestedAppButton.locator('img');
            await expect(
                iconImage,
                `Icon image within button for ${uniqueAppName} should be visible`,
            ).toBeVisible();

            // IMPORTANT: Both scenarios should resolve to the *actual* icon file path's URL
            const expectedIconSrc = pathToFileURL(iconFilePath).toString();
            await expect(
                iconImage,
                `Icon image src should be "${expectedIconSrc}" for scenario "${scenario.testNameSuffix}"`,
            ).toHaveAttribute('src', expectedIconSrc);
        },
    );
    } // End of loop for scenarios
});
