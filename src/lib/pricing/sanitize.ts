import type { DayOfWeek, PricingComponent, PricingRules, Rate, When } from './types';

/** Coerce untrusted input (imports, AI, storage) into valid PricingRules. Drops anything malformed. */
export function sanitizePricing(input: unknown): PricingRules {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const comps = Array.isArray(src.components) ? src.components : [];
  const out: PricingRules = {
    currency: typeof src.currency === 'string' ? src.currency.slice(0, 3).toUpperCase() : 'USD',
    components: comps.map(sanitizeComponent).filter((c): c is PricingComponent => !!c),
  };
  if (typeof src.asOf === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(src.asOf)) out.asOf = src.asOf;
  const seasons = src.seasons as Record<string, unknown> | undefined;
  if (seasons && typeof seasons === 'object') {
    out.seasons = { peakMonths: months(seasons.peakMonths), offPeakMonths: months(seasons.offPeakMonths) };
  }
  const ch = src.charges as Record<string, unknown> | undefined;
  if (ch && typeof ch === 'object') {
    out.charges = {};
    for (const k of ['serviceChargePct', 'adminFeePct', 'gratuityPct', 'taxPct'] as const) {
      const v = num(ch[k]);
      if (v != null && v >= 0 && v <= 100) out.charges[k] = v;
    }
    for (const k of ['serviceChargeBase', 'adminFeeBase', 'gratuityBase'] as const) {
      if (ch[k] === 'fnb' || ch[k] === 'fnb_rental' || ch[k] === 'all') out.charges[k] = ch[k];
    }
    for (const k of ['taxOnServiceCharge', 'taxOnAdminFee', 'taxOnGratuity', 'noServiceCharge'] as const) {
      if (typeof ch[k] === 'boolean') out.charges[k] = ch[k] as boolean;
    }
  }
  const hi = num(src.hoursIncluded);
  if (hi != null && hi > 0 && hi < 48) out.hoursIncluded = hi;
  const ot = num(src.overtimePerHour);
  if (ot != null && ot >= 0) out.overtimePerHour = ot;
  if (typeof src.notes === 'string') out.notes = src.notes.slice(0, 4000);
  return out;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(+v)) return +v;
  return undefined;
}

function months(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const m = v.map(num).filter((x): x is number => x != null && x >= 1 && x <= 12);
  return m.length ? [...new Set(m)] : undefined;
}

function sanitizeWhen(v: unknown): When | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const w = v as Record<string, unknown>;
  const out: When = {};
  if (Array.isArray(w.days)) {
    const d = w.days.map(num).filter((x): x is number => x != null && x >= 0 && x <= 6) as DayOfWeek[];
    if (d.length) out.days = [...new Set(d)];
  }
  const m = months(w.months);
  if (m) out.months = m;
  if (w.season === 'peak' || w.season === 'off_peak' || w.season === 'standard') out.season = w.season;
  if (Array.isArray(w.dates)) {
    const d = w.dates.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x));
    if (d.length) out.dates = d;
  }
  if (typeof w.timeSlot === 'string' && w.timeSlot) out.timeSlot = w.timeSlot;
  const gmin = num(w.guestMin);
  const gmax = num(w.guestMax);
  if (gmin != null && gmin >= 0) out.guestMin = Math.round(gmin);
  if (gmax != null && gmax > 0) out.guestMax = Math.round(gmax);
  return Object.keys(out).length ? out : undefined;
}

function sanitizeRates(v: unknown): Rate[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const o = r as Record<string, unknown>;
      const amount = num(o.amount);
      if (amount == null || amount < 0) return null;
      const rate: Rate = { amount };
      const when = sanitizeWhen(o.when);
      if (when) rate.when = when;
      if (typeof o.label === 'string' && o.label) rate.label = o.label.slice(0, 120);
      return rate;
    })
    .filter((r): r is Rate => !!r);
}

let counter = 0;
export function newId(prefix = 'c'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${counter.toString(36)}`;
}

const CATS = new Set(['rental', 'fnb', 'other']);

function sanitizeComponent(v: unknown): PricingComponent | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id ? o.id.slice(0, 64) : newId();
  const label = typeof o.label === 'string' && o.label ? o.label.slice(0, 120) : undefined;
  const notes = typeof o.notes === 'string' && o.notes ? o.notes.slice(0, 1000) : undefined;
  const rates = sanitizeRates(o.rates);
  const category = CATS.has(o.category as string) ? (o.category as 'rental' | 'fnb' | 'other') : undefined;
  const base = { id, ...(label ? { label } : {}), ...(notes ? { notes } : {}), rates };
  switch (o.kind) {
    case 'site_fee':
      return { kind: 'site_fee', ...base };
    case 'fnb_minimum':
      return {
        kind: 'fnb_minimum',
        ...base,
        includesServiceCharge: o.includesServiceCharge === true,
        includesTax: o.includesTax === true,
      };
    case 'per_person': {
      const mg = num(o.minGuests);
      return {
        kind: 'per_person',
        ...base,
        name: typeof o.name === 'string' && o.name ? o.name.slice(0, 80) : label || 'Package',
        ...(category ? { category } : {}),
        ...(mg ? { minGuests: Math.round(mg) } : {}),
      };
    }
    case 'capacity_tier':
      return { kind: 'capacity_tier', ...base, ...(category ? { category } : {}), includesFnb: o.includesFnb === true };
    case 'buyout': {
      const rep = Array.isArray(o.replaces)
        ? o.replaces.filter((x): x is 'site_fee' | 'fnb_minimum' => x === 'site_fee' || x === 'fnb_minimum')
        : undefined;
      return {
        kind: 'buyout',
        ...base,
        optional: o.optional === true,
        includesFnb: o.includesFnb === true,
        ...(rep?.length ? { replaces: rep } : {}),
        ...(category ? { category } : {}),
      };
    }
    case 'addon': {
      const unit = o.unit === 'per_person' || o.unit === 'per_hour' ? o.unit : 'flat';
      const types = ['ceremony', 'coordinator', 'security', 'cleaning', 'cake_cutting', 'corkage', 'bar', 'rentals', 'other'];
      return {
        kind: 'addon',
        ...base,
        name: typeof o.name === 'string' && o.name ? o.name.slice(0, 80) : label || 'Add-on',
        unit,
        required: o.required === true,
        ...(types.includes(o.addonType as string) ? { addonType: o.addonType as never } : {}),
        ...(category ? { category } : {}),
      };
    }
    default:
      return null;
  }
}
