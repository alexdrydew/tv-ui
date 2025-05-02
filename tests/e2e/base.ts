import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test as base } from '@playwright/test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { globSync } from 'glob';
import type { AppConfig } from '@app/types';
import { platform as nodePlatform } from 'node:process';

process.env.PLAYWRIGHT_TEST = 'true';

type TestFixtures = {
    electronApp: ElectronApplication;
    configFilePath: string;
    setupEnv: Record<string, string>;
    electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
    configFilePath: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            const tempConfigDir = join(tmpdir(), `tv-ui-test-${Date.now()}`);
            const configFilePath = join(tempConfigDir, 'tv-ui.json');
            const configDir = dirname(configFilePath);

            const sampleAppConfig: AppConfig[] = [
                {
                    id: 'test-app-1',
                    name: 'Test App',
                    launchCommand: 'sleep 1',
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
        // eslint-disable-next-line no-empty-pattern
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

        // Increase wait time to allow app initialization, potentially fixing config read issues
        await page.waitForLoadState('load', { timeout: 10000 }); // Increased from default
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(page);
    },

    electronVersions: async ({ electronApp }, use) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(await electronApp.evaluate(() => process.versions));
    },
});

export { test, expect };
export type { TestFixtures, ElectronApplication }; // Export types if needed elsewhere
