import { test, expect } from './base.js';
import { SINGLE_APP } from './data.js';
import { keyboard, Key } from '@nut-tree-fork/nut-js';
test.use({ initialApps: SINGLE_APP });

test('Home key toggles window visibility', async ({ page, browserWindow }) => {
    const isWindowVisible = async () => {
        return await browserWindow.evaluate((win) => {
            return win.isVisible() && !win.isMinimized();
        });
    };

    const isWindowFocused = async () => {
        return await browserWindow.evaluate((win) => {
            return win.isFocused();
        });
    };

    await page.waitForTimeout(500);
    expect(await isWindowVisible(), 'Window should initially be visible').toBe(
        true,
    );
    expect(await isWindowFocused(), 'Window should initially be focused').toBe(
        true,
    );

    keyboard.type(Key.Home);
    await page.waitForTimeout(500);

    expect(
        await isWindowVisible(),
        'Window should be hidden after pressing Home key',
    ).toBe(false);

    keyboard.type(Key.Home);
    await page.waitForTimeout(500);

    expect(
        await isWindowVisible(),
        'Window should be visible again after pressing Home key',
    ).toBe(true);
    expect(
        await isWindowFocused(),
        'Window should be focused after being restored',
    ).toBe(true);
});
