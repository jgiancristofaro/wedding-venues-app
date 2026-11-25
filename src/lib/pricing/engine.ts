/**
 * Pricing engine — pure and framework-free.
 *
 * Turns structured venue pricing rules + a wedding scenario into an estimated all-in total,
 * a per-component breakdown, a low–high range, a confidence level and plain-English assumptions.
 */
import type {
  AddonComponent,
  BuyoutComponent,
  CapacityTierComponent,
  ChargeBase,
  Confidence,
  CostCategory,
  DayOfWeek,
  Estimate,
  EstimateContext,
  EstimateLine,
  FnbMinimumComponent,
  LineCategory,
  PerPersonComponent,
  PricingComponent,
  PricingRules,
  Rate,
  Scenario,
  Season,
  When,
} from './types';

export const DEFAULT_TAX_PCT = 8.875;
export const STALE_MONTHS = 18;
/** Typical service charge used when a venue with in-house F&B doesn't state one. */
export const ASSUMED_SERVICE_PCT = { low: 18, base: 20, high: 24 };
/** Typical all-in outside catering cost per guest (NYC metro) when a venue has no F&B pricing. */
export const OUTSIDE_CATERING_PP = { low: 125, base: 165, high: 225 };
/** When only an F&B minimum is known, the high estimate assumes spend runs this much over it. */
export const MINIMUM_ONLY_HIGH_FACTOR = 1.2;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type Level = 'low' | 'base' | 'high';
type Severity = 'minor' | 'major';
interface Issue {
  text: string;
  severity: Severity;
}

interface EvalOptions {
  level: Level;
  buyout?: boolean;
  addonIds?: string[];
  hours?: number;
  defaultTaxPct: number;
}

interface EvalResult {
  total: number;
  lines: EstimateLine[];
  issues: Issue[];
  assumptions: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pct = (n: number) => `${+n.toFixed(3)}%`;

export function seasonOf(month: number, rules: PricingRules): Season {
  const s = rules.seasons;
  if (s?.peakMonths?.includes(month)) return 'peak';
  if (s?.offPeakMonths?.includes(month)) return 'off_peak';
  return 'standard';
}

export function parseIsoDate(date: string): { day: DayOfWeek; month: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return { day: d.getUTCDay() as DayOfWeek, month: d.getUTCMonth() + 1 };
}

export function whenMatches(when: When | undefined, s: Scenario, rules: PricingRules): boolean {
  if (!when) return true;
  if (when.dates?.length && !(s.date && when.dates.includes(s.date))) return false;
  if (when.days?.length && !when.days.includes(s.day)) return false;
  if (when.months?.length && !when.months.includes(s.month)) return false;
  if (when.season && seasonOf(s.month, rules) !== when.season) return false;
  if (when.timeSlot && (s.timeSlot ?? 'evening') !== when.timeSlot) return false;
  if (when.guestMin != null && s.guests < when.guestMin) return false;
  if (when.guestMax != null && s.guests > when.guestMax) return false;
  return true;
}

export function specificity(when: When | undefined): number {
  if (!when) return 0;
  let n = 0;
  if (when.dates?.length) n += 1000;
  if (when.days?.length) n += 40 - Math.min(when.days.length, 7);
  if (when.months?.length) n += 40 - Math.min(when.months.length, 12);
  else if (when.season) n += 25;
  if (when.timeSlot) n += 10;
  if (when.guestMin != null || when.guestMax != null) n += 5;
  return n;
}

export function pickRate(rates: Rate[], s: Scenario, rules: PricingRules): Rate | undefined {
  let best: Rate | undefined;
  let bestScore = -1;
  for (const rate of rates) {
    if (!Number.isFinite(rate.amount)) continue;
    if (!whenMatches(rate.when, s, rules)) continue;
    const sc = specificity(rate.when);
    if (sc > bestScore) {
      best = rate;
      bestScore = sc;
    }
  }
  return best;
}

function describeScenario(s: Scenario): string {
  const when = s.date
    ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : `a ${DAY_NAMES[s.day]} in ${MONTH_NAMES[s.month - 1]}`;
  return `${when}, ${s.guests} guests`;
}

function catToLine(c: CostCategory | undefined, fallback: CostCategory): LineCategory {
  const v = c ?? fallback;
  return v === 'rental' ? 'rental' : v === 'fnb' ? 'fnb' : 'addons';
}

function addonDefaultCategory(a: AddonComponent): CostCategory {
  if (a.category) return a.category;
  return a.addonType === 'cake_cutting' || a.addonType === 'corkage' || a.addonType === 'bar'
    ? 'fnb'
    : 'other';
}

export function perPersonPackages(rules: PricingRules | undefined): PerPersonComponent[] {
  return (rules?.components ?? []).filter((c): c is PerPersonComponent => c.kind === 'per_person');
}

function activeBuyout(rules: PricingRules, opts: EvalOptions): BuyoutComponent | undefined {
  const buyouts = rules.components.filter((c): c is BuyoutComponent => c.kind === 'buyout');
  return buyouts.find((b) => !b.optional) ?? (opts.buyout ? buyouts[0] : undefined);
}

function sumBase(base: ChargeBase, fnb: number, rental: number, other: number) {
  return base === 'fnb' ? fnb : base === 'fnb_rental' ? fnb + rental : fnb + rental + other;
}

function baseLabel(base: ChargeBase) {
  return base === 'fnb' ? 'F&B' : base === 'fnb_rental' ? 'F&B + rental' : 'subtotal';
}

/** Evaluate one fully specified scenario. */
export function evaluateScenario(rules: PricingRules, s: Scenario, opts: EvalOptions): EvalResult {
  const lines: EstimateLine[] = [];
  const issues: Issue[] = [];
  const assumptions: string[] = [];
  const when = `${DAY_NAMES[s.day]}s in ${MONTH_NAMES[s.month - 1]}`;

  const buyout = activeBuyout(rules, opts);
  const replaced = new Set(buyout?.replaces ?? []);
  let fnbProvided = false; // F&B covered by venue pricing (in-house or all-inclusive)
  let fnbFromVenue = false; // in-house F&B subject to service charge

  // 1. Rental-type flat components
  for (const c of rules.components) {
    if (c.kind === 'site_fee' && !replaced.has('site_fee')) {
      const rate = pickRate(c.rates, s, rules);
      if (rate) {
        lines.push({
          key: c.id,
          label: c.label || 'Site fee',
          category: 'rental',
          amount: r2(rate.amount),
          detail: rate.label || (rate.when ? `Rate for ${when}` : undefined),
        });
      } else if (c.rates.length) {
        issues.push({
          text: `No ${c.label?.toLowerCase() || 'site fee'} listed for ${when}`,
          severity: 'minor',
        });
      }
    }
  }

  if (buyout) {
    const rate = pickRate(buyout.rates, s, rules);
    if (rate) {
      lines.push({
        key: buyout.id,
        label: buyout.label || 'Full buyout',
        category: catToLine(buyout.category, 'rental'),
        amount: r2(rate.amount),
        detail: buyout.optional ? 'You chose the buyout option' : 'Venue is booked as a full buyout',
      });
      if (buyout.includesFnb) fnbProvided = true;
      if (buyout.category === 'fnb') fnbFromVenue = fnbProvided = true;
    } else {
      issues.push({ text: `No buyout price listed for ${when}`, severity: 'major' });
    }
  }

  for (const c of rules.components) {
    if (c.kind !== 'capacity_tier') continue;
    const tier = pickTier(c, s, rules);
    if (!tier.rate) {
      issues.push({
        text: `No capacity-tier price matches ${s.guests} guests on ${when}`,
        severity: 'major',
      });
      continue;
    }
    if (tier.note) issues.push({ text: tier.note, severity: 'major' });
    const cat = c.category ?? 'rental';
    lines.push({
      key: c.id,
      label: c.label || 'Package (by guest count)',
      category: catToLine(cat, 'rental'),
      amount: r2(tier.rate.amount),
      detail: tierLabel(tier.rate),
    });
    if (c.includesFnb || cat === 'fnb') fnbProvided = true;
    if (cat === 'fnb') fnbFromVenue = true;
  }

  // 2. Per-person package (alternatives — exactly one is used)
  const packages = perPersonPackages(rules);
  if (packages.length) {
    const pkg = packages.find((p) => p.id === s.packageId) ?? packages[0];
    const rate = pickRate(pkg.rates, s, rules);
    if (rate) {
      const billed = Math.max(s.guests, pkg.minGuests ?? 0);
      const cat = pkg.category ?? 'fnb';
      lines.push({
        key: pkg.id,
        label: pkg.label || pkg.name || 'Per-person package',
        category: catToLine(cat, 'fnb'),
        amount: r2(billed * rate.amount),
        detail: `${billed} guests × ${usd(rate.amount)}${pkg.name ? ` (${pkg.name})` : ''}`,
      });
      if (billed > s.guests)
        assumptions.push(`${pkg.name} has a ${pkg.minGuests}-guest minimum; billed for ${billed}.`);
      if (cat === 'fnb') fnbFromVenue = fnbProvided = true;
    } else {
      issues.push({
        text: `No per-person price for ${pkg.name} at ${s.guests} guests on ${when}`,
        severity: 'major',
      });
    }
  }

  // 3. Add-ons
  const hoursIncluded = rules.hoursIncluded;
  const hours = opts.hours ?? hoursIncluded ?? 5;
  for (const c of rules.components) {
    if (c.kind !== 'addon') continue;
    if (!c.required && !opts.addonIds?.includes(c.id)) continue;
    const rate = pickRate(c.rates, s, rules);
    if (!rate) continue;
    const qty = c.unit === 'per_person' ? s.guests : c.unit === 'per_hour' ? hours : 1;
    const cat = addonDefaultCategory(c);
    lines.push({
      key: c.id,
      label: c.name || c.label || 'Add-on',
      category: catToLine(cat, 'other'),
      amount: r2(qty * rate.amount),
      detail:
        (c.unit === 'flat'
          ? usd(rate.amount)
          : `${qty} × ${usd(rate.amount)}${c.unit === 'per_hour' ? '/hr' : '/guest'}`) +
        (c.required ? ' · required' : ' · selected'),
    });
    // Bar/corkage/cake fees are F&B charges (subject to service) but don't feed the guests.
    if (cat === 'fnb') fnbFromVenue = true;
  }

  // 4. Overtime
  if (hoursIncluded != null && hours > hoursIncluded) {
    const extra = hours - hoursIncluded;
    if (rules.overtimePerHour != null) {
      lines.push({
        key: 'overtime',
        label: 'Overtime',
        category: 'rental',
        amount: r2(extra * rules.overtimePerHour),
        detail: `${extra} h × ${usd(rules.overtimePerHour)}/h beyond ${hoursIncluded} included`,
      });
    } else {
      issues.push({
        text: `You want ${hours} h but only ${hoursIncluded} are included and no overtime rate is listed`,
        severity: 'minor',
      });
    }
  }

  // 5. F&B minimum and outside-catering estimate
  const minimum = replaced.has('fnb_minimum')
    ? undefined
    : rules.components.find((c): c is FnbMinimumComponent => c.kind === 'fnb_minimum');
  const minRate = minimum ? pickRate(minimum.rates, s, rules) : undefined;
  if (minimum && !minRate && minimum.rates.length) {
    issues.push({ text: `No F&B minimum listed for ${when}`, severity: 'minor' });
  }

  if (!fnbProvided) {
    if (minRate) {
      // Venue has in-house F&B with only a minimum known.
      fnbFromVenue = true;
      const assumed = opts.level === 'high' ? minRate.amount * MINIMUM_ONLY_HIGH_FACTOR : minRate.amount;
      if (opts.level === 'high') {
        lines.push({
          key: 'fnb-assumed',
          label: 'Food & beverage (estimated above minimum)',
          category: 'fnb',
          amount: r2(assumed),
          estimated: true,
          detail: `High case assumes spend ${Math.round((MINIMUM_ONLY_HIGH_FACTOR - 1) * 100)}% over the minimum`,
        });
      }
      issues.push({
        text: 'No per-person menu pricing — assumed you spend exactly the F&B minimum',
        severity: 'minor',
      });
    } else {
      const pp = OUTSIDE_CATERING_PP[opts.level];
      lines.push({
        key: 'catering-estimate',
        label: 'Catering (estimated)',
        category: 'fnb',
        amount: r2(pp * s.guests),
        estimated: true,
        detail: `${s.guests} guests × ${usd(pp)} typical outside catering`,
      });
      issues.push({
        text: `No catering pricing — estimated outside catering at ${usd(OUTSIDE_CATERING_PP.low)}–${usd(OUTSIDE_CATERING_PP.high)} per guest`,
        severity: 'major',
      });
    }
  }

  const sumCat = (cat: LineCategory) =>
    lines.filter((l) => l.category === cat).reduce((a, l) => a + l.amount, 0);
  let fnb = sumCat('fnb');
  const rental = sumCat('rental');
  const other = sumCat('addons');

  // Minimum that excludes service & tax: top up the F&B base before charges.
  const ch = rules.charges ?? {};
  const minExclusive = minRate && !minimum?.includesServiceCharge && !minimum?.includesTax;
  if (minRate && minExclusive && fnb < minRate.amount) {
    const topUp = minRate.amount - fnb;
    lines.push({
      key: 'fnb-minimum',
      label: fnb > 0 ? 'F&B minimum shortfall' : 'Food & beverage minimum',
      category: 'fnb',
      amount: r2(topUp),
      detail:
        fnb > 0
          ? `Spend ${usd(fnb)} is below the ${usd(minRate.amount)} minimum`
          : `${usd(minRate.amount)} minimum spend`,
    });
    fnb = minRate.amount;
  }

  // 6. Service charge / admin fee / gratuity
  const scBase = ch.serviceChargeBase ?? 'fnb';
  let scPct = ch.serviceChargePct;
  if (scPct == null && !ch.noServiceCharge && fnbFromVenue) {
    scPct = ASSUMED_SERVICE_PCT[opts.level];
    issues.push({
      text: `Service charge not listed — assumed ${ASSUMED_SERVICE_PCT.base}% (typical ${ASSUMED_SERVICE_PCT.low}–${ASSUMED_SERVICE_PCT.high}%)`,
      severity: 'minor',
    });
  }
  const scAmt = scPct ? r2((sumBase(scBase, fnb, rental, other) * scPct) / 100) : 0;
  if (scAmt) {
    lines.push({
      key: 'service',
      label: 'Service charge',
      category: 'service',
      amount: scAmt,
      detail: `${pct(scPct!)} of ${baseLabel(scBase)}${ch.serviceChargePct == null ? ' (assumed)' : ''}`,
      estimated: ch.serviceChargePct == null,
    });
  }
  const adminBase = ch.adminFeeBase ?? scBase;
  const adminAmt = ch.adminFeePct ? r2((sumBase(adminBase, fnb, rental, other) * ch.adminFeePct) / 100) : 0;
  if (adminAmt) {
    lines.push({
      key: 'admin',
      label: 'Administrative fee',
      category: 'service',
      amount: adminAmt,
      detail: `${pct(ch.adminFeePct!)} of ${baseLabel(adminBase)}`,
    });
  }
  const gratBase = ch.gratuityBase ?? 'fnb';
  const gratAmt = ch.gratuityPct ? r2((sumBase(gratBase, fnb, rental, other) * ch.gratuityPct) / 100) : 0;
  if (gratAmt) {
    lines.push({
      key: 'gratuity',
      label: 'Gratuity',
      category: 'service',
      amount: gratAmt,
      detail: `${pct(ch.gratuityPct!)} of ${baseLabel(gratBase)}`,
    });
  }

  // 7. Tax
  const taxPct = ch.taxPct ?? opts.defaultTaxPct;
  if (ch.taxPct == null) assumptions.push(`Sales tax assumed at ${pct(taxPct)} (editable per venue).`);
  const taxOnSc = ch.taxOnServiceCharge ?? true;
  const taxOnAdmin = ch.taxOnAdminFee ?? true;
  const taxOnGrat = ch.taxOnGratuity ?? false;
  let taxable =
    fnb + rental + other + (taxOnSc ? scAmt : 0) + (taxOnAdmin ? adminAmt : 0) + (taxOnGrat ? gratAmt : 0);

  // Minimum that includes service and/or tax: compare after charges, top-up is final.
  if (minRate && !minExclusive) {
    const fnbTaxPart = minimum?.includesTax
      ? ((fnb + (taxOnSc && scBase === 'fnb' ? scAmt : 0)) * taxPct) / 100
      : 0;
    const comparable = fnb + (minimum?.includesServiceCharge && scBase === 'fnb' ? scAmt : 0) + fnbTaxPart;
    if (comparable < minRate.amount) {
      const topUp = r2(minRate.amount - comparable);
      const inc = [minimum?.includesServiceCharge && 'service', minimum?.includesTax && 'tax']
        .filter(Boolean)
        .join(' & ');
      lines.push({
        key: 'fnb-minimum',
        label: comparable > 0 ? 'F&B minimum shortfall' : 'Food & beverage minimum',
        category: 'fnb',
        amount: topUp,
        detail: `${usd(minRate.amount)} minimum (inclusive of ${inc})`,
      });
      if (!minimum?.includesTax) taxable += topUp;
    }
  }

  const taxAmt = r2((taxable * taxPct) / 100);
  if (taxAmt) {
    lines.push({
      key: 'tax',
      label: 'Sales tax',
      category: 'tax',
      amount: taxAmt,
      detail: `${pct(taxPct)}${taxOnSc && scAmt ? ' incl. on service charge' : ''}`,
    });
  }

  const total = r2(lines.reduce((a, l) => a + l.amount, 0));
  return { total, lines, issues, assumptions };
}

function tierLabel(rate: Rate): string {
  const w = rate.when ?? {};
  if (rate.label) return rate.label;
  if (w.guestMin != null && w.guestMax != null) return `Tier for ${w.guestMin}–${w.guestMax} guests`;
  if (w.guestMax != null) return `Tier for up to ${w.guestMax} guests`;
  if (w.guestMin != null) return `Tier for ${w.guestMin}+ guests`;
  return 'Flat tier';
}

function pickTier(
  c: CapacityTierComponent,
  s: Scenario,
  rules: PricingRules,
): { rate?: Rate; note?: string } {
  const exact = pickRate(c.rates, s, rules);
  if (exact) return { rate: exact };
  // Guest count outside the tiers: use nearest tier that otherwise matches.
  const loose = c.rates.filter((r) =>
    whenMatches({ ...r.when, guestMin: undefined, guestMax: undefined }, s, rules),
  );
  if (!loose.length) return {};
  const maxTier = loose.reduce((a, b) =>
    (a.when?.guestMax ?? Infinity) >= (b.when?.guestMax ?? Infinity) ? a : b,
  );
  const minTier = loose.reduce((a, b) => ((a.when?.guestMin ?? 0) <= (b.when?.guestMin ?? 0) ? a : b));
  if (maxTier.when?.guestMax != null && s.guests > maxTier.when.guestMax) {
    return {
      rate: maxTier,
      note: `${s.guests} guests exceeds the largest pricing tier (${maxTier.when.guestMax})`,
    };
  }
  return { rate: minTier };
}

/** Group candidate values into classes that the rules can't tell apart; keep one representative each. */
function representatives<T extends number>(candidates: T[], signature: (v: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const v of candidates) {
    const sig = signature(v);
    if (!seen.has(sig)) seen.set(sig, v);
  }
  return [...seen.values()];
}

function allWhens(rules: PricingRules): When[] {
  const out: When[] = [];
  for (const c of rules.components) for (const r of c.rates) if (r.when) out.push(r.when);
  return out;
}

function monthSignature(rules: PricingRules, whens: When[]) {
  return (m: number) =>
    seasonOf(m, rules) + '|' + whens.map((w) => (w.months ? (w.months.includes(m) ? 1 : 0) : '-')).join('');
}
function daySignature(whens: When[]) {
  return (d: DayOfWeek) => whens.map((w) => (w.days ? (w.days.includes(d) ? 1 : 0) : '-')).join('');
}

export function monthsBetween(a: Date, b: Date) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

export function isStale(asOf: string | undefined, now: Date = new Date()): boolean {
  if (!asOf) return false;
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return false;
  return monthsBetween(d, now) > STALE_MONTHS;
}

function emptyByCategory(): Record<LineCategory, number> {
  return { rental: 0, fnb: 0, addons: 0, service: 0, tax: 0 };
}

export function hasPricing(rules: PricingRules | undefined | null): rules is PricingRules {
  return !!rules && Array.isArray(rules.components) && rules.components.some((c) => c.rates?.length);
}

/** Main entry point. */
export function estimate(rules: PricingRules | undefined | null, ctx: EstimateContext): Estimate {
  const guests = Math.max(1, Math.round(ctx.guests || 0));
  const parsed = ctx.date ? parseIsoDate(ctx.date) : null;
  const baseDay: DayOfWeek = parsed?.day ?? ctx.days?.[0] ?? 6;
  const baseMonth = parsed?.month ?? ctx.months?.[0] ?? 6;
  const currency = rules?.currency || 'USD';
  const now = ctx.now ?? new Date();
  const stale = isStale(rules?.asOf, now);

  const baseScenario: Scenario = {
    guests,
    day: baseDay,
    month: baseMonth,
    date: parsed ? ctx.date : undefined,
    timeSlot: ctx.timeSlot,
  };

  if (!hasPricing(rules)) {
    return {
      total: null,
      perGuest: null,
      low: null,
      high: null,
      confidence: 'unknown',
      lines: [],
      assumptions: [],
      missing: ['No pricing on file yet — add pricing rules or import a brochure.'],
      scenario: baseScenario,
      stale: false,
      currency,
      byCategory: emptyByCategory(),
    };
  }

  const defaultTaxPct = ctx.defaultTaxPct ?? DEFAULT_TAX_PCT;
  const assumptions: string[] = [];
  const packages = perPersonPackages(rules);

  // Base package: chosen, else cheapest at the base scenario.
  let pkgId = packages.find((p) => p.id === ctx.packageId)?.id;
  if (!pkgId && packages.length) {
    let best = Infinity;
    for (const p of packages) {
      const rate = pickRate(p.rates, { ...baseScenario, packageId: p.id }, rules);
      if (rate && rate.amount < best) {
        best = rate.amount;
        pkgId = p.id;
      }
    }
    pkgId = pkgId ?? packages[0].id;
    if (packages.length > 1) {
      const name = packages.find((p) => p.id === pkgId)?.name;
      assumptions.push(`Assumed the lowest-priced package (${name}); pick another to compare.`);
    }
  }
  baseScenario.packageId = pkgId;

  const opts = (level: Level): EvalOptions => ({
    level,
    buyout: ctx.buyout,
    addonIds: ctx.addonIds,
    hours: ctx.hours,
    defaultTaxPct,
  });

  const base = evaluateScenario(rules, baseScenario, opts('base'));

  // Scenario description first
  assumptions.unshift(`Priced for ${describeScenario(baseScenario)}.`);
  if (!parsed && !ctx.days?.length) assumptions.push('Day not set — assumed a Saturday.');
  if (!parsed && !ctx.months?.length) assumptions.push('Month not set — assumed June.');
  assumptions.push(...base.assumptions);
  if (rules.hoursIncluded != null) {
    const h = ctx.hours ?? rules.hoursIncluded;
    if (h <= rules.hoursIncluded)
      assumptions.push(`${rules.hoursIncluded}-hour event included; no overtime assumed.`);
  }

  // Range across unknowns
  const whens = allWhens(rules);
  const dayCands: DayOfWeek[] = parsed ? [parsed.day] : ctx.days?.length ? ctx.days : [5, 6, 0];
  const monthCands = parsed
    ? [parsed.month]
    : ctx.months?.length
      ? ctx.months
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const days = representatives(dayCands, daySignature(whens));
  const months = representatives(monthCands, monthSignature(rules, whens));
  const guestCands = [
    ...new Set([ctx.guestMin ?? guests, guests, ctx.guestMax ?? guests].map((g) => Math.max(1, g))),
  ];
  const pkgCands =
    ctx.packageId && packages.some((p) => p.id === ctx.packageId)
      ? [ctx.packageId]
      : packages.length
        ? packages.map((p) => p.id)
        : [undefined];

  let low = Infinity;
  let high = -Infinity;
  for (const g of guestCands)
    for (const d of days)
      for (const m of months)
        for (const p of pkgCands) {
          const sc: Scenario = {
            guests: g,
            day: d,
            month: m,
            date: baseScenario.date,
            packageId: p,
            timeSlot: ctx.timeSlot,
          };
          const lo = evaluateScenario(rules, sc, opts('low')).total;
          const hi = evaluateScenario(rules, sc, opts('high')).total;
          if (lo < low) low = lo;
          if (hi > high) high = hi;
        }
  low = Math.min(low, base.total);
  high = Math.max(high, base.total);

  const issues = [...base.issues];
  if (stale) {
    issues.push({
      text: `Pricing is from ${rules.asOf} — more than ${STALE_MONTHS} months old and may be outdated`,
      severity: 'minor',
    });
  }
  const confidence: Confidence = issues.some((i) => i.severity === 'major')
    ? 'rough'
    : issues.length
      ? 'partial'
      : 'complete';

  const byCategory = emptyByCategory();
  for (const l of base.lines) byCategory[l.category] = r2(byCategory[l.category] + l.amount);

  return {
    total: Math.round(base.total),
    perGuest: Math.round(base.total / guests),
    low: Math.round(low),
    high: Math.round(high),
    confidence,
    lines: base.lines,
    assumptions,
    missing: [...new Set(issues.map((i) => i.text))],
    scenario: baseScenario,
    stale,
    currency,
    byCategory,
  };
}

export function componentKindLabel(kind: PricingComponent['kind']): string {
  return {
    site_fee: 'Site / rental fee',
    fnb_minimum: 'F&B minimum',
    per_person: 'Per-person package',
    capacity_tier: 'Capacity-tier price',
    buyout: 'Full buyout',
    addon: 'Add-on',
  }[kind];
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  complete: 'Complete',
  partial: 'Partial',
  rough: 'Rough',
  unknown: 'Unknown',
};

export const CATEGORY_LABEL: Record<LineCategory, string> = {
  rental: 'Venue & rental',
  fnb: 'Food & beverage',
  addons: 'Add-ons',
  service: 'Service & fees',
  tax: 'Tax',
};
