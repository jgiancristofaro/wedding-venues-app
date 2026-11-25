// Generates synthetic test fixtures: venue booklet PDFs (text-based and one scanned image-only PDF)
// and two messy multi-sheet XLSX venue lists. All venues are fictional.
// Run: npm run fixtures
import { chromium } from 'playwright';
import * as XLSX from '@e965/xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const css = `
  body{font-family:Georgia,serif;color:#2b2622;margin:48px;line-height:1.45}
  h1{font-size:40px;margin:0 0 4px;letter-spacing:.02em} h2{font-size:20px;margin:28px 0 8px;border-bottom:1px solid #ccc}
  .sub{font-family:Helvetica,Arial;color:#776;letter-spacing:.2em;text-transform:uppercase;font-size:11px}
  table{border-collapse:collapse;width:100%;font-family:Helvetica,Arial;font-size:13px} td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}
  .page{page-break-after:always} p,li{font-size:14px}
  .hero{height:180px;border-radius:8px;background:linear-gradient(135deg,#e8c7b8,#8e9c7d)}
`;

const booklets = [
  {
    file: 'booklet-juniper-hall.pdf',
    html: `<div class="page"><h1>Juniper Hall</h1><div class="sub">Weddings &amp; Celebrations · 2027 Pricing</div>
<div class="hero"></div>
<p>An 1890s limestone hall in Hudson Square with a skylit ballroom and a private garden courtyard. The ballroom seats up to 180 guests for dinner and 250 standing for cocktail receptions.</p>
<p>Ceremonies can be held on-site in the garden courtyard. Rain plan: the ceremony moves to the Gallery Room under the skylight.</p>
<p>All catering is provided by our in-house culinary team. Bar service through Juniper Hall only; no outside alcohol.</p>
<p>148 Varick Street, New York, NY 10013 · events@juniperhall.example · (212) 555-0148 · www.juniperhall.example</p></div>
<div class="page"><h2>Venue Rental</h2>
<table><tr><th>Day</th><th>Site Fee</th><th>Food &amp; Beverage Minimum</th></tr>
<tr><td>Saturday</td><td>Site fee $9,000</td><td>Saturday food and beverage minimum $38,000</td></tr>
<tr><td>Friday &amp; Sunday</td><td>Site fee $6,500</td><td>Friday &amp; Sunday F&amp;B minimum $26,000</td></tr>
<tr><td>Monday – Thursday</td><td>Site fee $4,000</td><td>Weekday minimum $15,000</td></tr></table>
<h2>Dinner Packages</h2>
<ul><li>Silver Package $165 per person — three courses, five-hour open bar</li><li>Gold Package $205 per person — four courses, premium bar, late-night bites</li></ul>
<h2>Fees &amp; Policies</h2>
<ul><li>All food and beverage is subject to a 22% service charge and 8.875% New York sales tax.</li>
<li>Ceremony fee: $2,500</li><li>Cake cutting fee $3 per person</li>
<li>Five-hour event included; each additional hour $1,800</li>
<li>Music must end by 11:30 pm.</li>
<li>A 30% non-refundable deposit is due at signing; balance due 14 days prior.</li>
<li>Cancellation: deposits are non-refundable.</li></ul></div>`,
  },
  {
    file: 'booklet-orchard-house.pdf',
    html: `<div class="page"><h1>The Orchard House</h1><div class="sub">Millbrook, New York · Wedding Packages 2027</div>
<div class="hero"></div>
<p>A restored 1820s farmhouse and post-and-beam barn surrounded by apple orchards. Indoor and outdoor spaces; ceremony site in the orchard meadow. Rustic, garden, barn.</p>
<p>Our all-inclusive packages include dinner, a five-hour bar, tables, chairs, linens, a dance floor and a day-of coordinator.</p>
<h2>All-Inclusive Packages</h2>
<p>Peak season: May – October</p>
<table><tr><th>Guest count</th><th>Price</th></tr>
<tr><td>Up to 100 guests</td><td>All-inclusive package up to 100 guests: $24,000</td></tr>
<tr><td>101-150 guests</td><td>All-inclusive package 101-150 guests: $31,000</td></tr>
<tr><td>151-200 guests</td><td>All-inclusive package 151-200 guests: $37,500</td></tr></table>
<p>A 20% service charge and 8.125% sales tax apply.</p>
<p>Optional: Rehearsal dinner in the barn, $4,500 (optional add-on).</p>
<p>On-site accommodations: the farmhouse sleeps 10 guests.</p>
<p>Parking: free on-site parking for 100 cars. Accessible restrooms; barn is step-free.</p></div>`,
  },
  {
    file: 'booklet-seabright-pavilion.pdf',
    html: `<div class="page"><h1>Seabright Pavilion</h1><div class="sub">Long Island Sound · Event Guide</div>
<div class="hero"></div>
<p>A waterfront pavilion with a wraparound deck, accommodating up to 220 guests seated.</p>
<h2>Exclusive Use</h2>
<p>Saturday buyout: $42,000. Friday or Sunday buyout: $30,000.</p>
<p>Food &amp; beverage minimum of $25,000, inclusive of tax and service charge.</p>
<p>Plated dinner from $145 per person. Corkage $25 per person.</p>
<p>Security required: $65 per hour. Cleaning fee $750.</p>
<p>Pricing valid through 2027.</p></div>`,
  },
];

const scanned = {
  file: 'booklet-linden-barn-scanned.pdf',
  html: `<div style="padding:40px;font-family:Georgia;font-size:22px;line-height:1.5;color:#222;background:#f6f3ea;width:760px">
<h1 style="font-size:40px">Linden Barn</h1>
<p>Rental fee $7,500 Saturday</p><p>Rental fee $5,000 Friday</p>
<p>Seats 160 guests</p><p>Outside caterers welcome</p><p>events@lindenbarn.example</p></div>`,
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const b of booklets) {
  await page.setContent(`<html><head><style>${css}</style></head><body>${b.html}</body></html>`);
  await page.pdf({ path: new URL(b.file, OUT).pathname, format: 'Letter' });
  console.log('wrote', b.file);
}
// Scanned: rasterize to PNG, slightly rotated + noise, then embed the image only (no text layer).
await page.setViewportSize({ width: 840, height: 700 });
await page.setContent(`<html><body style="margin:0">${scanned.html}</body></html>`);
const png = await page.screenshot({ type: 'png', fullPage: true });
writeFileSync(new URL('linden-barn-scan.png', OUT), png);
await page.setContent(
  `<html><body style="margin:0"><img src="data:image/png;base64,${png.toString('base64')}" style="width:100%;transform:rotate(0.6deg);filter:grayscale(1) contrast(1.1)"></body></html>`,
);
await page.pdf({ path: new URL(scanned.file, OUT).pathname, format: 'Letter' });
console.log('wrote', scanned.file);
await browser.close();

// ── Messy spreadsheet A: title rows, merged section headers, blank rows, notes sheet ──
{
  const wb = XLSX.utils.book_new();
  const notes = XLSX.utils.aoa_to_sheet([
    ['Things to ask every venue:'],
    ['- rain plan'],
    ['- is there a curfew?'],
    [],
    ['Budget ~ $70k all in'],
  ]);
  XLSX.utils.book_append_sheet(wb, notes, 'Read me');
  const rows = [
    ['OUR VENUE SHORTLIST!!  (updated by Sam)'],
    [],
    ['last edit 9/14'],
    ['Venue', 'Neighborhood', 'Max Guests', 'Price', 'Indoor/Outdoor', 'Catering', 'Website', 'Our thoughts'],
    ['BROOKLYN', 'BROOKLYN', 'BROOKLYN', 'BROOKLYN', 'BROOKLYN', 'BROOKLYN', 'BROOKLYN', 'BROOKLYN'],
    [
      'Copper Kettle Works',
      'Greenpoint',
      '150 seated / 200 cocktail',
      '$150pp, $25k min Sat',
      'Indoor',
      'in-house',
      'https://copperkettle.example',
      'loved the windows, a bit loud',
    ],
    [
      'Mariner Hall',
      'Sunset Park',
      '220',
      'Site fee $12k + outside catering',
      'both',
      'outside ok',
      'www.marinerhall.example',
      '',
    ],
    [],
    ['MANHATTAN', 'MANHATTAN', 'MANHATTAN', 'MANHATTAN', 'MANHATTAN', 'MANHATTAN', 'MANHATTAN', 'MANHATTAN'],
    [
      'The Larkspur Rooms',
      'Flatiron',
      '180',
      '$38k F&B minimum Saturday, packages $185pp',
      'Indoor',
      'In house',
      '',
      'this is the one from the blog',
    ],
    [
      'Bellwether Club',
      'Murray Hill',
      '120 seated',
      'call for pricing',
      'Indoor',
      'In-house',
      '',
      'Mom’s friend got married here',
    ],
    ['', '', '', '', '', '', '', ''],
    [
      'Weatherby Garden',
      'Upper West Side',
      '90',
      '$120 per person; 20% service charge',
      'outdoor',
      'preferred list',
      '',
      'tiny but gorgeous',
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 7 } },
  ];
  // Merges only keep the top-left value in real files
  for (const r of [4, 8]) for (let c = 1; c < 8; c++) delete ws[XLSX.utils.encode_cell({ r, c })];
  for (let c = 1; c < 8; c++) delete ws[XLSX.utils.encode_cell({ r: 0, c })];
  XLSX.utils.book_append_sheet(wb, ws, 'Venues');
  const rej = XLSX.utils.aoa_to_sheet([
    ['Venue', 'Neighborhood', 'Max Guests', 'Price', 'Why not'],
    ['Pemberton Yacht Club', 'City Island', '100', '$200pp', 'too small'],
  ]);
  XLSX.utils.book_append_sheet(wb, rej, 'Rejected');
  writeFileSync(new URL('messy-venues-a.xlsx', OUT), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log('wrote messy-venues-a.xlsx');
}

// ── Messy spreadsheet B: header on row 2, typed price columns, percentages as decimals ──
{
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Wedding venues — Hudson Valley + CT', '', '', '', '', '', '', '', '', '', ''],
    [
      'Name of place',
      'Town',
      'Capacity (seated)',
      'Per person',
      'F&B min',
      'Site Fee',
      'Service %',
      'Contact email',
      'Status',
      'Rating',
      'Comments',
    ],
    [
      'Hawthorn Ridge Farm',
      'Hudson',
      200,
      '',
      '',
      '$14,000',
      '',
      'hello@hawthorn.example',
      'Toured',
      '4 stars',
      'barn + farmhouse, need tent',
    ],
    [
      'Blue Heron Inn',
      'Essex, CT',
      140,
      '$175',
      '$20,000',
      '',
      0.2,
      'events@blueheron.example',
      'Contacted',
      4,
      'Sunday discount?',
    ],
    [
      'Silverleaf Vineyard',
      'New Paltz',
      '180',
      '$140 Sun / $160 Sat',
      '',
      '$6,000',
      '21%',
      '',
      'researching',
      '',
      '',
    ],
    ['', '', '', '', '', '', '', '', '', '', ''],
    [
      'Willowmere Farm',
      'Hudson',
      '200',
      '',
      '',
      '18000',
      '',
      '',
      'Shortlisted',
      5,
      'dupe of the sample one?',
    ],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'HV + CT');
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['Name of place', 'Town', 'Capacity (seated)', 'Per person', 'Comments'],
    ['Gristmill Commons', 'Rhinebeck', 160, '$155', 'Mill on a creek'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Maybe');
  writeFileSync(new URL('messy-venues-b.xlsx', OUT), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log('wrote messy-venues-b.xlsx');
}

writeFileSync(
  new URL('simple-venues.csv', OUT),
  'Name,Town,Seated capacity,Pricing,Notes\nAmberly House,Montclair,150,"$135pp; $15,000 minimum",nice garden\nRiver Loft,Jersey City,200,"site fee $8,000",\n',
);
console.log('wrote simple-venues.csv');
