import { expect, type Page } from '@playwright/test';

export const PROFILE = { guestCount: 140, preferredDays: [6], months: [6], hours: 5, locationLabel: 'New York, NY', lat: 40.7128, lng: -74.006, completed: true };

/** Fresh demo-mode app with a profile already set (skips onboarding) and no external network. */
export async function setup(page: Page) {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 204, body: '' }));
  await page.route(/nominatim\.openstreetmap\.org/, (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: '40.73', lon: '-73.99', display_name: 'Test place, New York' }]) }),
  );
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem('__init')) {
      localStorage.clear();
      localStorage.setItem('vellum:profile:anon', JSON.stringify(p));
      sessionStorage.setItem('__init', '1');
    }
  }, PROFILE);
}

export async function signIn(page: Page, email = 'alice@example.com') {
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await fillSignIn(page, email);
}

export async function fillSignIn(page: Page, email: string) {
  const dialog = page.getByRole('dialog', { name: 'Sign in to Vellum' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByRole('button', { name: /Continue \(demo account\)/ }).click();
  await expect(dialog).toBeHidden();
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

export const card = (page: Page, name: string) => page.getByTestId('venue-card').filter({ has: page.getByRole('link', { name, exact: true }) });
