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
  await page.keyboard.press('ArrowDown');
  const firstTileTestId = `app-tile-${MULTI_APP[0].id}`;
  const activeTestId1 = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid')
  );
  expect(activeTestId1).toBe(firstTileTestId);

  await page.keyboard.press('ArrowRight');
  const secondTileTestId = `app-tile-${MULTI_APP[1].id}`;
  const activeTestId2 = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid')
  );
  expect(activeTestId2).toBe(secondTileTestId);
});

test('user can navigate to Add App button and open it using Enter', async ({ page }) => {
  await page.waitForLoadState('load');
  await page.keyboard.press('Tab');
  const activeName = await page.evaluate(
    () => (document.activeElement as HTMLElement)?.innerText
  );
  expect(activeName?.trim()).toBe('Add App');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Add New App' })
  ).toBeVisible();
});

test('user can navigate inside dialog modal using arrow keys and close it', async ({
  page,
}) => {
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: 'Add App' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add New App' });
  await expect(dialog).toBeVisible();

  await page.keyboard.press('ArrowRight');
  const slotAttr = await page.evaluate(
    () => document.activeElement?.getAttribute('data-slot')
  );
  expect(slotAttr).toBe('dialog-close');

  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
});
