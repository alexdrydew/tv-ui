import type { ElectronApplication, JSHandle } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test as base } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { globSync } from 'glob';
import type { AppConfig, LauncherConfig } from '@app/types';
import { platform as nodePlatform } from 'node:process';

type TestFixtures = {
    electronApp: ElectronApplication;
    configFilePath: string;
    launcherConfigFilePath: string;
    initialApps: AppConfig[][];
    initialLauncherConfig: LauncherConfig;
    setupEnv: Record<string, string>;
    electronVersions: NodeJS.ProcessVersions;
    browserWindow: JSHandle<Electron.BrowserWindow>;
};

const test = base.extend<TestFixtures>({
    initialApps: [[]],
    initialLauncherConfig: [{ toggleAppKeyCode: 'HOME' }],
    configFilePath: [
        async ({ initialApps }, use) => {
            const tempConfigDir = join(tmpdir(), `tv-ui-test-${Date.now()}`);
            const configFilePath = join(tempConfigDir, 'tv-ui.json');
            const configDir = dirname(configFilePath);

            try {
                await mkdir(configDir, { recursive: true });
                await writeFile(
                    configFilePath,
                    JSON.stringify(initialApps[0], null, 2),
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
    launcherConfigFilePath: [
        async ({ initialLauncherConfig }, use) => {
            const tempConfigDir = join(
                tmpdir(),
                `tv-ui-launcher-test-${Date.now()}`,
            );
            const launcherConfigFilePath = join(tempConfigDir, 'launcher.json');
            const configDir = dirname(launcherConfigFilePath);

            try {
                await mkdir(configDir, { recursive: true });
                await writeFile(
                    launcherConfigFilePath,
                    JSON.stringify(initialLauncherConfig[0], null, 2),
                    'utf-8',
                );
                console.log(
                    `Created launcher config file: ${launcherConfigFilePath}`,
                );
            } catch (err) {
                console.error(`Failed to create launcher config file: ${err}`);
                throw new Error(
                    `Setup failed: Could not create launcher config file at ${launcherConfigFilePath}`,
                );
            }
            await use(launcherConfigFilePath);

            try {
                await rm(tempConfigDir, { recursive: true, force: true });
                console.log(
                    `Cleaned up temporary launcher config dir: ${tempConfigDir}`,
                );
            } catch (err) {
                console.error(
                    `Failed to clean up temporary launcher config dir: ${err}`,
                );
            }
        },
        { scope: 'test', auto: true },
    ],
    setupEnv: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            await use({});
        },
        { scope: 'test', auto: true },
    ],
    electronApp: [
        async ({ configFilePath, launcherConfigFilePath, setupEnv }, use) => {
            let executablePath: string | undefined = undefined;
            let baseArgs: string[] = [];

            if (process.env['E2E_TEST_COMPILED'] === 'true') {
                let executablePattern = 'dist/*/root{,.*}';
                if (nodePlatform === 'darwin') {
                    executablePattern += '/Contents/*/root';
                } else if (nodePlatform === 'win32') {
                    executablePattern = 'dist/*/*.exe'; // Adjust for Windows if needed
                } else {
                    executablePattern = 'dist/*/root'; // Default for Linux
                }

                [executablePath] = globSync(executablePattern);
                if (!executablePath) {
                    throw new Error(
                        `App Executable path not found using pattern: ${executablePattern}`,
                    );
                }
                console.log(`Found compiled executable at: ${executablePath}`);
            } else {
                baseArgs = ['packages/entry-point.mjs'];
            }

            const electronApp = await electron.launch({
                executablePath: executablePath,
                args: baseArgs.concat(['--no-sandbox']),
                env: {
                    ...process.env, // Pass existing env vars
                    TV_UI_CONFIG_PATH: configFilePath, // Standard config path
                    TV_UI_LAUNCHER_CONFIG_PATH: launcherConfigFilePath, // Launcher config path
                    ...setupEnv,
                    PLAYWRIGHT_TEST: 'true',
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

        // Increase wait time to allow app initialization, potentially fixing config read issues
        await page.waitForLoadState('load', { timeout: 10000 }); // Increased from default
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(page);
    },

    browserWindow: async ({ electronApp, page }, use) => {
        const bwHandle = await electronApp.browserWindow(page);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(bwHandle);
    },

    electronVersions: async ({ electronApp }, use) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(await electronApp.evaluate(() => process.versions));
    },
});

export { test, expect };
export type { TestFixtures, ElectronApplication }; // Export types if needed elsewhere
