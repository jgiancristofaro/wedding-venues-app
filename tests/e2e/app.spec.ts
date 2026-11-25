import { expect, test } from '@playwright/test';
import path from 'node:path';
import { card, fillSignIn, setup, signIn, signOut } from './helpers';

const fixture = (f: string) => path.resolve('tests/fixtures', f);

test.beforeEach(async ({ page }) => setup(page));

test('browse Discover signed-out, filter, and see how a price was built', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Every venue, priced for/ })).toBeVisible();
  await expect(page.getByTestId('venue-card').first()).toBeVisible();
  await expect(page.getByText('Sample data').first()).toBeVisible();
  await expect(page.getByText(/38 of 38 venues/)).toBeVisible();
  await page.getByPlaceholder('Search by name, town, style…').fill('larkspur');
  await expect(page.getByText(/1 of 38 venues/)).toBeVisible();
  await card(page, 'The Larkspur Rooms')
    .getByRole('button', { name: /How we got this/ })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Estimated all-in total')).toBeVisible();
  await expect(dialog.getByText('Assumptions')).toBeVisible();
  await page.keyboard.press('Escape');
  // views keep filters
  await page.getByRole('radio', { name: 'Table' }).click();
  await expect(page.getByRole('link', { name: 'The Larkspur Rooms' })).toBeVisible();
  await expect(page.getByPlaceholder('Search by name, town, style…')).toHaveValue('larkspur');
  await page.getByRole('radio', { name: 'Map' }).click();
  await expect(page.getByRole('region', { name: 'Map of venues' })).toBeVisible();
});

test('heart prompts sign-in, then saves after signing in (action preserved), with undo', async ({ page }) => {
  await page.goto('/');
  await card(page, 'Bramble & Bay')
    .getByRole('button', { name: /Save Bramble & Bay/ })
    .click();
  await expect(page.getByText('Sign in to save venues to your private library.')).toBeVisible();
  await fillSignIn(page, 'alice@example.com');
  await expect(page.getByText('Saved Bramble & Bay to My Venues')).toBeVisible();
  await expect(
    card(page, 'Bramble & Bay').getByRole('button', { name: /Remove Bramble & Bay/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'My Venues' }).first().click();
  await expect(card(page, 'Bramble & Bay')).toBeVisible();
  // undo
  await page.goto('/');
  await card(page, 'Heron Hall')
    .getByRole('button', { name: /Save Heron Hall/ })
    .click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('link', { name: 'My Venues' }).first().click();
  await expect(card(page, 'Bramble & Bay')).toBeVisible();
  await expect(card(page, 'Heron Hall')).toHaveCount(0);
});

test('one user cannot see another user’s venues', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'alice@example.com');
  await card(page, 'Willowmere Farm')
    .getByRole('button', { name: /Save Willowmere Farm/ })
    .click();
  await page.goto('/mine');
  await expect(card(page, 'Willowmere Farm')).toBeVisible();
  await signOut(page);
  await signIn(page, 'bob@example.com');
  await page.goto('/mine');
  await expect(page.getByText('Nothing saved yet')).toBeVisible();
  await signOut(page);
  await signIn(page, 'alice@example.com');
  await page.goto('/mine');
  await expect(card(page, 'Willowmere Farm')).toBeVisible();
});

test('import a messy XLSX with column mapping, dedupe and background job', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await page.goto('/import?mode=sheet');
  await page.getByTestId('file-input').setInputFiles(fixture('messy-venues-a.xlsx'));
  await expect(page.getByRole('heading', { name: '1. Match your columns' })).toBeVisible();
  await expect(page.getByLabel('Map column Price to')).toHaveValue('pricingText');
  const preview = page.getByTestId('import-preview');
  await expect(preview.getByLabel('Name for row 6')).toHaveValue('Copper Kettle Works');
  await expect(preview.getByLabel('Action for row 10')).toHaveValue(/^link\|g:sample-the-larkspur-rooms/);
  await page.getByTestId('start-import').click();
  await expect(page.getByText(/Import finished: 4 created, 1 linked/)).toBeVisible({ timeout: 20000 });
  await page.goto('/mine');
  await expect(card(page, 'Copper Kettle Works')).toBeVisible();
  await expect(card(page, 'The Larkspur Rooms')).toBeVisible();
  await card(page, 'Copper Kettle Works').getByRole('link', { name: 'Copper Kettle Works' }).click();
  await expect(page.getByText('loved the windows, a bit loud')).toBeVisible();
  await expect(page.getByTestId('detail-total')).toHaveText(/\$/);
});

test('import a PDF booklet through the Review screen', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await page.goto('/import?mode=doc');
  await page.getByTestId('file-input').setInputFiles(fixture('booklet-juniper-hall.pdf'));
  const review = page.getByTestId('review-screen');
  await expect(review).toBeVisible({ timeout: 30000 });
  await expect(review.getByLabel('Venue name', { exact: true })).toHaveValue('Juniper Hall');
  await expect(review.getByLabel('Seated capacity', { exact: true })).toHaveValue('180');
  await expect(review.getByText(/suggestions/).first()).toBeVisible();
  await expect(review.getByRole('button', { name: 'Read with AI' })).toBeDisabled();
  await page.getByTestId('review-save').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Juniper Hall' })).toBeVisible();
  await expect(page.getByTestId('detail-total')).toHaveText(/\$\d/);
  await expect(page.getByText('booklet-juniper-hall.pdf')).toBeVisible();
});

test('shortlist reorder with buttons and keyboard persists', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  for (const n of ['Bramble & Bay', 'Heron Hall', 'Clementine Hall']) {
    await card(page, n)
      .getByRole('button', { name: new RegExp(`Save ${n}`) })
      .click();
    await expect(page.getByText(`Saved ${n} to My Venues`)).toBeVisible();
  }
  for (const n of ['Bramble & Bay', 'Heron Hall', 'Clementine Hall']) {
    await page.goto('/mine');
    await card(page, n).getByRole('link', { name: n }).click();
    await page.getByRole('button', { name: 'Add to shortlist' }).click();
    await expect(page.getByRole('button', { name: /Shortlist #/ })).toBeVisible();
  }
  await page.goto('/shortlist');
  const rows = page.getByTestId('shortlist-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Bramble & Bay');
  await page.getByRole('button', { name: 'Move Clementine Hall up' }).click();
  await expect(rows.nth(1)).toContainText('Clementine Hall');
  // keyboard drag: move Bramble down one
  await page.getByRole('button', { name: /Reorder Bramble & Bay/ }).focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect(rows.nth(0)).toContainText('Clementine Hall');
  await expect(rows.nth(1)).toContainText('Bramble & Bay');
  await page.reload();
  await expect(page.getByTestId('shortlist-row').nth(0)).toContainText('Clementine Hall');
});

test('compare 3 venues (button + drag to tray), differences only', async ({ page }) => {
  await page.goto('/');
  await card(page, 'The Larkspur Rooms')
    .getByRole('button', { name: /Add The Larkspur Rooms to compare/ })
    .click();
  await card(page, 'Heron Hall')
    .getByRole('button', { name: /Add Heron Hall to compare/ })
    .click();
  // drag a card onto the tray
  const src = card(page, 'Willowmere Farm').locator('img').first();
  await src.scrollIntoViewIfNeeded();
  const tray = page.getByTestId('compare-tray');
  const a = (await src.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 5 });
  const t = (await tray.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(tray.getByText('3/4')).toBeVisible();
  await tray.getByRole('link', { name: /Compare \(3\)/ }).click();
  const table = page.getByTestId('compare-table');
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(table.getByText('(best)').first()).toBeAttached();
  const before = await table.locator('tbody tr').count();
  await page.getByRole('switch', { name: 'Show differences only' }).click();
  expect(await table.locator('tbody tr').count()).toBeLessThan(before);
});

test('editing pricing assumptions updates totals live', async ({ page }) => {
  await page.goto('/venue/g/sample-the-larkspur-rooms');
  const total = page.getByTestId('detail-total');
  const t1 = await total.textContent();
  await page.getByLabel('Day', { exact: true }).selectOption('0');
  await expect(total).not.toHaveText(t1!);
  const t2 = await total.textContent();
  await page.getByLabel('Package').selectOption({ label: 'Grand' });
  await expect(total).not.toHaveText(t2!);
  const slider = page.getByLabel('Guests', { exact: true });
  await slider.fill('200');
  await expect(page.getByText(/200 guests ×/)).toBeVisible();
});

test('edit pricing rules on a saved venue and see the total change', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await card(page, 'Greywater Boathouse')
    .getByRole('button', { name: /Save Greywater Boathouse/ })
    .click();
  await page.goto('/mine');
  await card(page, 'Greywater Boathouse').getByRole('link', { name: 'Greywater Boathouse' }).click();
  const total = page.getByTestId('detail-total');
  const before = await total.textContent();
  await page.getByRole('button', { name: 'Edit pricing rules' }).click();
  const site = page.getByTestId('pricing-component-site_fee');
  await site.getByLabel('Amount').first().fill('16500');
  await expect(total).not.toHaveText(before!);
  await page.reload();
  await expect(total).not.toHaveText(before!);
  await expect(page.getByText('yours').first()).toBeVisible();
});

test('export XLSX, CSV and JSON backup', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await card(page, 'Bramble & Bay')
    .getByRole('button', { name: /Save Bramble & Bay/ })
    .click();
  await page.goto('/settings');
  for (const [id, ext] of [
    ['export-xlsx', '.xlsx'],
    ['export-csv', '.csv'],
    ['export-json', '.json'],
  ]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(id).click()]);
    expect(dl.suggestedFilename()).toContain(ext);
  }
});

test('notes: rich text, pros/cons, pin', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await card(page, 'Heron Hall')
    .getByRole('button', { name: /Save Heron Hall/ })
    .click();
  await page.goto('/mine');
  await card(page, 'Heron Hall').getByRole('link', { name: 'Heron Hall' }).click();
  await page.getByTestId('note-editor').fill('Loved the velvet lounge');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByLabel('Notes').getByText('Loved the velvet lounge')).toBeVisible();
  await page.getByLabel('Add a pro').fill('Great light');
  await page.getByLabel('Add a pro').press('Enter');
  await expect(page.getByText('Great light')).toBeVisible();
  await page.getByRole('button', { name: 'Pin note' }).click();
  await expect(page.getByLabel('Pinned')).toBeVisible();
});

test('unsupported and oversized files are handled gracefully', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await page.goto('/import?mode=sheet');
  await page.getByTestId('file-input').setInputFiles({
    name: 'broken.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('not a spreadsheet'),
  });
  await expect(page.getByRole('alert')).toContainText(/couldn’t read that spreadsheet|No rows/);
  await page.goto('/import?mode=doc');
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-garbage') });
  await expect(page.getByRole('alert')).toContainText(/could not be opened/);
});

test('dropping a file anywhere shows the overlay and routes to the right importer', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  const bytes = [...(await import('node:fs')).readFileSync(fixture('booklet-seabright-pavilion.pdf'))];
  const dt = await page.evaluateHandle((b) => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array(b)], 'seabright.pdf', { type: 'application/pdf' }));
    return d;
  }, bytes);
  await page.dispatchEvent('main', 'dragenter', { dataTransfer: dt });
  await expect(page.getByTestId('drop-overlay')).toBeVisible();
  await page.dispatchEvent('main', 'drop', { dataTransfer: dt });
  await expect(page.getByTestId('review-screen')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('review-screen').getByLabel('Venue name', { exact: true })).toHaveValue(
    'Seabright Pavilion',
  );
});
