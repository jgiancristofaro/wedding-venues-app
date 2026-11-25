import { readFileSync } from 'node:fs';
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { estimate } from '../pricing/engine';
import type { FnbMinimumComponent, PerPersonComponent, PricingRules, SiteFeeComponent } from '../pricing/types';
import { autoMapColumns, dice, rowToVenue } from './columnMap';
import { itemsToText, type PdfTextItem } from './pdfText';
import { readWorkbook } from './spreadsheet';
import { detectDays, detectGuestRange, detectMonths, parseCapacityText, parseMoney, parsePricingText, parseVenueText } from './textHeuristics';

const fixture = (f: string) => readFileSync(new URL(`../../../tests/fixtures/${f}`, import.meta.url));

async function pdfPages(file: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fixture(file)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(itemsToText(tc.items as PdfTextItem[]));
  }
  return pages;
}

const kinds = (r: PricingRules) => r.components.map((c) => c.kind).sort();

describe('text heuristics — primitives', () => {
  it('parses money formats', () => {
    expect(parseMoney('$25k')).toBe(25000);
    expect(parseMoney('$1,500.00')).toBe(1500);
    expect(parseMoney('about 12,000 dollars')).toBe(12000);
  });
  it('detects days, ranges and weekdays', () => {
    expect(detectDays('saturday rate')).toEqual([6]);
    expect(detectDays('friday & sunday')).toEqual([0, 5]);
    expect(detectDays('monday – thursday')).toEqual([1, 2, 3, 4]);
    expect(detectDays('weekdays only')).toEqual([1, 2, 3, 4]);
  });
  it('detects months and month ranges', () => {
    expect(detectMonths('peak season: may – october')).toEqual([5, 6, 7, 8, 9, 10]);
    expect(detectMonths('november through february')).toEqual([11, 12, 1, 2]);
    expect(detectMonths('you may bring a dog')).toBeUndefined();
  });
  it('detects guest ranges', () => {
    expect(detectGuestRange('101-150 guests: $31,000')).toEqual({ guestMin: 101, guestMax: 150 });
    expect(detectGuestRange('up to 100 guests')).toEqual({ guestMax: 100 });
    expect(detectGuestRange('151+ guests')).toEqual({ guestMin: 151 });
  });
  it('parses capacity text', () => {
    expect(parseCapacityText('150 seated / 200 cocktail')).toEqual({ seated: 150, standing: 200 });
    expect(parseCapacityText('220')).toEqual({ seated: 220 });
  });
});

describe('text heuristics — free-text pricing', () => {
  it('"$150pp, $25k min Sat" → per-person + Saturday minimum', () => {
    const r = parsePricingText('$150pp, $25k min Sat');
    expect(kinds(r)).toEqual(['fnb_minimum', 'per_person']);
    const min = r.components.find((c) => c.kind === 'fnb_minimum') as FnbMinimumComponent;
    expect(min.rates[0]).toEqual({ amount: 25000, when: { days: [6] } });
    expect((r.components.find((c) => c.kind === 'per_person') as PerPersonComponent).rates[0].amount).toBe(150);
  });
  it('site fee + percentages', () => {
    const r = parsePricingText('Site fee $12k. 22% service charge, 8.875% sales tax, 3% administrative fee');
    expect(kinds(r)).toEqual(['site_fee']);
    expect(r.charges).toMatchObject({ serviceChargePct: 22, taxPct: 8.875, adminFeePct: 3 });
  });
  it('capacity tiers', () => {
    const r = parsePricingText('Up to 100 guests: $24,000\n101-150 guests: $31,000 all-inclusive package');
    expect(kinds(r)).toEqual(['capacity_tier']);
    expect(r.components[0].rates).toHaveLength(2);
  });
  it('buyout, overtime and add-ons', () => {
    const r = parsePricingText('Saturday buyout: $42,000\nEach additional hour $1,800\nCeremony fee: $2,500\nSecurity required: $65 per hour');
    expect(kinds(r)).toEqual(['addon', 'addon', 'buyout']);
    expect(r.overtimePerHour).toBe(1800);
    const sec = r.components.find((c) => c.kind === 'addon' && c.name === 'Security');
    expect(sec && sec.kind === 'addon' && sec.unit).toBe('per_hour');
  });
});

describe('PDF booklets (pdf.js + heuristics)', () => {
  it('Juniper Hall: day-varying site fee and minimum, packages, charges, add-ons, capacity, contact', async () => {
    const pages = await pdfPages('booklet-juniper-hall.pdf');
    expect(pages.length).toBe(2);
    const x = parseVenueText(pages);
    expect(x.fields.name?.value).toBe('Juniper Hall');
    expect(x.fields.capacitySeated?.value).toBe(180);
    expect(x.fields.capacityStanding?.value).toBe(250);
    expect(x.fields.contactEmail?.value).toBe('events@juniperhall.example');
    expect(x.fields.cateringPolicy?.value).toBe('in_house');
    expect(x.fields.ceremonyOnSite?.value).toBe(true);
    const site = x.pricing.components.find((c) => c.kind === 'site_fee') as SiteFeeComponent;
    expect(site.rates.map((r) => r.amount).sort()).toEqual([4000, 6500, 9000]);
    const min = x.pricing.components.find((c) => c.kind === 'fnb_minimum') as FnbMinimumComponent;
    expect(min.rates.find((r) => r.when?.days?.includes(6))?.amount).toBe(38000);
    const pkgs = x.pricing.components.filter((c) => c.kind === 'per_person') as PerPersonComponent[];
    expect(pkgs.map((p) => p.rates[0].amount).sort()).toEqual([165, 205]);
    expect(x.pricing.charges).toMatchObject({ serviceChargePct: 22, taxPct: 8.875 });
    expect(x.pricing.hoursIncluded).toBe(5);
    expect(x.pricing.overtimePerHour).toBe(1800);
    expect(x.pricingSources[site.id].page).toBe(2);
    // and the engine can price it
    const e = estimate(x.pricing, { guests: 150, date: '2027-06-12' });
    expect(e.total).toBeGreaterThan(50000);
    expect(e.confidence).not.toBe('unknown');
  });

  it('Orchard House: capacity tiers + peak season definition', async () => {
    const x = parseVenueText(await pdfPages('booklet-orchard-house.pdf'));
    const tier = x.pricing.components.find((c) => c.kind === 'capacity_tier');
    expect(tier?.rates.map((r) => r.amount)).toEqual([24000, 31000, 37500]);
    expect(x.pricing.seasons?.peakMonths).toEqual([5, 6, 7, 8, 9, 10]);
    expect(x.pricing.charges?.taxPct).toBe(8.125);
    expect(x.fields.accommodations?.value).toBe(true);
    expect(x.fields.styleTags?.value).toEqual(expect.arrayContaining(['Rustic', 'Barn', 'Garden']));
  });

  it('Seabright: buyout by day, inclusive minimum, corkage per person, security per hour', async () => {
    const x = parseVenueText(await pdfPages('booklet-seabright-pavilion.pdf'));
    const buy = x.pricing.components.find((c) => c.kind === 'buyout');
    expect(buy?.rates.map((r) => r.amount).sort()).toEqual([30000, 42000]);
    const min = x.pricing.components.find((c) => c.kind === 'fnb_minimum') as FnbMinimumComponent;
    expect(min.includesTax && min.includesServiceCharge).toBe(true);
    expect(x.pricing.components.some((c) => c.kind === 'addon' && c.addonType === 'corkage' && c.unit === 'per_person')).toBe(true);
    expect(x.pricing.asOf).toBe('2027-01-01');
    expect(x.fields.capacitySeated?.value).toBe(220);
  });

  it('scanned PDF has no text layer (routes to OCR)', async () => {
    const pages = await pdfPages('booklet-linden-barn-scanned.pdf');
    expect(pages.join('').trim().length).toBeLessThan(20);
  });

  it('OCR-style text from the scanned booklet still parses', () => {
    const x = parseVenueText(['Linden Barn\nRental fee $7,500 Saturday\nRental fee $5,000 Friday\nSeats 160 guests\nOutside caterers welcome']);
    expect(x.fields.cateringPolicy?.value).toBe('outside_allowed');
    expect(x.pricing.components[0].rates).toHaveLength(2);
  });
});

describe('spreadsheet parsing and column mapping', () => {
  it('dice similarity', () => {
    expect(dice('capacity', 'capacity')).toBe(1);
    expect(dice('max guests', 'max guest')).toBeGreaterThan(0.8);
  });

  it('messy A: finds the venue sheet, header on row 4, skips merged section rows and blanks', () => {
    const sheets = readWorkbook(XLSX, fixture('messy-venues-a.xlsx'));
    expect(sheets[0].name).toBe('Venues');
    expect(sheets[0].headers.slice(0, 4)).toEqual(['Venue', 'Neighborhood', 'Max Guests', 'Price']);
    expect(sheets[0].rows.map((r) => r[0])).toEqual(['Copper Kettle Works', 'Mariner Hall', 'The Larkspur Rooms', 'Bellwether Club', 'Weatherby Garden']);
    expect(sheets[0].rowNumbers[0]).toBe(6);
    expect(sheets.map((s) => s.name)).toContain('Rejected');
  });

  it('messy A: auto-maps columns and parses free-text price + capacity', () => {
    const s = readWorkbook(XLSX, fixture('messy-venues-a.xlsx'))[0];
    const map = autoMapColumns(s.headers, s.rows);
    const t = (h: string) => map.find((m) => m.header === h)?.target;
    expect(t('Venue')).toBe('name');
    expect(t('Neighborhood')).toBe('area');
    expect(t('Max Guests')).toBe('capacitySeated');
    expect(t('Price')).toBe('pricingText');
    expect(t('Indoor/Outdoor')).toBe('setting');
    expect(t('Catering')).toBe('cateringPolicy');
    expect(t('Website')).toBe('website');
    expect(t('Our thoughts')).toBe('notes');
    const r = rowToVenue(s.rows[0], map);
    expect(r.fields).toMatchObject({ name: 'Copper Kettle Works', capacitySeated: 150, capacityStanding: 200, setting: 'indoor', cateringPolicy: 'in_house' });
    expect(kinds(r.pricing)).toEqual(['fnb_minimum', 'per_person']);
    expect(r.notes).toEqual(['loved the windows, a bit loud']);
    const callFor = rowToVenue(s.rows[3], map);
    expect(callFor.pricing.components).toHaveLength(0);
    expect(callFor.notes.join(' ')).toMatch(/call for pricing/);
  });

  it('messy B: typed price columns, decimal percentages, status and star ratings', () => {
    const s = readWorkbook(XLSX, fixture('messy-venues-b.xlsx'))[0];
    expect(s.headerRow).toBe(1);
    const map = autoMapColumns(s.headers, s.rows);
    const t = (h: string) => map.find((m) => m.header === h)?.target;
    expect(t('Name of place')).toBe('name');
    expect(t('Town')).toBe('area');
    expect(t('Per person')).toBe('perPerson');
    expect(t('F&B min')).toBe('fnbMinimum');
    expect(t('Site Fee')).toBe('siteFee');
    expect(t('Service %')).toBe('serviceCharge');
    expect(t('Contact email')).toBe('contactEmail');
    expect(t('Status')).toBe('status');
    expect(t('Rating')).toBe('rating');
    const heron = rowToVenue(s.rows[1], map);
    expect(heron.pricing.charges?.serviceChargePct).toBe(20);
    expect(heron.status).toBe('contacted');
    expect(heron.rating).toBe(4);
    expect(kinds(heron.pricing)).toEqual(['fnb_minimum', 'per_person']);
    const hawthorn = rowToVenue(s.rows[0], map);
    expect(hawthorn.rating).toBe(4);
    expect(hawthorn.status).toBe('toured');
    const silver = rowToVenue(s.rows[2], map);
    const pp = silver.pricing.components.find((c) => c.kind === 'per_person')!;
    expect(pp.rates.find((r) => r.when?.days?.includes(6))?.amount).toBe(160);
    expect(silver.pricing.charges?.serviceChargePct).toBe(21);
  });

  it('CSV import works too', () => {
    const s = readWorkbook(XLSX, fixture('simple-venues.csv').toString('utf8'), { csv: true })[0];
    const map = autoMapColumns(s.headers, s.rows);
    const r = rowToVenue(s.rows[0], map);
    expect(r.fields.name).toBe('Amberly House');
    expect(kinds(r.pricing)).toEqual(['fnb_minimum', 'per_person']);
  });
});
