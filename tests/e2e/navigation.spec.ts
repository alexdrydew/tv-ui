import { test, expect } from './base.js';
import { SINGLE_APP } from './data.js';
import type { AppConfig } from '@app/types';

const MULTI_APP: AppConfig[] = [
  ...SINGLE_APP,
  {
    ...SINGLE_APP[0],
    id: `${SINGLE_APP[0].id}-2`,
    name: `${SINGLE_APP[0].name} 2`,
  },
];

test.use({ initialApps: MULTI_APP });

test('user can navigate main app grid using arrow keys', async ({ page }) => {
  await page.waitForLoadState('load');

  const firstTile = page.getByTestId(`app-tile-${MULTI_APP[0].id}`);
  const secondTile = page.getByTestId(`app-tile-${MULTI_APP[1].id}`);

  await expect(firstTile).toBeVisible();
  // focus the first tile, then move right
  await firstTile.focus();
  await expect(firstTile).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(secondTile).toBeFocused();
});

test('user can navigate to Add App button and open it using Enter', async ({ page }) => {
  await page.waitForLoadState('load');

  const addAppButton = page.getByRole('button', { name: 'Add App' });
  await expect(addAppButton).toBeVisible();
  // focus + activate
  await addAppButton.focus();
  await expect(addAppButton).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(
    page.getByRole('dialog', { name: 'Add New App' })
  ).toBeVisible();
});

test('user can navigate inside dialog modal using keyboard and close it', async ({ page }) => {
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
