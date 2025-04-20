import type { ElectronApplication, JSHandle } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test as base } from '@playwright/test';
import type { BrowserWindow } from 'electron';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { globSync } from 'glob';
import { platform } from 'node:process';
process.env.PLAYWRIGHT_TEST = 'true';

type TestFixtures = {
    electronApp: ElectronApplication;
    electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
    electronApp: [
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
            await use(electronApp);

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
        { scope: 'worker', auto: true } as any,
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
