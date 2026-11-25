import { expect, test } from '@playwright/test';
import { card, setup, signIn } from './helpers';

test.beforeEach(async ({ page }) => setup(page));

test('375px: bottom nav, no horizontal scroll, filters sheet, compare tray bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' }).last()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await page.getByRole('button', { name: /Show \d+ venues/ }).click();
  await card(page, 'Heron Hall').getByRole('button', { name: /Add Heron Hall to compare/ }).click();
  await expect(page.getByTestId('compare-tray')).toBeVisible();
  // hit targets of bottom nav are >= 44px
  const box = await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await signIn(page);
  await page.goto('/venue/g/sample-heron-hall');
  const o2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o2).toBeLessThanOrEqual(0);
});
