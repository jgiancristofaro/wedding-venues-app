import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
await p.route(/openstreetmap/, (r) => r.fulfill({ status: 204, body: '' }));
await p.addInitScript(() =>
  localStorage.setItem(
    'vellum:profile:anon',
    JSON.stringify({ guestCount: 140, preferredDays: [6], months: [6] }),
  ),
);
const cdp = await p.context().newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
let t = Date.now();
await p.goto('http://localhost:4173/?stress=2000');
await p.getByText(/of 2000 venues/).waitFor();
console.log('2000 venues first render (4x CPU throttle):', Date.now() - t, 'ms');
t = Date.now();
await p.getByPlaceholder('Search by name, town, style…').fill('barn');
await p.getByText(/of 2000 venues/).waitFor();
await p.waitForTimeout(50);
console.log('search filter:', Date.now() - t, 'ms');
t = Date.now();
await p.getByRole('radio', { name: 'Table' }).click();
await p.locator('table').waitFor();
console.log('switch to table:', Date.now() - t, 'ms');
t = Date.now();
await p.getByRole('radio', { name: 'Map' }).click();
await p.locator('.leaflet-container').waitFor();
console.log('switch to map:', Date.now() - t, 'ms');
await p.screenshot({ path: '/tmp/claude-0/perf.png' });
await b.close();
