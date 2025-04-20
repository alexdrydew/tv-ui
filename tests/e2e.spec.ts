import type { ElectronApplication, JSHandle } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test as base } from '@playwright/test';
import type { BrowserWindow } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'; // Import readFile
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { globSync } from 'glob';
import type { AppConfig } from '@app/types'; // Import AppConfig
import { platform } from 'node:process';
process.env.PLAYWRIGHT_TEST = 'true';

type TestFixtures = {
    electronApp: ElectronApplication;
    configFilePath: string; // Add configFilePath here
    electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
    electronApp: [ // This fixture now provides both electronApp and configFilePath
        async ({}, use) => {
            let executablePattern = 'dist/*/root{,.*}';
            if (platform === 'darwin') {
                executablePattern += '/Contents/*/root';
            }

            const [executablePath] = globSync(executablePattern);
            if (!executablePath) {
                throw new Error('App Executable path not found');
            }

            const tempConfigDir = join(tmpdir(), `tv-ui-test-${Date.now()}`);
            const configFilePath = join(tempConfigDir, 'tv-ui.json');
            const configDir = dirname(configFilePath); // Should be tempConfigDir

            const sampleAppConfig = [
                {
                    id: 'test-app-1',
                    name: 'Test App',
                    launchCommand: '/bin/echo',
                    args: ['hello'],
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
            // Pass both the app and the path to the test context
            await use({ electronApp, configFilePath });

            await electronApp.close();

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
        { scope: 'worker', auto: true, provides: ['electronApp', 'configFilePath'] } as any, // Declare provided fixtures
    ],

    page: async ({ electronApp }, use) => { // page fixture remains the same
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

// Destructure configFilePath from the fixture context
test('Add new app config via UI', async ({ page, configFilePath }) => {
    // Click the "Add App" button
    await page.getByRole('button', { name: 'Add App' }).click();

    // Wait for the dialog to appear and locate it
    const dialog = page.getByRole('dialog', { name: 'Add New App' });
    await expect(
        dialog,
        'The "Add New App" dialog should appear',
    ).toBeVisible();

    // Fill in the form
    const appName = 'My New Test App';
    const launchCommand = '/bin/true';
    await dialog.getByLabel('App Name').fill(appName);
    await dialog.getByLabel('Launch Command').fill(launchCommand);

    // Click the "Save App" button
    await dialog.getByRole('button', { name: 'Save App' }).click();

    // Wait for the dialog to close
    await expect(
        dialog,
        'The "Add New App" dialog should close after saving',
    ).not.toBeVisible();

    // *** Start: Verify config file update ***
    // Use configFilePath directly from the fixture context
    expect(
        configFilePath,
        'configFilePath from fixture should be defined',
    ).toBeDefined();

    // Read the updated config file
    const configFileContent = await readFile(configFilePath!, 'utf-8');
    const updatedConfigs: AppConfig[] = JSON.parse(configFileContent);

    // Find the newly added config
    const addedConfig = updatedConfigs.find((config) => config.name === appName);

    // Assert that the config was added correctly
    expect(
        addedConfig,
        `Config file should contain an entry for "${appName}"`,
    ).toBeDefined();
    expect(
        addedConfig?.launchCommand,
        `Config entry for "${appName}" should have the correct launch command`,
    ).toBe(launchCommand);
    // *** End: Verify config file update ***

    // Verify the new app tile is visible (this part might still fail)
    const newAppTile = page.getByRole('button', { name: appName });
    await expect(
        newAppTile,
        `The AppTile for "${appName}" should be visible after adding`,
    ).toBeVisible(); // This is expected to fail until UI updates are fixed
});
