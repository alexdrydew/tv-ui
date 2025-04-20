import type { ElectronApplication, JSHandle } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test as base } from '@playwright/test';
import type { BrowserWindow } from 'electron';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path'; // Import join
import { tmpdir } from 'node:os'; // Import tmpdir
import { globSync } from 'glob';
import { platform } from 'node:process';

process.env.PLAYWRIGHT_TEST = 'true';

// Declare the types of your fixtures.
type TestFixtures = {
    electronApp: ElectronApplication;
    electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
    electronApp: [
        async ({}, use) => {
            /**
             * Executable path depends on root package name!
             */
            let executablePattern = 'dist/*/root{,.*}';
            if (platform === 'darwin') {
                executablePattern += '/Contents/*/root';
            }

            const [executablePath] = globSync(executablePattern);
            if (!executablePath) {
                throw new Error('App Executable path not found');
            }

            // Generate a temporary path for the config file
            const tempConfigDir = join(tmpdir(), `tv-ui-test-${Date.now()}`);
            const configFilePath = join(tempConfigDir, 'tv-ui.json');
            const configDir = dirname(configFilePath); // Should be tempConfigDir

            // Define a sample app config
            const sampleAppConfig = [
                {
                    id: 'test-app-1',
                    name: 'Test App', // Name used for locating the tile
                    command: '/bin/echo', // Example command
                    args: ['hello'],
                    icon: null,
                },
            ];

            try {
                await mkdir(configDir, { recursive: true });
                // Write the sample config to the file
                await writeFile(
                    configFilePath,
                    JSON.stringify(sampleAppConfig, null, 2), // Pretty print for readability if needed
                    'utf-8',
                );
                console.log(
                    `Created config file with sample app: ${configFilePath}`,
                );
            } catch (err) {
                console.error(`Failed to create config file: ${err}`);
                // Decide if we should throw or proceed cautiously
                throw new Error(
                    `Setup failed: Could not create config file at ${configFilePath}`,
                );
            }

            // Launch the app, setting the environment variable
            const electronApp = await electron.launch({
                executablePath: executablePath,
                args: ['--no-sandbox'],
                env: {
                    ...process.env, // Pass existing env vars
                    TV_UI_CONFIG_PATH: configFilePath, // Set our config path var
                },
            });

            electronApp.on('console', (msg) => {
                if (msg.type() === 'error') {
                    console.error(`[electron][${msg.type()}] ${msg.text()}`);
                }
            });

            await use(electronApp);

            // This code runs after all the tests in the worker process.
            await electronApp.close();

            // Clean up the temporary directory and config file
            try {
                // Use the tempConfigDir path generated earlier
                await rm(tempConfigDir, { recursive: true, force: true });
                console.log(`Cleaned up temporary config dir: ${tempConfigDir}`);
            } catch (err) {
                // Log error but don't fail the test run just for cleanup failure
                console.error(
                    `Failed to clean up temporary config dir: ${err}`,
                );
            }
        },
        { scope: 'worker', auto: true } as any,
    ],

    page: async ({ electronApp }, use) => {
        const page = await electronApp.firstWindow();
        // capture errors
        page.on('pageerror', (error) => {
            console.error(error);
        });
        // capture console messages
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
                /**
                 * The main window is created hidden, and is shown only when it is ready.
                 * See {@link ../packages/main/src/mainWindow.ts} function
                 */
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
    // TvAppLayout renders a <main> element with class "overflow-auto"
    const mainElement = page.locator('main.overflow-auto');

    // Now that we know it has appeared, we can assert its visibility (optional, but good practice)
    await expect(
        mainElement,
        'The <main> element from TvAppLayout should be visible',
    ).toBeVisible();
});

test('App tile is rendered when config has an app', async ({ page }) => {
    // Locate the AppTile button using its role and the name defined in the sample config
    const appTileButton = page.getByRole('button', { name: 'Test App' });

    // Assert that the AppTile button is visible
    await expect(
        appTileButton,
        'The AppTile for "Test App" should be visible',
    ).toBeVisible();
});
