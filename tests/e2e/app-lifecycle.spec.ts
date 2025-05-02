import { test, expect } from './base.js';
import { SINGLE_APP } from './data.js';

test.use({ initialApps: SINGLE_APP });

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
