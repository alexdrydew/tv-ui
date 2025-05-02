import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test, expect, type ElectronApplication } from './base.js';

import { MINIMAL_PNG_DATA, MINIMAL_SVG_DATA, SINGLE_APP } from './data.js';

test.use({ initialApps: SINGLE_APP });

type LinuxTestFixtures = {
    tempDir: string;
    electronApp: ElectronApplication; // Inherited, but redefined for clarity?
    configFilePath: string; // Inherited
    setupEnv: Record<string, string>; // Inherited, but overridden
};

// Test Linux-specific features by mocking the environment
const linuxEnvTest = test.extend<LinuxTestFixtures>({
    tempDir: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            const tempDir = join(tmpdir(), `tv-ui-test-linux-${Date.now()}`);
            await mkdir(tempDir, { recursive: true });
            await use(tempDir);
            await rm(tempDir, { recursive: true, force: true });
        },
        { scope: 'test' },
    ],
    // Override setupEnv from base.ts specifically for Linux tests
    setupEnv: [
        async ({ tempDir }, use) => {
            // Correctly use tempDir here
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
    // electronApp fixture is inherited and re-uses the overridden setupEnv
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
        // Write PNG or SVG based on file extension
        if (iconFilePath.endsWith('.svg')) {
            await writeFile(iconFilePath, MINIMAL_SVG_DATA, 'utf-8');
        } else {
            await writeFile(iconFilePath, MINIMAL_PNG_DATA);
        }
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
    } // End of loop for PNG/Full Path scenarios

    // --- Test for SVG Icon ---
    linuxEnvTest(
        'Suggest app from OS shows SVG icon from .desktop file',
        async ({ page, electronApp, setupEnv, tempDir }) => {
            // --- Test Setup ---
            const xdgDataHome = setupEnv['XDG_DATA_HOME'];
            const xdgDataDirShare = setupEnv['XDG_DATA_DIRS'];
            const appDir = join(xdgDataHome, 'applications');
            const iconDir = join(
                xdgDataDirShare,
                'icons',
                'hicolor',
                'scalable', // SVG icons often go in 'scalable'
                'apps',
            );
            const iconFileName = 'test-app-icon.svg'; // SVG icon file
            const iconFilePath = join(iconDir, iconFileName); // Full path to SVG icon
            const iconValueForDesktopFile = 'test-app-icon'; // Use name reference
            const uniqueAppName = 'Test SVG Icon App';
            const uniqueDesktopFileName = 'test-svg-icon-app.desktop';

            await mkdir(appDir, { recursive: true });
            // Use the updated createIconFile which handles SVG
            await createIconFile(iconDir, iconFileName, iconFilePath);
            await createDesktopFile(
                appDir,
                uniqueAppName,
                uniqueDesktopFileName,
                iconValueForDesktopFile,
            );

            // --- Page Load ---
            page = await electronApp.firstWindow();
            await page.waitForLoadState('load', { timeout: 15000 });

            // --- UI Navigation ---
            await page.getByRole('button', { name: 'Add App' }).click();
            const initialDialog = page.getByRole('dialog', {
                name: 'Add New App',
            });
            await expect(initialDialog).toBeVisible();
            await initialDialog
                .getByRole('button', { name: 'Select from OS' })
                .click();

            // --- Verify Suggestion and Icon ---
            const selectDialog = page.getByRole('dialog', {
                name: 'Select App from System',
            });
            await expect(selectDialog).toBeVisible();
            await expect(
                selectDialog.getByText('Loading suggestions...'),
            ).not.toBeVisible({ timeout: 10000 });

            const suggestedAppButton = selectDialog
                .getByRole('button')
                .filter({ hasText: new RegExp(`^${uniqueAppName}$`) });
            await expect(
                suggestedAppButton,
                `Suggested app button for ${uniqueAppName} should be visible`,
            ).toBeVisible();
            await expect(
                suggestedAppButton,
                `Suggested app button should contain text "${uniqueAppName}"`,
            ).toContainText(uniqueAppName);

            const iconImage = suggestedAppButton.locator('img');
            await expect(
                iconImage,
                `Icon image within button for ${uniqueAppName} should be visible`,
            ).toBeVisible({ timeout: 50000 });

            // --- SVG Specific Assertion ---
            const expectedIconSrcPrefix = 'data:image/svg+xml;base64,';
            await expect(
                iconImage,
                `Icon image src should start with "${expectedIconSrcPrefix}" for SVG icon`,
            ).toHaveAttribute('src', new RegExp(`^${expectedIconSrcPrefix}`));

            const actualSrc = await iconImage.getAttribute('src');
            expect(
                actualSrc?.length ?? 0,
                'Icon data URL should have content',
            ).toBeGreaterThan(expectedIconSrcPrefix.length);
        },
    );
    // --- End of SVG Icon Test ---

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
