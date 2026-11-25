/**
 * Fictional sample venues for the global library.
 * Names, descriptions, contacts and prices are INVENTED. Coordinates are approximate town centers.
 * Never attach invented pricing to real venues.
 */
import type { GlobalVenue, VenueFields } from '../domain/types';
import type { AddonComponent, AddonType, Charges, DayOfWeek, PricingComponent, PricingRules, Rate, When } from '../lib/pricing/types';

const SAT: DayOfWeek[] = [6];
const FRI_SUN: DayOfWeek[] = [5, 0];
const WEEKDAY: DayOfWeek[] = [1, 2, 3, 4];
const PEAK = [5, 6, 9, 10];
const OFF = [1, 2, 3, 11];

let n = 0;
const id = (p: string) => `${p}${++n}`;
const r = (amount: number, when?: When, label?: string): Rate => ({ amount, ...(when ? { when } : {}), ...(label ? { label } : {}) });

const site = (rates: Rate[], label?: string): PricingComponent => ({ id: id('site'), kind: 'site_fee', rates, ...(label ? { label } : {}) });
const min = (rates: Rate[], inc: { sc?: boolean; tax?: boolean } = {}): PricingComponent => ({
  id: id('min'),
  kind: 'fnb_minimum',
  rates,
  includesServiceCharge: !!inc.sc,
  includesTax: !!inc.tax,
});
const pp = (name: string, rates: Rate[] | number, minGuests?: number): PricingComponent => ({
  id: id('pp'),
  kind: 'per_person',
  name,
  rates: typeof rates === 'number' ? [r(rates)] : rates,
  ...(minGuests ? { minGuests } : {}),
});
const tiers = (t: Array<[number | null, number | null, number]>, opts: { fnb?: boolean; when?: When } = {}): PricingComponent => ({
  id: id('tier'),
  kind: 'capacity_tier',
  category: opts.fnb ? 'fnb' : 'rental',
  includesFnb: !!opts.fnb,
  label: opts.fnb ? 'All-inclusive package' : 'Venue rental by guest count',
  rates: t.map(([lo, hi, amount]) => r(amount, { ...(opts.when ?? {}), ...(lo != null ? { guestMin: lo } : {}), ...(hi != null ? { guestMax: hi } : {}) })),
});
const buyout = (rates: Rate[], o: Partial<{ optional: boolean; includesFnb: boolean; replaces: Array<'site_fee' | 'fnb_minimum'> }> = {}): PricingComponent => ({
  id: id('buy'),
  kind: 'buyout',
  rates,
  optional: !!o.optional,
  includesFnb: !!o.includesFnb,
  replaces: o.replaces ?? ['site_fee', 'fnb_minimum'],
});
const addon = (name: string, addonType: AddonType, unit: AddonComponent['unit'], amount: number, required = true): PricingComponent => ({
  id: id('add'),
  kind: 'addon',
  name,
  addonType,
  unit,
  required,
  rates: [r(amount)],
});

interface Seed {
  name: string;
  area: string;
  region: string;
  lat: number;
  lng: number;
  type: string;
  styles: string[];
  setting: VenueFields['setting'];
  seated: number;
  standing: number;
  catering: VenueFields['cateringPolicy'];
  desc: string;
  ceremony?: boolean;
  accommodations?: boolean;
  hours?: number;
  curfew?: string;
  spaces?: VenueFields['spaces'];
  inclusions?: string[];
  extra?: Partial<VenueFields>;
  pricing: Omit<PricingRules, 'currency'>;
  asOf?: string;
}

const tax = (sc: number | null, extra: Partial<Charges> = {}): Charges => ({
  ...(sc == null ? {} : { serviceChargePct: sc }),
  taxPct: 8.875,
  ...extra,
});
const ctTax = (sc: number | null, extra: Partial<Charges> = {}): Charges => ({ ...(sc == null ? {} : { serviceChargePct: sc }), taxPct: 6.35, ...extra });
const njTax = (sc: number | null, extra: Partial<Charges> = {}): Charges => ({ ...(sc == null ? {} : { serviceChargePct: sc }), taxPct: 6.625, ...extra });
const liTax = (sc: number | null, extra: Partial<Charges> = {}): Charges => ({ ...(sc == null ? {} : { serviceChargePct: sc }), taxPct: 8.625, ...extra });
const hvTax = (sc: number | null, extra: Partial<Charges> = {}): Charges => ({ ...(sc == null ? {} : { serviceChargePct: sc }), taxPct: 8.125, ...extra });

const BASIC = ['Tables', 'Chairs', 'Linens', 'Flatware & glassware'];
const FULL = [...BASIC, 'AV / sound', 'Dance floor', 'Day-of coordinator', 'Bridal suite', 'Tasting', 'Cake cutting'];

const SEEDS: Seed[] = [
  // ───────────── Manhattan ─────────────
  {
    name: 'The Larkspur Rooms', area: 'Flatiron', region: 'Manhattan', lat: 40.7411, lng: -73.9897, type: 'Loft', styles: ['Loft', 'Modern', 'Industrial'], setting: 'indoor',
    seated: 180, standing: 260, catering: 'in_house', ceremony: true, hours: 5, curfew: 'Music ends at 12:00 am',
    desc: 'A sun-washed loft with fourteen-foot arched windows, blond oak floors and a hidden garden-level cocktail lounge.',
    spaces: [{ name: 'Main Loft', seated: 180, standing: 260 }, { name: 'Garden Lounge', seated: 60, standing: 90 }],
    inclusions: FULL,
    pricing: {
      seasons: { peakMonths: PEAK, offPeakMonths: OFF },
      hoursIncluded: 5, overtimePerHour: 2500,
      components: [
        min([r(45000, { days: SAT, season: 'peak' }), r(38000, { days: SAT }), r(28000, { days: FRI_SUN }), r(18000)]),
        pp('Classic', 185), pp('Signature', 225), pp('Grand', 275),
        addon('Ceremony fee', 'ceremony', 'flat', 3000),
      ],
      charges: tax(22, { adminFeePct: 3 }),
    },
  },
  {
    name: 'Halcyon Terrace', area: 'Midtown West', region: 'Manhattan', lat: 40.7605, lng: -73.9904, type: 'Rooftop', styles: ['Rooftop', 'Modern'], setting: 'both',
    seated: 150, standing: 240, catering: 'in_house', ceremony: true, hours: 5, curfew: 'Outdoor music until 10:30 pm',
    desc: 'A glass-wrapped penthouse and planted terrace forty floors up, with skyline views from every seat.',
    spaces: [{ name: 'Sky Room', seated: 150, standing: 240 }, { name: 'North Terrace', standing: 120 }],
    extra: { rainPlan: 'Retractable glass roof over the terrace; ceremony moves to the Sky Room.' },
    inclusions: [...FULL, 'Lighting'],
    pricing: {
      seasons: { peakMonths: PEAK, offPeakMonths: OFF },
      components: [
        min([r(60000, { days: SAT }), r(42000, { days: FRI_SUN }), r(30000, { days: WEEKDAY })]),
        pp('Terrace', [r(210, { guestMax: 119 }), r(195, { guestMin: 120 })]),
        pp('Skyline', [r(260, { guestMax: 119 }), r(240, { guestMin: 120 })]),
        addon('Terrace ceremony', 'ceremony', 'flat', 4500),
        addon('Security', 'security', 'per_hour', 85),
      ],
      charges: tax(23, { adminFeePct: 3 }),
    },
  },
  {
    name: 'Marlowe & Finch Library', area: 'Upper West Side', region: 'Manhattan', lat: 40.787, lng: -73.9754, type: 'Historic library', styles: ['Historic', 'Classic', 'Museum'], setting: 'indoor',
    seated: 140, standing: 220, catering: 'preferred_list', ceremony: true, hours: 6, curfew: 'Load-out by 1:00 am',
    desc: 'A Beaux-Arts reading room with a coffered ceiling, rolling ladders and a marble rotunda for the ceremony.',
    spaces: [{ name: 'Reading Room', seated: 140, standing: 220 }, { name: 'Rotunda', seated: 120 }],
    extra: { outsideCateringFee: 'Choose from 6 approved caterers; $2,000 kitchen fee' },
    inclusions: ['Tables', 'Chairs', 'Getting-ready rooms'],
    pricing: {
      components: [
        site([r(22000, { days: SAT }), r(16000, { days: FRI_SUN }), r(11000)]),
        addon('Kitchen & catering fee', 'other', 'flat', 2000),
        addon('Building security', 'security', 'flat', 1800),
        addon('Cleaning', 'cleaning', 'flat', 950),
      ],
      charges: tax(null),
    },
  },
  {
    name: 'Gilded Wren Ballroom', area: 'Upper East Side', region: 'Manhattan', lat: 40.7736, lng: -73.9566, type: 'Ballroom', styles: ['Ballroom', 'Classic'], setting: 'indoor',
    seated: 320, standing: 450, catering: 'in_house', ceremony: true, hours: 5, curfew: 'Midnight',
    desc: 'Mirrored walls, a gold-leaf dome and a sweeping double staircase made for grand entrances.',
    spaces: [{ name: 'Grand Ballroom', seated: 320, standing: 450 }, { name: 'Wren Salon', seated: 80, standing: 120 }],
    inclusions: [...FULL, 'Valet', 'Lighting'],
    pricing: {
      seasons: { peakMonths: PEAK, offPeakMonths: OFF },
      hoursIncluded: 5, overtimePerHour: 3500,
      components: [
        pp('Package A — Dinner', [r(195), r(215, { days: SAT, season: 'peak' })], 120),
        pp('Package B — Premium bar', [r(235), r(255, { days: SAT, season: 'peak' })], 120),
        pp('Package C — Luxe', [r(295), r(320, { days: SAT, season: 'peak' })], 120),
        addon('Ceremony fee', 'ceremony', 'flat', 3500),
        addon('Cake cutting', 'cake_cutting', 'per_person', 5),
      ],
      charges: tax(24),
    },
  },
  {
    name: 'Pier Nine Glasshouse', area: 'Chelsea', region: 'Manhattan', lat: 40.7465, lng: -74.0081, type: 'Waterfront pavilion', styles: ['Waterfront', 'Modern'], setting: 'both',
    seated: 300, standing: 500, catering: 'in_house', ceremony: true, hours: 6, curfew: '1:00 am',
    desc: 'A steel-and-glass pavilion on the Hudson with a wraparound deck and sunset over the river.',
    spaces: [{ name: 'Glasshouse', seated: 300, standing: 500 }, { name: 'River Deck', standing: 200 }],
    extra: { rainPlan: 'Ceremony moves inside the Glasshouse; deck is tented.' },
    inclusions: [...FULL, 'Lighting'],
    pricing: {
      seasons: { peakMonths: PEAK, offPeakMonths: OFF },
      components: [
        buyout([r(95000, { days: SAT, season: 'peak' }), r(80000, { days: SAT }), r(62000)], { includesFnb: true }),
        addon('Coat check', 'other', 'flat', 650),
      ],
      charges: tax(22, { serviceChargeBase: 'all' }),
    },
  },
  {
    name: 'The Ostrander', area: 'Tribeca', region: 'Manhattan', lat: 40.7163, lng: -74.0086, type: 'Restaurant', styles: ['Restaurant', 'Intimate', 'Modern'], setting: 'indoor',
    seated: 90, standing: 140, catering: 'in_house', ceremony: false, hours: 4, curfew: '11:30 pm',
    desc: 'A chef-driven dining room with a wood-burning hearth; buy out the whole restaurant for an intimate supper.',
    inclusions: [...BASIC, 'Tasting'],
    pricing: {
      components: [min([r(32000, { days: SAT }), r(24000, { days: FRI_SUN }), r(16000)], { sc: true, tax: true })],
      charges: tax(20),
      notes: 'Minimum is inclusive of tax and 20% service. Menu priced on request.',
    },
  },
  {
    name: 'Clementine Hall', area: 'West Village', region: 'Manhattan', lat: 40.7358, lng: -74.0036, type: 'Townhouse', styles: ['Intimate', 'Historic', 'Classic'], setting: 'both',
    seated: 110, standing: 160, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'An 1840s Greek Revival townhouse with a walled back garden, two parlors and candlelit fireplaces.',
    spaces: [{ name: 'Double Parlor', seated: 110 }, { name: 'Back Garden', standing: 80 }],
    inclusions: FULL,
    pricing: {
      components: [
        tiers([[null, 60, 28000], [61, 90, 38000], [91, 110, 46000]], { fnb: true }),
      ],
      charges: tax(0, { noServiceCharge: true, gratuityPct: 5 }),
      notes: 'All-inclusive: venue, dinner, 5-hour open bar, staffing. 5% suggested gratuity.',
    },
  },
  // ───────────── Brooklyn ─────────────
  {
    name: 'Ironwood Foundry', area: 'Gowanus', region: 'Brooklyn', lat: 40.6743, lng: -73.9902, type: 'Industrial warehouse', styles: ['Industrial', 'Loft', 'Modern'], setting: 'indoor',
    seated: 250, standing: 400, catering: 'outside_allowed', ceremony: true, hours: 10, curfew: '1:00 am',
    desc: 'A restored 1910 iron foundry with exposed trusses, a canal-side courtyard and room for a blank-canvas build-out.',
    extra: { outsideCateringFee: 'Any licensed caterer; $1,500 vendor fee', alcoholPolicy: 'Licensed bartending company required.' },
    inclusions: ['Tables', 'Chairs'],
    pricing: {
      components: [
        site([r(16000, { days: SAT }), r(12000, { days: FRI_SUN }), r(8000)]),
        addon('Outside vendor fee', 'other', 'flat', 1500),
        addon('Production manager', 'coordinator', 'per_hour', 95),
      ],
      charges: tax(null),
    },
  },
  {
    name: 'Bramble & Bay', area: 'Red Hook', region: 'Brooklyn', lat: 40.6759, lng: -74.0142, type: 'Garden & warehouse', styles: ['Waterfront', 'Garden', 'Industrial'], setting: 'both',
    seated: 200, standing: 300, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A brick waterfront warehouse opening onto a wild garden pier with Statue of Liberty views.',
    extra: { rainPlan: 'Clear-top tent over the pier at no charge.' },
    inclusions: FULL,
    pricing: {
      seasons: { peakMonths: [5, 6, 7, 8, 9, 10], offPeakMonths: [1, 2, 3] },
      components: [
        site([r(14000, { season: 'peak' }), r(9000), r(6000, { season: 'off_peak' })]),
        pp('Family style', 165), pp('Seated dinner', 190),
      ],
      charges: tax(22),
    },
  },
  {
    name: 'The Atlas Greenhouse', area: 'Williamsburg', region: 'Brooklyn', lat: 40.7081, lng: -73.9571, type: 'Greenhouse', styles: ['Garden', 'Modern', 'Bohemian'], setting: 'both',
    seated: 160, standing: 220, catering: 'in_house', ceremony: true, hours: 5, curfew: '11:00 pm outdoors',
    desc: 'A Victorian-style glass greenhouse filled with trailing jasmine and citrus trees, with a rooftop for cocktails.',
    inclusions: FULL,
    pricing: {
      components: [
        pp('Greenhouse package', [r(235, { guestMax: 99 }), r(205, { guestMin: 100, guestMax: 139 }), r(189, { guestMin: 140 })], 75),
        min([r(26000, { days: SAT }), r(18000)]),
      ],
      charges: tax(21),
      notes: 'Per-person rate drops at 100 and 140 guests.',
    },
  },
  {
    name: 'Prospect Conservatory', area: 'Park Slope', region: 'Brooklyn', lat: 40.6721, lng: -73.977, type: 'Historic conservatory', styles: ['Historic', 'Garden', 'Classic'], setting: 'both',
    seated: 175, standing: 250, catering: 'preferred_list', ceremony: true, hours: 6,
    desc: 'A limestone pavilion with a vaulted glass palm house and formal lawn at the edge of the park.',
    extra: { outsideCateringFee: 'Preferred list of 4 caterers' },
    inclusions: ['Tables', 'Chairs', 'Getting-ready rooms'],
    pricing: {
      seasons: { peakMonths: PEAK },
      components: [site([r(18500, { season: 'peak' }), r(13500)]), addon('Lawn ceremony', 'ceremony', 'flat', 2000, false)],
      charges: tax(null),
    },
  },
  {
    name: 'Kingsbridge Social', area: 'DUMBO', region: 'Brooklyn', lat: 40.7033, lng: -73.9881, type: 'Loft', styles: ['Loft', 'Industrial', 'Rooftop'], setting: 'both',
    seated: 220, standing: 350, catering: 'in_house', ceremony: true, hours: 5, curfew: 'Midnight',
    desc: 'A cobblestone-street loft framed by the Manhattan Bridge with a private roof deck.',
    inclusions: FULL,
    pricing: {
      hoursIncluded: 5, overtimePerHour: 3000,
      components: [
        site([r(10000, { days: SAT }), r(7500)]),
        min([r(35000, { days: SAT }), r(25000)]),
        pp('Cocktail-style', 175), pp('Plated', 205),
        buyout([r(75000, { days: SAT }), r(58000)], { optional: true, replaces: ['site_fee', 'fnb_minimum'] }),
      ],
      charges: tax(22),
      notes: 'Full-building buyout available (adds roof deck).',
    },
  },
  {
    name: 'Heron Hall', area: 'Bushwick', region: 'Brooklyn', lat: 40.6944, lng: -73.9213, type: 'Event hall', styles: ['Industrial', 'Bohemian', 'Modern'], setting: 'indoor',
    seated: 200, standing: 320, catering: 'in_house', ceremony: true, hours: 6,
    desc: 'A sky-lit former textile mill with a velvet lounge, mural wall and a natural-wine bar.',
    inclusions: FULL,
    pricing: {
      components: [
        tiers([[null, 100, 36000], [101, 150, 48000], [151, 200, 59000]], { fnb: true, when: { days: SAT } }),
        tiers([[null, 100, 29000], [101, 150, 39000], [151, 200, 48000]], { fnb: true, when: { days: [0, 1, 2, 3, 4, 5] } }),
      ],
      charges: tax(20),
    },
  },
  // ───────────── Hudson Valley ─────────────
  {
    name: 'Willowmere Farm', area: 'Hudson', region: 'Hudson Valley', lat: 42.2529, lng: -73.791, type: 'Barn', styles: ['Barn', 'Rustic', 'Garden'], setting: 'both',
    seated: 200, standing: 260, catering: 'outside_allowed', ceremony: true, accommodations: true, hours: 10, curfew: '11:00 pm',
    desc: 'A 200-year-old dairy barn, orchard ceremony meadow and farmhouse for twelve overnight guests.',
    extra: { accommodationsNotes: 'Farmhouse sleeps 12; 2-night minimum on peak weekends.', parking: 'Free on-site parking for 120 cars' },
    inclusions: ['Tables', 'Chairs', 'Getting-ready rooms'],
    pricing: {
      seasons: { peakMonths: [6, 7, 8, 9, 10], offPeakMonths: [11, 12, 1, 2, 3, 4] },
      components: [
        site([r(18000, { season: 'peak', days: SAT }), r(14000, { season: 'peak' }), r(9000)]),
        addon('Cleaning', 'cleaning', 'flat', 1200),
        addon('Security', 'security', 'flat', 900),
        addon('Restroom trailer', 'rentals', 'flat', 2400),
      ],
      charges: hvTax(null),
    },
  },
  {
    name: 'Wrenfield Estate', area: 'Rhinebeck', region: 'Hudson Valley', lat: 41.9268, lng: -73.9126, type: 'Estate', styles: ['Estate', 'Classic', 'Garden'], setting: 'both',
    seated: 180, standing: 250, catering: 'in_house', ceremony: true, accommodations: true, hours: 6,
    desc: 'A Georgian mansion on 80 acres with formal gardens, a reflecting pool and 22 guest rooms.',
    extra: { accommodationsNotes: '22 rooms included with the weekend buyout (Fri–Sun).' },
    inclusions: [...FULL, 'Valet'],
    pricing: {
      seasons: { peakMonths: [5, 6, 7, 8, 9, 10] },
      components: [
        buyout([r(48000, { season: 'peak' }), r(36000)], { replaces: ['site_fee'] }),
        pp('Estate dinner', 210),
      ],
      charges: hvTax(22),
      notes: 'Weekend buyout includes Friday welcome space and 22 rooms for two nights.',
    },
  },
  {
    name: 'Aldergrove Vineyard', area: 'New Paltz', region: 'Hudson Valley', lat: 41.7476, lng: -74.0868, type: 'Vineyard', styles: ['Vineyard', 'Rustic', 'Garden'], setting: 'both',
    seated: 220, standing: 300, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'Rolling vines facing the Shawangunk Ridge, a stone tasting barn and a hilltop ceremony site.',
    inclusions: [...FULL],
    pricing: {
      hoursIncluded: 5, overtimePerHour: 1500,
      components: [
        site([r(8500, { days: SAT }), r(6000)]),
        pp('Harvest', 145), pp('Reserve', 175),
        addon('Cake cutting', 'cake_cutting', 'per_person', 3.5),
      ],
      charges: hvTax(20),
    },
  },
  {
    name: 'The Saltbox at Kinderhook', area: 'Kinderhook', region: 'Hudson Valley', lat: 42.3953, lng: -73.6982, type: 'Barn', styles: ['Barn', 'Rustic', 'Intimate'], setting: 'both',
    seated: 120, standing: 160, catering: 'in_house', ceremony: true, hours: 6,
    desc: 'A whitewashed saltbox barn with a fire pit, string lights and a pond-side ceremony dock.',
    inclusions: FULL,
    pricing: {
      components: [tiers([[null, 75, 24000], [76, 100, 29500], [101, 120, 34000]], { fnb: true })],
      charges: hvTax(20),
    },
  },
  {
    name: 'Fernhill Manor', area: 'Cold Spring', region: 'Hudson Valley', lat: 41.4201, lng: -73.9546, type: 'Manor house', styles: ['Historic', 'Estate', 'Classic'], setting: 'both',
    seated: 160, standing: 220, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A riverfront manor with a slate terrace overlooking the Hudson Highlands.',
    asOf: '2024-03-01',
    inclusions: FULL,
    pricing: {
      components: [site([r(7500)]), min([r(28000, { days: SAT }), r(20000)]), pp('Manor dinner', 168)],
      charges: hvTax(21),
    },
  },
  {
    name: 'Quarry Lake Lodge', area: 'Kerhonkson', region: 'Hudson Valley', lat: 41.7745, lng: -74.2985, type: 'Lodge', styles: ['Rustic', 'Bohemian', 'Waterfront'], setting: 'both',
    seated: 150, standing: 200, catering: 'in_house', ceremony: true, accommodations: true, hours: 6,
    desc: 'A mid-century lodge on a spring-fed quarry lake with cabins, a sauna and a lakeside ceremony lawn.',
    extra: { accommodationsNotes: '18 cabins sleep 60 guests.' },
    inclusions: [...FULL, 'Getting-ready rooms'],
    pricing: {
      components: [
        buyout([r(42000), r(52000, { days: SAT }), r(60000, { dates: ['2027-07-03', '2027-09-04', '2027-10-09'] }, 'Holiday weekend')], { includesFnb: false }),
        pp('Lodge supper', 135),
      ],
      charges: hvTax(20),
      notes: 'Holiday weekends priced higher.',
    },
  },
  {
    name: 'Thornfield Orchard', area: 'Germantown', region: 'Hudson Valley', lat: 42.1348, lng: -73.8918, type: 'Orchard', styles: ['Rustic', 'Garden', 'Bohemian'], setting: 'outdoor',
    seated: 180, standing: 220, catering: 'outside_allowed', ceremony: true, hours: 8,
    desc: 'An heirloom apple orchard with a sailcloth tent site and long-table dinners under the trees.',
    extra: { rainPlan: 'Tent required (not included).' },
    inclusions: [],
    pricing: {
      components: [site([r(9500)]), addon('Tent rental (required)', 'rentals', 'flat', 12000)],
    },
  },
  // ───────────── Long Island ─────────────
  {
    name: 'Saltmarsh Inn', area: 'Shelter Island', region: 'Long Island', lat: 41.0682, lng: -72.3387, type: 'Inn', styles: ['Waterfront', 'Beach', 'Intimate'], setting: 'both',
    seated: 140, standing: 180, catering: 'in_house', ceremony: true, accommodations: true, hours: 5,
    desc: 'A shingle-style inn on a quiet harbor with a sunset lawn and a 30-room guest block.',
    inclusions: FULL,
    pricing: {
      seasons: { peakMonths: [6, 7, 8, 9] },
      components: [
        pp('Harbor', [r(225, { season: 'peak' }), r(185)]),
        pp('Clambake', [r(195, { season: 'peak' }), r(160)]),
        site([r(12000, { season: 'peak' }), r(6000)]),
      ],
      charges: liTax(22),
    },
  },
  {
    name: 'Oyster Point Pavilion', area: 'Oyster Bay', region: 'Long Island', lat: 40.8715, lng: -73.532, type: 'Pavilion', styles: ['Waterfront', 'Classic'], setting: 'both',
    seated: 260, standing: 350, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A white clapboard pavilion on the Sound with a lighthouse-view ceremony pier.',
    inclusions: FULL,
    pricing: {
      components: [tiers([[null, 125, 32000], [126, 175, 41000], [176, 225, 49000], [226, 260, 56000]], { fnb: true })],
      charges: liTax(20),
    },
  },
  {
    name: 'Northfork Cellars Barn', area: 'Cutchogue', region: 'Long Island', lat: 41.0107, lng: -72.4851, type: 'Vineyard', styles: ['Vineyard', 'Barn', 'Rustic'], setting: 'both',
    seated: 200, standing: 260, catering: 'preferred_list', ceremony: true, hours: 6,
    desc: 'A post-and-beam barn in the vines with a wine-cave cocktail hour.',
    extra: { alcoholPolicy: 'Estate wines only; beer & spirits through the venue.' },
    inclusions: ['Tables', 'Chairs', 'Bridal suite'],
    pricing: {
      components: [
        site([r(15000, { days: SAT }), r(10000)]),
        addon('Estate wine & beer bar', 'bar', 'per_person', 55),
      ],
      charges: liTax(null),
    },
  },
  {
    name: 'The Calloway Club', area: 'Garden City', region: 'Long Island', lat: 40.7268, lng: -73.6343, type: 'Country club', styles: ['Ballroom', 'Classic'], setting: 'both',
    seated: 350, standing: 450, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A Tudor clubhouse with a chandeliered ballroom and putting-green ceremony lawn.',
    inclusions: [...FULL, 'Valet'],
    pricing: {
      components: [
        pp('Club package', [r(165, { days: SAT }), r(140, { days: FRI_SUN }), r(120)], 100),
        pp('Platinum package', [r(205, { days: SAT }), r(180, { days: FRI_SUN }), r(155)], 100),
        addon('Ceremony on the green', 'ceremony', 'flat', 1500, false),
      ],
      charges: liTax(20, { adminFeePct: 2 }),
    },
  },
  {
    name: 'Dune & Daisy', area: 'Amagansett', region: 'Long Island', lat: 40.9737, lng: -72.1437, type: 'Beach estate', styles: ['Beach', 'Bohemian', 'Waterfront'], setting: 'outdoor',
    seated: 150, standing: 200, catering: 'outside_allowed', ceremony: true, hours: 8, curfew: '10:00 pm (town ordinance)',
    desc: 'A private oceanfront lawn behind the dunes — bring your own tent, caterer and barefoot dance floor.',
    inclusions: [],
    pricing: {
      asOf: '2026-01-15',
      components: [site([r(30000)]), addon('Beach permit & insurance', 'other', 'flat', 1800)],
    },
  },
  // ───────────── New Jersey ─────────────
  {
    name: 'Ridgeview Pavilion', area: 'Montclair', region: 'New Jersey', lat: 40.8259, lng: -74.209, type: 'Pavilion', styles: ['Garden', 'Modern'], setting: 'both',
    seated: 240, standing: 320, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A glass pavilion on the First Mountain ridge with Manhattan skyline views at dusk.',
    inclusions: FULL,
    pricing: {
      components: [pp('Pavilion', 145), pp('Ridge', 170), pp('Summit', 199), site([r(4000)], 'Ceremony & room fee')],
      charges: njTax(20),
    },
  },
  {
    name: 'The Linden Conservatory', area: 'Princeton', region: 'New Jersey', lat: 40.3573, lng: -74.6672, type: 'Conservatory', styles: ['Garden', 'Classic', 'Historic'], setting: 'both',
    seated: 180, standing: 240, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'An Edwardian conservatory surrounded by linden allées and a sunken rose garden.',
    inclusions: FULL,
    pricing: {
      seasons: { peakMonths: PEAK },
      components: [
        tiers([[null, 100, 27000], [101, 150, 34000], [151, 180, 39500]], { fnb: true, when: { season: 'peak' } }),
        tiers([[null, 100, 22000], [101, 150, 28500], [151, 180, 33000]], { fnb: true, when: { season: 'standard' } }),
      ],
      charges: njTax(20),
    },
  },
  {
    name: 'Harborlight Hall', area: 'Jersey City', region: 'New Jersey', lat: 40.7178, lng: -74.0431, type: 'Waterfront loft', styles: ['Waterfront', 'Modern', 'Loft'], setting: 'indoor',
    seated: 280, standing: 400, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'Floor-to-ceiling windows framing the Lower Manhattan skyline across the river.',
    inclusions: [...FULL, 'Lighting'],
    pricing: {
      components: [
        min([r(40000, { days: SAT }), r(28000), r(65000, { dates: ['2027-12-31'] }, "New Year's Eve")]),
        pp('Skyline dinner', 175), pp('Harbor premium', 215),
      ],
      charges: njTax(22),
    },
  },
  {
    name: 'Birchwood Mill', area: 'Frenchtown', region: 'New Jersey', lat: 40.5262, lng: -75.0616, type: 'Mill', styles: ['Rustic', 'Historic', 'Waterfront'], setting: 'both',
    seated: 170, standing: 220, catering: 'preferred_list', ceremony: true, hours: 8,
    desc: 'A stone grist mill on the Delaware with a waterwheel terrace and loft for dancing.',
    inclusions: ['Tables', 'Chairs', 'Getting-ready rooms'],
    pricing: {
      components: [site([r(11000, { days: SAT }), r(7500)]), addon('Venue coordinator', 'coordinator', 'flat', 1500)],
      charges: njTax(null),
    },
  },
  {
    name: 'Cape Laurel Inn', area: 'Cape May', region: 'New Jersey', lat: 38.9351, lng: -74.906, type: 'Victorian inn', styles: ['Beach', 'Historic', 'Classic'], setting: 'both',
    seated: 160, standing: 220, catering: 'in_house', ceremony: true, accommodations: true, hours: 5,
    desc: 'A wraparound-porch Victorian a block from the beach, with 40 rooms for your guests.',
    inclusions: FULL,
    pricing: {
      seasons: { peakMonths: [6, 7, 8, 9] },
      components: [pp('Seaside', [r(175, { season: 'peak' }), r(145)]), min([r(30000, { season: 'peak', days: SAT }), r(18000)])],
      charges: njTax(21),
    },
  },
  {
    name: 'Mercer Grand Hotel', area: 'New Brunswick', region: 'New Jersey', lat: 40.4862, lng: -74.4518, type: 'Hotel ballroom', styles: ['Ballroom', 'Modern'], setting: 'indoor',
    seated: 400, standing: 550, catering: 'in_house', ceremony: true, accommodations: true, hours: 5,
    desc: 'A modern hotel ballroom with a 400-seat capacity and a discounted room block.',
    inclusions: [...FULL, 'Valet'],
    pricing: {
      components: [
        pp('Silver', [r(130), r(150, { days: SAT })], 150),
        pp('Gold', [r(155), r(175, { days: SAT })], 150),
        addon('Ceremony room', 'ceremony', 'flat', 1800, false),
      ],
      charges: njTax(22, { adminFeePct: 3 }),
    },
  },
  // ───────────── Connecticut ─────────────
  {
    name: 'Hollis Lake Estate', area: 'Litchfield', region: 'Connecticut', lat: 41.7473, lng: -73.1887, type: 'Estate', styles: ['Estate', 'Waterfront', 'Classic'], setting: 'both',
    seated: 200, standing: 260, catering: 'in_house', ceremony: true, accommodations: true, hours: 6,
    desc: 'A lakeside estate with a boathouse, rolling lawns and a stone chapel.',
    inclusions: FULL,
    pricing: {
      components: [
        site([r(14000, { days: SAT }), r(9000)]),
        pp('Lakeside', 180),
        buyout([r(55000)], { optional: true, replaces: ['site_fee'] }),
      ],
      charges: ctTax(20),
    },
  },
  {
    name: 'Greywater Boathouse', area: 'Mystic', region: 'Connecticut', lat: 41.3543, lng: -71.9665, type: 'Boathouse', styles: ['Waterfront', 'Rustic', 'Historic'], setting: 'both',
    seated: 150, standing: 200, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A restored 19th-century boathouse on the river with a dock for ceremonies at high tide.',
    inclusions: FULL,
    pricing: { components: [site([r(6500)]), pp('Shoreline', 155), pp('Captain', 185)], charges: ctTax(20) },
  },
  {
    name: 'Cobblestone Carriage House', area: 'Greenwich', region: 'Connecticut', lat: 41.0262, lng: -73.6282, type: 'Carriage house', styles: ['Historic', 'Intimate', 'Garden'], setting: 'both',
    seated: 120, standing: 160, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A brick carriage house with a cobbled courtyard, wisteria arbor and a cozy hayloft bar.',
    inclusions: FULL,
    pricing: { components: [site([r(9000)]), min([r(26000, { days: SAT }), r(19000)])], charges: ctTax(21) },
  },
  {
    name: 'The Meadowlark Barn', area: 'Washington', region: 'Connecticut', lat: 41.6315, lng: -73.3104, type: 'Barn', styles: ['Barn', 'Rustic', 'Garden'], setting: 'both',
    seated: 180, standing: 220, catering: 'outside_allowed', ceremony: true, hours: 10,
    desc: 'A timber-frame barn in hayfields with a wildflower meadow ceremony site.',
    inclusions: ['Tables', 'Chairs'],
    pricing: { components: [site([r(12500, { days: SAT }), r(8500)])], charges: ctTax(null) },
  },
  {
    name: 'Copperbeech Hall', area: 'New Haven', region: 'Connecticut', lat: 41.3083, lng: -72.9279, type: 'University hall', styles: ['Historic', 'Classic'], setting: 'indoor',
    seated: 220, standing: 300, catering: 'preferred_list', ceremony: true, hours: 6,
    desc: 'A collegiate Gothic hall with stained glass and a minstrels’ gallery. Pricing available on request.',
    inclusions: ['Tables', 'Chairs'],
    pricing: { components: [] },
  },
  // ───────────── Westchester & Queens ─────────────
  {
    name: 'Sparrow Hill House', area: 'Tarrytown', region: 'Westchester', lat: 41.0762, lng: -73.8587, type: 'Mansion', styles: ['Estate', 'Historic', 'Garden'], setting: 'both',
    seated: 200, standing: 280, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A Hudson River mansion with terraced gardens and a pergola that glows at golden hour.',
    inclusions: FULL,
    pricing: {
      seasons: { peakMonths: PEAK, offPeakMonths: OFF },
      components: [
        site([r(12000, { season: 'peak' }), r(8000), r(5000, { season: 'off_peak' })]),
        min([r(30000, { days: SAT, season: 'peak' }), r(22000)]),
        pp('Garden dinner', 178),
      ],
      charges: tax(22, { taxPct: 8.375 }),
    },
  },
  {
    name: 'Ferrous & Fern', area: 'Long Island City', region: 'Queens', lat: 40.7447, lng: -73.9485, type: 'Industrial loft', styles: ['Industrial', 'Modern', 'Rooftop'], setting: 'both',
    seated: 160, standing: 250, catering: 'in_house', ceremony: true, hours: 5,
    desc: 'A plant-filled factory loft with a roof garden staring straight at the Midtown skyline.',
    inclusions: FULL,
    pricing: {
      components: [
        site([r(7000, { days: SAT }), r(4500)]),
        pp('Loft dinner', [r(165, { guestMax: 120 }), r(150, { guestMin: 121 })]),
        addon('Roof access', 'other', 'flat', 2500, false),
      ],
      charges: tax(20),
    },
  },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const DEFAULT_AS_OF = '2026-09-01';

export const SAMPLE_LICENSE =
  'Fictional sample data created for demonstration. Names, contacts and prices are invented and do not describe any real venue.';

export function buildSeedVenues(): GlobalVenue[] {
  return SEEDS.map((s, i) => {
    const slug = slugify(s.name);
    const asOf = s.pricing.asOf ?? s.asOf ?? DEFAULT_AS_OF;
    const fields: VenueFields = {
      name: s.name,
      description: s.desc,
      address: `${100 + ((i * 37) % 800)} ${['Harbor', 'Mill', 'Orchard', 'Linden', 'Bank', 'Water', 'Park', 'Garden'][i % 8]} Street, ${s.area}`,
      area: s.area,
      region: s.region,
      lat: s.lat,
      lng: s.lng,
      website: `https://example.com/sample/${slug}`,
      contactName: 'Events Team (sample)',
      contactEmail: `events@${slug}.example`,
      venueType: s.type,
      styleTags: s.styles,
      setting: s.setting,
      spaces: s.spaces ?? [{ name: 'Main space', seated: s.seated, standing: s.standing }],
      capacitySeated: s.seated,
      capacityStanding: s.standing,
      ceremonyOnSite: s.ceremony ?? false,
      cateringPolicy: s.catering,
      alcoholPolicy: s.catering === 'outside_allowed' ? 'Licensed bartender required; BYO alcohol permitted.' : 'In-house bar packages only.',
      hoursIncluded: s.hours,
      accommodations: s.accommodations ?? false,
      parking: s.region === 'Manhattan' || s.region === 'Brooklyn' ? 'Street parking & nearby garages' : 'On-site parking',
      accessibility: i % 5 === 3 ? 'Ceremony site has gravel paths; main hall is step-free' : 'Step-free access; accessible restrooms',
      noiseCurfew: s.curfew,
      depositPolicy: i % 3 === 0 ? '30% non-refundable retainer to book' : '50% deposit at signing',
      paymentSchedule: 'Balance due 30 days before the event.',
      cancellationPolicy: i % 2 === 0 ? 'Deposits are non-refundable; date may be moved once within 12 months.' : 'Tiered refunds up to 180 days out.',
      inclusions: s.inclusions ?? BASIC,
      photos: [],
      ...s.extra,
    };
    if (s.pricing.hoursIncluded == null && s.hours) s.pricing.hoursIncluded = s.hours;
    const pricing: PricingRules = { currency: 'USD', ...s.pricing, asOf };
    return {
      id: `sample-${slug}`,
      slug,
      fields,
      pricing,
      provenance: { source: 'Sample data (fictional)', license: SAMPLE_LICENSE, pricingAsOf: asOf },
      isSample: true,
      published: true,
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    };
  });
}

/** Synthetic records for performance testing (?stress=2000). */
export function buildStressVenues(count: number): GlobalVenue[] {
  const base = buildSeedVenues();
  const out: GlobalVenue[] = [];
  for (let i = 0; i < count; i++) {
    const b = base[i % base.length];
    const jitter = (k: number) => ((Math.sin(i * 12.9898 + k) * 43758.5453) % 1) * 0.15;
    out.push({
      ...b,
      id: `stress-${i}`,
      fields: { ...b.fields, name: `${b.fields.name} ${Math.floor(i / base.length) + 1}`, lat: (b.fields.lat ?? 40.7) + jitter(1), lng: (b.fields.lng ?? -74) + jitter(2) },
    });
  }
  return out;
}
