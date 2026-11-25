import { describe, expect, it } from 'vitest';
import { estimate, evaluateScenario, isStale, pickRate, seasonOf, OUTSIDE_CATERING_PP } from './engine';
import { sanitizePricing } from './sanitize';
import type { EstimateContext, PricingRules } from './types';

const NOW = new Date('2026-11-01T00:00:00Z');
const ctx = (o: Partial<EstimateContext> = {}): EstimateContext => ({ guests: 100, date: '2027-06-12', now: NOW, ...o }); // 2027-06-12 is a Saturday
const noTax = { taxPct: 0 };
const line = (e: ReturnType<typeof estimate>, key: string) => e.lines.find((l) => l.key === key)?.amount;

describe('pricing engine — single structures', () => {
  it('1. flat site fee only adds estimated outside catering and is Rough', () => {
    const e = estimate({ components: [{ id: 's', kind: 'site_fee', rates: [{ amount: 10000 }] }], charges: noTax }, ctx());
    expect(line(e, 's')).toBe(10000);
    expect(line(e, 'catering-estimate')).toBe(100 * OUTSIDE_CATERING_PP.base);
    expect(e.total).toBe(10000 + 16500);
    expect(e.confidence).toBe('rough');
    expect(e.low).toBe(10000 + 12500);
    expect(e.high).toBe(10000 + 22500);
  });

  it('2. site fee varies by day of week (Saturday vs Friday)', () => {
    const rules: PricingRules = {
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 8000 }, { amount: 12000, when: { days: [6] } }] },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
      ],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    expect(line(estimate(rules, ctx()), 's')).toBe(12000);
    expect(line(estimate(rules, ctx({ date: '2027-06-11' })), 's')).toBe(8000); // Friday
  });

  it('3. site fee varies by season (peak months)', () => {
    const rules: PricingRules = {
      seasons: { peakMonths: [5, 6, 9, 10], offPeakMonths: [1, 2, 3] },
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 9000 }, { amount: 15000, when: { season: 'peak' } }, { amount: 5000, when: { season: 'off_peak' } }] },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
      ],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    expect(line(estimate(rules, ctx()), 's')).toBe(15000);
    expect(line(estimate(rules, ctx({ date: '2027-02-13' })), 's')).toBe(5000);
    expect(line(estimate(rules, ctx({ date: '2027-08-14' })), 's')).toBe(9000);
    expect(seasonOf(6, rules)).toBe('peak');
  });

  it('4. specific-date override beats day and season rates', () => {
    const rules: PricingRules = {
      components: [
        {
          id: 's',
          kind: 'site_fee',
          rates: [{ amount: 9000 }, { amount: 12000, when: { days: [6] } }, { amount: 20000, when: { dates: ['2027-06-12'] } }],
        },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
      ],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    expect(line(estimate(rules, ctx()), 's')).toBe(20000);
  });

  it('5. time slot pricing: daytime is cheaper when chosen', () => {
    const rules: PricingRules = {
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 12000, when: { timeSlot: 'evening' } }, { amount: 7000, when: { timeSlot: 'day' } }] },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
      ],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    expect(line(estimate(rules, ctx()), 's')).toBe(12000);
    expect(line(estimate(rules, ctx({ timeSlot: 'day' })), 's')).toBe(7000);
  });

  it('6. per-person package only: guests × price, Complete when charges stated', () => {
    const rules: PricingRules = {
      components: [{ id: 'p', kind: 'per_person', name: 'Classic', rates: [{ amount: 150 }] }],
      charges: { serviceChargePct: 22, taxPct: 8.875 },
    };
    const e = estimate(rules, ctx({ guests: 120 }));
    expect(line(e, 'p')).toBe(18000);
    expect(line(e, 'service')).toBe(3960);
    expect(line(e, 'tax')).toBeCloseTo((18000 + 3960) * 0.08875, 2);
    expect(e.confidence).toBe('complete');
    expect(e.perGuest).toBe(Math.round(e.total! / 120));
  });

  it('7. per-person price varies by guest-count range', () => {
    const rules: PricingRules = {
      components: [
        {
          id: 'p',
          kind: 'per_person',
          name: 'Tiered',
          rates: [
            { amount: 200, when: { guestMax: 99 } },
            { amount: 175, when: { guestMin: 100, guestMax: 149 } },
            { amount: 160, when: { guestMin: 150 } },
          ],
        },
      ],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    expect(line(estimate(rules, ctx({ guests: 80 })), 'p')).toBe(16000);
    expect(line(estimate(rules, ctx({ guests: 120 })), 'p')).toBe(21000);
    expect(line(estimate(rules, ctx({ guests: 180 })), 'p')).toBe(28800);
  });

  it('8. multiple packages: defaults to cheapest, range spans packages, choice respected', () => {
    const rules: PricingRules = {
      components: [
        { id: 'a', kind: 'per_person', name: 'Package A', rates: [{ amount: 120 }] },
        { id: 'b', kind: 'per_person', name: 'Package B', rates: [{ amount: 160 }] },
        { id: 'c', kind: 'per_person', name: 'Package C', rates: [{ amount: 210 }] },
      ],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    const e = estimate(rules, ctx());
    expect(e.total).toBe(12000);
    expect(e.low).toBe(12000);
    expect(e.high).toBe(21000);
    expect(e.assumptions.join(' ')).toMatch(/lowest-priced package \(Package A\)/);
    expect(estimate(rules, ctx({ packageId: 'b' })).total).toBe(16000);
    expect(estimate(rules, ctx({ packageId: 'b' })).high).toBe(16000);
  });

  it('9. package guest minimum bills at least the minimum', () => {
    const rules: PricingRules = {
      components: [{ id: 'p', kind: 'per_person', name: 'Min 120', minGuests: 120, rates: [{ amount: 100 }] }],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    const e = estimate(rules, ctx({ guests: 90 }));
    expect(line(e, 'p')).toBe(12000);
    expect(e.perGuest).toBe(Math.round(12000 / 90));
  });

  it('10. capacity-tier flat pricing picks the right tier', () => {
    const rules: PricingRules = {
      components: [
        {
          id: 't',
          kind: 'capacity_tier',
          category: 'fnb',
          includesFnb: true,
          rates: [
            { amount: 25000, when: { guestMax: 100 } },
            { amount: 32000, when: { guestMin: 101, guestMax: 150 } },
            { amount: 38000, when: { guestMin: 151, guestMax: 200 } },
          ],
        },
      ],
      charges: { serviceChargePct: 20, taxPct: 0 },
    };
    expect(line(estimate(rules, ctx({ guests: 100 })), 't')).toBe(25000);
    expect(line(estimate(rules, ctx({ guests: 101 })), 't')).toBe(32000);
    expect(line(estimate(rules, ctx({ guests: 175 })), 't')).toBe(38000);
    expect(estimate(rules, ctx({ guests: 175 })).confidence).toBe('complete');
  });

  it('11. capacity tier: guest count above all tiers uses top tier and flags it', () => {
    const rules: PricingRules = {
      components: [{ id: 't', kind: 'capacity_tier', includesFnb: true, rates: [{ amount: 20000, when: { guestMax: 100 } }, { amount: 26000, when: { guestMin: 101, guestMax: 150 } }] }],
      charges: noTax,
    };
    const e = estimate(rules, ctx({ guests: 180 }));
    expect(line(e, 't')).toBe(26000);
    expect(e.confidence).toBe('rough');
    expect(e.missing.join(' ')).toMatch(/exceeds the largest pricing tier/);
  });

  it('12. required full buyout replaces site fee and minimum', () => {
    const rules: PricingRules = {
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 9000 }] },
        { id: 'm', kind: 'fnb_minimum', rates: [{ amount: 40000 }] },
        { id: 'b', kind: 'buyout', rates: [{ amount: 60000 }], replaces: ['site_fee', 'fnb_minimum'], includesFnb: true },
      ],
      charges: noTax,
    };
    const e = estimate(rules, ctx());
    expect(line(e, 'b')).toBe(60000);
    expect(line(e, 's')).toBeUndefined();
    expect(line(e, 'fnb-minimum')).toBeUndefined();
    expect(e.total).toBe(60000);
  });

  it('13. optional buyout only applies when the user opts in', () => {
    const rules: PricingRules = {
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 9000 }] },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
        { id: 'b', kind: 'buyout', optional: true, rates: [{ amount: 25000 }], replaces: ['site_fee'] },
      ],
      charges: { ...noTax, serviceChargePct: 0 },
    };
    expect(estimate(rules, ctx()).total).toBe(19000);
    expect(estimate(rules, ctx({ buyout: true })).total).toBe(35000);
  });
});

describe('pricing engine — F&B minimum edge cases', () => {
  const base = (minimum: Record<string, unknown>, pp: number, extra: Partial<PricingRules['charges']> = {}): PricingRules =>
    sanitizePricing({
      components: [
        { id: 'm', kind: 'fnb_minimum', rates: [{ amount: 20000 }], ...minimum },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: pp }] },
      ],
      charges: { serviceChargePct: 20, taxPct: 10, ...extra },
    });

  it('14. spend above minimum: minimum has no effect', () => {
    const e = estimate(base({}, 250), ctx());
    expect(line(e, 'fnb-minimum')).toBeUndefined();
    expect(line(e, 'p')).toBe(25000);
  });

  it('15. spend below minimum (exclusive of service & tax): F&B = max(min, pp × guests) and charges apply to the minimum', () => {
    const e = estimate(base({}, 150), ctx());
    expect(line(e, 'p')).toBe(15000);
    expect(line(e, 'fnb-minimum')).toBe(5000);
    expect(line(e, 'service')).toBe(4000); // 20% of 20,000
    expect(line(e, 'tax')).toBe(2400); // 10% of 24,000
    expect(e.total).toBe(26400);
  });

  it('16. spend exactly equal to the minimum: no shortfall line', () => {
    const e = estimate(base({}, 200), ctx());
    expect(line(e, 'fnb-minimum')).toBeUndefined();
    expect(e.total).toBe(26400);
  });

  it('17. minimum inclusive of service charge and tax: top-up is final', () => {
    const e = estimate(base({ includesServiceCharge: true, includesTax: true }, 100), ctx());
    // spend 10,000 + sc 2,000 + tax 1,200 = 13,200 -> top-up 6,800 untaxed
    expect(line(e, 'fnb-minimum')).toBe(6800);
    expect(line(e, 'tax')).toBe(1200);
    expect(e.total).toBe(20000);
  });

  it('18. minimum inclusive of service charge only: top-up is still taxed', () => {
    const e = estimate(base({ includesServiceCharge: true }, 100), ctx());
    // spend 10,000 + sc 2,000 = 12,000 -> top-up 8,000, tax 10% on 20,000
    expect(line(e, 'fnb-minimum')).toBe(8000);
    expect(line(e, 'tax')).toBe(2000);
    expect(e.total).toBe(22000);
  });

  it('19. minimum only (no per-person pricing): assumes spend = minimum; high case higher; Partial', () => {
    const rules: PricingRules = { components: [{ id: 'm', kind: 'fnb_minimum', rates: [{ amount: 30000 }] }], charges: { serviceChargePct: 20, taxPct: 0 } };
    const e = estimate(rules, ctx());
    expect(e.total).toBe(36000);
    expect(e.high).toBe(Math.round(36000 * 1.2));
    expect(e.confidence).toBe('partial');
  });

  it('20. minimum varies by day: Saturday minimum higher than Sunday', () => {
    const rules: PricingRules = {
      components: [
        { id: 'm', kind: 'fnb_minimum', rates: [{ amount: 15000, when: { days: [0, 5] } }, { amount: 25000, when: { days: [6] } }] },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
      ],
      charges: { serviceChargePct: 0, taxPct: 0 },
    };
    expect(estimate(rules, ctx()).total).toBe(25000);
    expect(estimate(rules, ctx({ date: '2027-06-13' })).total).toBe(15000);
    // Unknown day -> range across Fri/Sat/Sun
    const e = estimate(rules, ctx({ date: undefined, months: [6] }));
    expect(e.low).toBe(15000);
    expect(e.high).toBe(25000);
  });
});

describe('pricing engine — charges, tax bases, add-ons', () => {
  const rules = (charges: PricingRules['charges']): PricingRules => ({
    components: [
      { id: 's', kind: 'site_fee', rates: [{ amount: 10000 }] },
      { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
    ],
    charges,
  });

  it('21. tax on service charge on vs off', () => {
    const on = estimate(rules({ serviceChargePct: 20, taxPct: 10 }), ctx());
    const off = estimate(rules({ serviceChargePct: 20, taxPct: 10, taxOnServiceCharge: false }), ctx());
    expect(line(on, 'tax')).toBe(2200); // (10k + 10k + 2k) × 10%
    expect(line(off, 'tax')).toBe(2000);
  });

  it('22. service charge base: F&B only vs F&B + rental vs all', () => {
    expect(line(estimate(rules({ serviceChargePct: 20, taxPct: 0 }), ctx()), 'service')).toBe(2000);
    expect(line(estimate(rules({ serviceChargePct: 20, serviceChargeBase: 'fnb_rental', taxPct: 0 }), ctx()), 'service')).toBe(4000);
  });

  it('23. admin fee and gratuity with their own bases; gratuity untaxed by default', () => {
    const e = estimate(rules({ serviceChargePct: 0, adminFeePct: 5, adminFeeBase: 'all', gratuityPct: 10, taxPct: 10 }), ctx());
    expect(line(e, 'admin')).toBe(1000);
    expect(line(e, 'gratuity')).toBe(1000);
    expect(line(e, 'tax')).toBe(2100); // (20k + 1k admin) × 10%
  });

  it('24. default NYC tax (8.875%) applied when not specified, with an assumption', () => {
    const e = estimate(rules({ serviceChargePct: 0 }), ctx());
    expect(line(e, 'tax')).toBe(1775);
    expect(e.assumptions.join(' ')).toMatch(/8\.875%/);
  });

  it('25. missing service charge for in-house F&B: assumed and flagged Partial with range', () => {
    const e = estimate(rules({ taxPct: 0 }), ctx());
    expect(line(e, 'service')).toBe(2000);
    expect(e.confidence).toBe('partial');
    expect(e.low).toBe(21800);
    expect(e.high).toBe(22400);
  });

  it('26. explicit "no service charge" is respected', () => {
    const e = estimate(rules({ noServiceCharge: true, taxPct: 0 }), ctx());
    expect(line(e, 'service')).toBeUndefined();
    expect(e.confidence).toBe('complete');
  });

  it('27. required add-ons (flat, per-person, per-hour) and optional add-on selection', () => {
    const r: PricingRules = {
      components: [
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
        { id: 'cer', kind: 'addon', name: 'Ceremony fee', addonType: 'ceremony', unit: 'flat', required: true, rates: [{ amount: 2500 }] },
        { id: 'cake', kind: 'addon', name: 'Cake cutting', addonType: 'cake_cutting', unit: 'per_person', required: true, rates: [{ amount: 4 }] },
        { id: 'sec', kind: 'addon', name: 'Security', addonType: 'security', unit: 'per_hour', required: true, rates: [{ amount: 75 }] },
        { id: 'photo', kind: 'addon', name: 'Photo booth', unit: 'flat', required: false, rates: [{ amount: 1200 }] },
      ],
      hoursIncluded: 5,
      charges: { serviceChargePct: 20, taxPct: 0 },
    };
    const e = estimate(r, ctx());
    expect(line(e, 'cer')).toBe(2500);
    expect(line(e, 'cake')).toBe(400);
    expect(line(e, 'sec')).toBe(375);
    expect(line(e, 'photo')).toBeUndefined();
    // service applies to fnb (dinner 10,000 + cake cutting 400)
    expect(line(e, 'service')).toBe(2080);
    expect(line(estimate(r, ctx({ addonIds: ['photo'] })), 'photo')).toBe(1200);
  });

  it('28. overtime beyond hours included', () => {
    const r: PricingRules = {
      components: [{ id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] }],
      hoursIncluded: 5,
      overtimePerHour: 1500,
      charges: { serviceChargePct: 0, taxPct: 0 },
    };
    expect(line(estimate(r, ctx({ hours: 7 })), 'overtime')).toBe(3000);
    expect(line(estimate(r, ctx({ hours: 5 })), 'overtime')).toBeUndefined();
  });
});

describe('pricing engine — mixed structures, missing data, ranges', () => {
  it('29. mixed: seasonal site fee + day-varying minimum + tiered packages + add-ons + charges', () => {
    const r: PricingRules = {
      seasons: { peakMonths: [5, 6, 9, 10] },
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 6000 }, { amount: 9000, when: { season: 'peak', days: [6] } }] },
        { id: 'm', kind: 'fnb_minimum', rates: [{ amount: 20000 }, { amount: 30000, when: { days: [6], season: 'peak' } }] },
        { id: 'a', kind: 'per_person', name: 'Silver', rates: [{ amount: 165 }, { amount: 150, when: { guestMin: 150 } }] },
        { id: 'b', kind: 'per_person', name: 'Gold', rates: [{ amount: 210 }] },
        { id: 'coord', kind: 'addon', name: 'Coordinator', addonType: 'coordinator', unit: 'flat', required: true, rates: [{ amount: 1800 }] },
      ],
      charges: { serviceChargePct: 22, taxPct: 8.875 },
    };
    const e = estimate(r, ctx({ guests: 140 }));
    // Saturday June: site 9000; Silver 140 × 165 = 23,100 < 30,000 min -> shortfall 6,900
    expect(line(e, 's')).toBe(9000);
    expect(line(e, 'a')).toBe(23100);
    expect(line(e, 'fnb-minimum')).toBe(6900);
    expect(line(e, 'service')).toBe(6600);
    const taxable = 9000 + 30000 + 1800 + 6600;
    expect(line(e, 'tax')).toBeCloseTo(taxable * 0.08875, 2);
    expect(e.byCategory.fnb).toBe(30000);
    expect(e.confidence).toBe('complete');
  });

  it('30. guest-count range produces low/high across min and max', () => {
    const r: PricingRules = { components: [{ id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] }], charges: { serviceChargePct: 0, taxPct: 0 } };
    const e = estimate(r, ctx({ guests: 120, guestMin: 100, guestMax: 150 }));
    expect(e.total).toBe(12000);
    expect(e.low).toBe(10000);
    expect(e.high).toBe(15000);
  });

  it('31. no pricing at all → Unknown with null totals', () => {
    const e = estimate({ components: [] }, ctx());
    expect(e.confidence).toBe('unknown');
    expect(e.total).toBeNull();
    expect(estimate(undefined, ctx()).confidence).toBe('unknown');
  });

  it('32. no site fee rate for the chosen day → flagged, other components still priced', () => {
    const r: PricingRules = {
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 9000, when: { days: [6] } }] },
        { id: 'p', kind: 'per_person', name: 'Dinner', rates: [{ amount: 100 }] },
      ],
      charges: { serviceChargePct: 0, taxPct: 0 },
    };
    const e = estimate(r, ctx({ date: '2027-06-15' })); // Tuesday
    expect(line(e, 's')).toBeUndefined();
    expect(e.total).toBe(10000);
    expect(e.confidence).toBe('partial');
  });

  it('33. stale pricing (>18 months) is flagged', () => {
    const r: PricingRules = { asOf: '2024-01-15', components: [{ id: 'p', kind: 'per_person', name: 'D', rates: [{ amount: 100 }] }], charges: { serviceChargePct: 0, taxPct: 0 } };
    const e = estimate(r, ctx());
    expect(e.stale).toBe(true);
    expect(e.confidence).toBe('partial');
    expect(isStale('2026-01-01', NOW)).toBe(false);
  });

  it('34. unknown month: range covers peak and off-peak; base assumes June', () => {
    const r: PricingRules = {
      seasons: { peakMonths: [6], offPeakMonths: [1] },
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 5000 }, { amount: 10000, when: { season: 'peak' } }, { amount: 2000, when: { season: 'off_peak' } }] },
        { id: 'p', kind: 'per_person', name: 'D', rates: [{ amount: 100 }] },
      ],
      charges: { serviceChargePct: 0, taxPct: 0 },
    };
    const e = estimate(r, { guests: 100, now: NOW });
    expect(e.total).toBe(20000);
    expect(e.low).toBe(12000);
    expect(e.high).toBe(20000);
    expect(e.assumptions.join(' ')).toMatch(/Month not set/);
  });

  it('35. pickRate prefers the most specific match and ignores non-matching rates', () => {
    const r: PricingRules = { components: [] };
    const rates = [{ amount: 1 }, { amount: 2, when: { days: [6] as (0 | 6)[] } }, { amount: 3, when: { days: [6] as (0 | 6)[], months: [6] } }];
    expect(pickRate(rates, { guests: 1, day: 6, month: 6 }, r)?.amount).toBe(3);
    expect(pickRate(rates, { guests: 1, day: 6, month: 7 }, r)?.amount).toBe(2);
    expect(pickRate(rates, { guests: 1, day: 1, month: 7 }, r)?.amount).toBe(1);
  });

  it('36. sanitizePricing drops malformed components and clamps values', () => {
    const r = sanitizePricing({
      components: [{ kind: 'site_fee', rates: [{ amount: '5000' }, { amount: -1 }, { amount: 'abc' }] }, { kind: 'bogus' }, null],
      charges: { serviceChargePct: 250, taxPct: 8.875 },
    });
    expect(r.components).toHaveLength(1);
    expect(r.components[0].rates).toEqual([{ amount: 5000 }]);
    expect(r.charges?.serviceChargePct).toBeUndefined();
    expect(r.charges?.taxPct).toBe(8.875);
  });

  it('37. evaluateScenario returns lines that sum to the total', () => {
    const r: PricingRules = {
      components: [
        { id: 's', kind: 'site_fee', rates: [{ amount: 4321.5 }] },
        { id: 'p', kind: 'per_person', name: 'D', rates: [{ amount: 133.33 }] },
      ],
      charges: { serviceChargePct: 21.5, adminFeePct: 3, taxPct: 8.875 },
    };
    const res = evaluateScenario(r, { guests: 137, day: 6, month: 6 }, { level: 'base', defaultTaxPct: 8.875 });
    const sum = res.lines.reduce((a, l) => a + l.amount, 0);
    expect(Math.abs(sum - res.total)).toBeLessThan(0.01);
  });
});
