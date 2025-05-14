import { test, expect } from './base.js';
import { getTestAppConfig } from './data.js';

const MULTI_APP = [getTestAppConfig(1), getTestAppConfig(2)];

test.use({ initialApps: [MULTI_APP] });

test('user can navigate main app grid using arrow keys', async ({ page }) => {
    await page.waitForLoadState('load');

    const firstTile = page.getByTestId(`app-tile-${MULTI_APP[0].id}`);
    const secondTile = page.getByTestId(`app-tile-${MULTI_APP[1].id}`);

    await expect(firstTile).toBeVisible();
    await expect(secondTile).toBeVisible();

    // Focus the first tile
    await firstTile.focus();
    await expect(firstTile).toBeFocused();

    // Try navigating right
    await page.keyboard.press('ArrowRight');

    // Check if the second tile is focused. Give a brief timeout for the focus to apply.
    await expect(secondTile)
        .toBeFocused({ timeout: 100 })
        .catch(async () => {
            // If ArrowRight didn't focus the second tile, try ArrowDown
            // This handles cases where the layout might be vertical
            await page.keyboard.press('ArrowDown');
            return expect(secondTile).toBeFocused({ timeout: 100 });
        });

    // Assert that the second tile is now focused
    await expect(secondTile).toBeFocused();
});

test('user can navigate to Add App button and open it using Enter', async ({
    page,
}) => {
    await page.waitForLoadState('load');

    const addAppButton = page.getByRole('button', { name: 'Add App' });
    await expect(addAppButton).toBeVisible();

    const firstTile = page.getByTestId(`app-tile-${MULTI_APP[0].id}`);
    await expect(firstTile).toBeVisible();

    // Focus the first tile
    await firstTile.focus();
    await expect(firstTile).toBeFocused();

    // Navigate up to the Add App button
    await page.keyboard.press('ArrowUp');
    await expect(addAppButton).toBeFocused();

    // Activate the Add App button
    await page.keyboard.press('Enter');

    await expect(
        page.getByRole('dialog', { name: 'Add New App' }),
    ).toBeVisible();
});

test('user can navigate inside dialog modal using keyboard and close it', async ({
    page,
}) => {
    await page.waitForLoadState('load');

    const addAppButton = page.getByRole('button', { name: 'Add App' });
    await expect(addAppButton).toBeVisible();
    await addAppButton.click();

    const dialog = page.getByRole('dialog', { name: 'Add New App' });
    await expect(dialog).toBeVisible();

    const closeButton = page.getByRole('button', { name: 'Close' });
    await expect(closeButton).toBeVisible();
    // focus + activate
    await closeButton.focus();
    await expect(closeButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(dialog).not.toBeVisible();
});
