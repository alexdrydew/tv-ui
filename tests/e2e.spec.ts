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
// Remove pathToFileURL import as it's no longer needed for the assertion
// import { pathToFileURL } from 'node:url';
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
            } else if (nodePlatform === 'win32') {
                executablePattern = 'dist/*/*.exe'; // Adjust for Windows if needed
            } else {
                executablePattern = 'dist/*/root'; // Default for Linux
            }

            const [executablePath] = globSync(executablePattern);
            if (!executablePath) {
                throw new Error(
                    `App Executable path not found using pattern: ${executablePattern}`,
                );
            }
            console.log(`Found executable at: ${executablePath}`);

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
                const type = msg.type();
                const text = msg.text();
                // Filter out noisy DevTools warnings unless it's an error
                if (type === 'error' || !text.includes('DevTools')) {
                    console.error(`[electron][${type}] ${text}`);
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
            console.error(`[renderer][pageerror] ${error}`);
        });
        page.on('console', (msg) => {
            const type = msg.type();
            const text = msg.text();
            // Filter out noisy DevTools warnings unless it's an error
            if (type === 'error' || !text.includes('DevTools')) {
                console.log(`[renderer][${type}] ${text}`);
            }
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
    ).toBeVisible({ timeout: 2000 }); // Increased timeout slightly

    // Verify the indicator disappears after the 'sleep 1' command finishes
    await expect(
        runningIndicator,
        'Running indicator should disappear after app exits naturally',
    ).not.toBeVisible({ timeout: 3000 }); // Allow extra time for sleep + processing
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
    ).toBeVisible({ timeout: 2000 }); // Increased timeout slightly

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
    ).not.toBeVisible({ timeout: 2000 }); // Increased timeout slightly
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
    // Helper function to create a .desktop file
    const createDesktopFile = async (
        appDir: string,
        appName: string,
        desktopFileName: string,
        iconValue: string,
    ) => {
        const desktopFilePath = join(appDir, desktopFileName);
        const desktopFileContent = `
[Desktop Entry]
Version=1.0
Type=Application
Name=${appName}
Exec=/usr/bin/${desktopFileName.replace('.desktop', '')} %U
Icon=${iconValue}
Terminal=false
Categories=Utility;
NoDisplay=false
`;
        await writeFile(desktopFilePath, desktopFileContent, 'utf-8');
    };

    // Helper function to create an icon file and theme index
    const createIconFile = async (
        iconDir: string,
        iconFileName: string,
        iconFilePath: string,
    ) => {
        await mkdir(iconDir, { recursive: true });
        const themeBaseDir = dirname(dirname(iconDir)); // .../icons/hicolor
        const indexThemePath = join(themeBaseDir, 'index.theme');
        const indexThemeContent = `
[Icon Theme]
Name=Hicolor
Comment=Fallback theme for icons
Directories=48x48/apps

[48x48/apps]
Size=48
Context=Applications
Type=Scalable
`;
        // Write index.theme only if it doesn't exist to avoid race conditions in parallel tests
        try {
            await readFile(indexThemePath);
        } catch {
            await writeFile(indexThemePath, indexThemeContent, 'utf-8');
        }
        await writeFile(iconFilePath, minimalPngData);
    };

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
                    'hicolor',
                    '48x48',
                    'apps',
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

                await mkdir(appDir, { recursive: true });
                await createIconFile(iconDir, iconFileName, iconFilePath);
                await createDesktopFile(
                    appDir,
                    uniqueAppName,
                    uniqueDesktopFileName,
                    iconValueForDesktopFile,
                );

                // --- Attach Loggers ---
                // Note: Loggers are attached in the fixture now, no need to repeat here unless debugging specific window events

                // --- Page Load ---
                // Reassign page if necessary (though fixture should handle it)
                page = await electronApp.firstWindow();
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
                ).not.toBeVisible({ timeout: 10000 }); // Increased timeout for suggestion loading

                // Locate the button by its role and the text it contains
                // Use exact match or regex for text to avoid strict mode violation
                const suggestedAppButton = selectDialog
                    .getByRole('button')
                    .filter({ hasText: new RegExp(`^${uniqueAppName}$`) }); // Use regex for exact match

                await expect(
                    suggestedAppButton,
                    `Suggested app button for ${uniqueAppName} should be visible`,
                ).toBeVisible();
                // Check for the unique name
                await expect(
                    suggestedAppButton,
                    `Suggested app button should contain text "${uniqueAppName}"`,
                ).toContainText(uniqueAppName); // containText is fine here after filtering

                const iconImage = suggestedAppButton.locator('img');
                await expect(
                    iconImage,
                    `Icon image within button for ${uniqueAppName} should be visible`,
                ).toBeVisible({ timeout: 5000 });

                // --- Updated Assertion ---
                // Both scenarios should now result in a data URL.
                // We check if the src attribute starts with the expected prefix.
                const expectedIconSrcPrefix = 'data:image/png;base64,';
                await expect(
                    iconImage,
                    `Icon image src should start with "${expectedIconSrcPrefix}" for scenario "${scenario.testNameSuffix}"`,
                ).toHaveAttribute(
                    'src',
                    new RegExp(`^${expectedIconSrcPrefix}`),
                );

                // Optional: Check that the src is not *just* the prefix (i.e., it has content)
                const actualSrc = await iconImage.getAttribute('src');
                expect(
                    actualSrc?.length ?? 0,
                    'Icon data URL should have content',
                ).toBeGreaterThan(expectedIconSrcPrefix.length);
            },
        );
    } // End of loop for scenarios

    linuxEnvTest(
        'Suggest app from OS pagination works correctly',
        async ({ page, electronApp, setupEnv }) => {
            // --- Test Setup ---
            const xdgDataHome = setupEnv['XDG_DATA_HOME'];
            const appDir = join(xdgDataHome, 'applications');
            await mkdir(appDir, { recursive: true });

            const totalApps = 20; // More than ITEMS_PER_PAGE (16)
            const appBaseName = 'Paginated App';
            const desktopFileBaseName = 'paginated-app';
            const iconValue = 'application-default-icon'; // Use a generic icon name

            // Create desktop files
            for (let i = 1; i <= totalApps; i++) {
                const appName = `${appBaseName} ${i}`;
                const desktopFileName = `${desktopFileBaseName}-${i}.desktop`;
                await createDesktopFile(
                    appDir,
                    appName,
                    desktopFileName,
                    iconValue,
                );
            }

            // --- Page Load & Navigation ---
            page = await electronApp.firstWindow();
            await page.waitForLoadState('load', { timeout: 15000 });
            await page.getByRole('button', { name: 'Add App' }).click();
            const initialDialog = page.getByRole('dialog', {
                name: 'Add New App',
            });
            await expect(initialDialog).toBeVisible();
            await initialDialog
                .getByRole('button', { name: 'Select from OS' })
                .click();

            // --- Verify Dialog and Loading ---
            const selectDialog = page.getByRole('dialog', {
                name: 'Select App from System',
            });
            await expect(selectDialog).toBeVisible();
            await expect(
                selectDialog.getByText('Loading suggestions...'),
            ).not.toBeVisible({ timeout: 10000 });

            // --- Pagination Verification ---
            const pagination = selectDialog.locator('[data-slot="pagination"]');
            const prevButton = pagination.locator(
                'a[aria-label="Go to previous page"]',
            );
            const nextButton = pagination.locator(
                'a[aria-label="Go to next page"]',
            );
            const page1Link = pagination.locator(
                'a[data-slot="pagination-link"]',
                { hasText: '1' },
            );
            const page2Link = pagination.locator(
                'a[data-slot="pagination-link"]',
                { hasText: '2' },
            );

            // Check initial state (Page 1)
            await expect(
                pagination,
                'Pagination controls should be visible',
            ).toBeVisible();
            // Use aria-disabled for state checking
            await expect(
                prevButton,
                'Previous button should have aria-disabled="true"',
            ).toHaveAttribute('aria-disabled', 'true');
            await expect(
                nextButton,
                'Next button should not have aria-disabled="true"',
            ).not.toHaveAttribute('aria-disabled', 'true');
            // Active state check remains the same
            await expect(
                page1Link,
                'Page 1 link should be marked as active',
            ).toHaveAttribute('aria-current', 'page');
            await expect(
                page2Link,
                'Page 2 link should not be marked as active',
            ).not.toHaveAttribute('aria-current', 'page');

            // Verify apps on Page 1 (Use regex for exact match)
            const app1Button = selectDialog
                .getByRole('button')
                .filter({ hasText: new RegExp(`^${appBaseName} 1$`) });
            const app16Button = selectDialog
                .getByRole('button')
                .filter({ hasText: new RegExp(`^${appBaseName} 16$`) });
            const app17Button = selectDialog
                .getByRole('button')
                .filter({ hasText: new RegExp(`^${appBaseName} 17$`) });

            await expect(
                app1Button,
                'App 1 should be visible on page 1',
            ).toBeVisible();
            await expect(
                app16Button,
                'App 16 should be visible on page 1',
            ).toBeVisible();
            await expect(
                app17Button,
                'App 17 should NOT be visible on page 1',
            ).not.toBeVisible();

            // Click Next button
            await nextButton.click();

            // Check state on Page 2
            // Use aria-disabled for state checking
            await expect(
                prevButton,
                'Previous button should not have aria-disabled="true" on page 2',
            ).not.toHaveAttribute('aria-disabled', 'true');
            await expect(
                nextButton,
                'Next button should have aria-disabled="true" on page 2',
            ).toHaveAttribute('aria-disabled', 'true');
            // Active state check remains the same
            await expect(
                page1Link,
                'Page 1 link should not be active on page 2',
            ).not.toHaveAttribute('aria-current', 'page');
            await expect(
                page2Link,
                'Page 2 link should be active on page 2',
            ).toHaveAttribute('aria-current', 'page');

            // Verify apps on Page 2 (Use regex for exact match)
            await expect(
                app1Button,
                'App 1 should NOT be visible on page 2',
            ).not.toBeVisible();
            await expect(
                app16Button,
                'App 16 should NOT be visible on page 2',
            ).not.toBeVisible();
            await expect(
                app17Button, // Re-use locator from above
                'App 17 should be visible on page 2',
            ).toBeVisible();
            const app20Button = selectDialog
                .getByRole('button')
                .filter({ hasText: new RegExp(`^${appBaseName} 20$`) });
            await expect(
                app20Button,
                'App 20 should be visible on page 2',
            ).toBeVisible();

            // Click Previous button
            await prevButton.click();

            // Check state back on Page 1
            // Use aria-disabled for state checking
            await expect(
                prevButton,
                'Previous button should be disabled again on page 1',
            ).toHaveAttribute('aria-disabled', 'true');
            await expect(
                nextButton,
                'Next button should be enabled again on page 1',
            ).not.toHaveAttribute('aria-disabled', 'true');
            // Active state check remains the same
            await expect(
                page1Link,
                'Page 1 link should be active again',
            ).toHaveAttribute('aria-current', 'page');
            await expect(
                page2Link,
                'Page 2 link should not be active again',
            ).not.toHaveAttribute('aria-current', 'page');

            // Verify apps back on Page 1 (Use regex for exact match)
            await expect(
                app1Button, // Re-use locator
                'App 1 should be visible again on page 1',
            ).toBeVisible();
            await expect(
                app17Button, // Re-use locator
                'App 17 should NOT be visible again on page 1',
            ).not.toBeVisible();

            // Click Page 2 link directly
            await page2Link.click();

            // Verify apps on Page 2 again (Use regex for exact match)
            await expect(
                app1Button, // Re-use locator
                'App 1 should NOT be visible after clicking page 2 link',
            ).not.toBeVisible();
            await expect(
                app17Button, // Re-use locator
                'App 17 should be visible after clicking page 2 link',
            ).toBeVisible();
            await expect(
                page2Link,
                'Page 2 link should be active after clicking it',
            ).toHaveAttribute('aria-current', 'page');
        },
    );
}); // End of Linux Specific Features describe block
