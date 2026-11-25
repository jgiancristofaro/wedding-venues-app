import {
  estimate,
  type Estimate,
  type EstimateContext,
  type PricingOverrides,
  type PricingRules,
} from '../lib/pricing';
import { newId } from '../lib/pricing/sanitize';
import { milesBetween } from '../lib/geo';
import { FIELD_DEFS, isEmptyValue } from './fields';
import type {
  FieldKey,
  FieldProvenance,
  GlobalVenue,
  UserVenue,
  VenueFields,
  VenueView,
  WeddingProfile,
} from './types';

export const refOf = (kind: 'global' | 'mine', id: string) => `${kind === 'global' ? 'g' : 'u'}:${id}`;

export function globalView(g: GlobalVenue, mine?: UserVenue): VenueView {
  return {
    ref: refOf('global', g.id),
    kind: 'global',
    id: g.id,
    fields: g.fields,
    pricing: g.pricing,
    global: g,
    mine,
    isSample: g.isSample,
    pricingAsOf: g.pricing.asOf ?? g.provenance.pricingAsOf,
  };
}
export function mineView(m: UserVenue, g?: GlobalVenue): VenueView {
  return {
    ref: refOf('mine', m.id),
    kind: 'mine',
    id: m.id,
    fields: m.fields,
    pricing: m.pricing,
    global: g,
    mine: m,
    isSample: !!g?.isSample,
    pricingAsOf: m.pricing.asOf,
  };
}

export function contextFromProfile(p: WeddingProfile, o?: PricingOverrides): EstimateContext {
  return {
    guests: o?.guests ?? p.guestCount,
    guestMin: o?.guests ? undefined : p.guestMin,
    guestMax: o?.guests ? undefined : p.guestMax,
    date: o?.date ?? (o?.day != null || o?.month != null ? undefined : p.targetDate),
    days: o?.day != null ? [o.day] : p.preferredDays,
    months: o?.month != null ? [o.month] : p.months,
    packageId: o?.packageId,
    buyout: o?.buyout,
    addonIds: o?.addonIds,
    hours: o?.hours ?? p.hours,
    timeSlot: o?.timeSlot,
  };
}

const cache = new Map<string, Estimate>();
export function estimateFor(
  pricing: PricingRules,
  profile: WeddingProfile,
  overrides?: PricingOverrides,
  key?: string,
): Estimate {
  const k = key ? `${key}|${JSON.stringify(profile)}|${JSON.stringify(overrides ?? {})}` : '';
  if (k) {
    const hit = cache.get(k);
    if (hit) return hit;
  }
  const e = estimate(pricing, contextFromProfile(profile, overrides));
  if (k) {
    if (cache.size > 6000) cache.clear();
    cache.set(k, e);
  }
  return e;
}

export function viewEstimate(v: VenueView, profile: WeddingProfile): Estimate {
  const stamp = v.mine?.updatedAt ?? v.global?.updatedAt ?? '';
  return estimateFor(v.pricing, profile, v.mine?.overrides, `${v.ref}@${stamp}`);
}

export function fit(v: VenueFields, guests: number): { fits: boolean | null; label: string } {
  const cap = v.capacitySeated ?? v.capacityStanding;
  if (!cap) return { fits: null, label: 'Capacity unknown' };
  return cap >= guests ? { fits: true, label: `Fits ${guests}` } : { fits: false, label: `Max ${cap}` };
}

export function distanceFrom(v: VenueFields, p: WeddingProfile): number | null {
  if (v.lat == null || v.lng == null || p.lat == null || p.lng == null) return null;
  return milesBetween(p.lat, p.lng, v.lat, v.lng);
}

const now = () => new Date().toISOString();

/** Heart a global venue: copy into the private library, keep a snapshot for future diffs. */
export function copyGlobalToMine(g: GlobalVenue, ownerId: string): UserVenue {
  const provenance: UserVenue['provenance'] = {};
  for (const f of FIELD_DEFS) {
    if (!isEmptyValue(g.fields[f.key]))
      provenance[f.key] = {
        source: 'global',
        detail: g.isSample ? 'Global library (sample data)' : 'Global library',
        url: g.provenance.sourceUrl,
        at: g.updatedAt,
      };
  }
  provenance.pricing = {
    source: 'global',
    detail: `Global library · pricing as of ${g.pricing.asOf ?? 'unknown'}`,
    at: g.updatedAt,
  };
  return {
    id: crypto.randomUUID?.() ?? newId('uv'),
    ownerId,
    globalId: g.id,
    globalSnapshot: {
      fields: structuredClone(g.fields),
      pricing: structuredClone(g.pricing),
      updatedAt: g.updatedAt,
    },
    fields: structuredClone(g.fields),
    pricing: structuredClone(g.pricing),
    provenance,
    tags: [],
    status: 'researching',
    shortlistRank: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

export interface GlobalChange {
  key: FieldKey | 'pricing';
  label: string;
  from: unknown;
  to: unknown;
  /** True if the user edited this field locally (we never overwrite without explicit accept). */
  userEdited: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-level diff between the user's linked copy and the current global record. */
export function globalChanges(m: UserVenue, g: GlobalVenue): GlobalChange[] {
  const snap = m.globalSnapshot;
  if (!snap) return [];
  const out: GlobalChange[] = [];
  for (const f of FIELD_DEFS) {
    if (same(snap.fields[f.key], g.fields[f.key])) continue;
    if (same(m.fields[f.key], g.fields[f.key])) continue;
    out.push({
      key: f.key,
      label: f.label,
      from: m.fields[f.key],
      to: g.fields[f.key],
      userEdited: !same(m.fields[f.key], snap.fields[f.key]),
    });
  }
  if (!same(snap.pricing, g.pricing) && !same(m.pricing, g.pricing)) {
    out.push({
      key: 'pricing',
      label: 'Pricing rules',
      from: m.pricing,
      to: g.pricing,
      userEdited: !same(m.pricing, snap.pricing),
    });
  }
  return out;
}

export function acceptGlobalChange(m: UserVenue, g: GlobalVenue, key: FieldKey | 'pricing'): UserVenue {
  const snap = m.globalSnapshot ?? {
    fields: { name: g.fields.name },
    pricing: { components: [] },
    updatedAt: g.updatedAt,
  };
  const prov: FieldProvenance = { source: 'global', detail: 'Global library (accepted update)', at: now() };
  if (key === 'pricing') {
    return {
      ...m,
      pricing: structuredClone(g.pricing),
      globalSnapshot: { ...snap, pricing: structuredClone(g.pricing), updatedAt: g.updatedAt },
      provenance: { ...m.provenance, pricing: prov },
    };
  }
  return {
    ...m,
    fields: { ...m.fields, [key]: structuredClone(g.fields[key]) },
    globalSnapshot: {
      ...snap,
      fields: { ...snap.fields, [key]: structuredClone(g.fields[key]) },
      updatedAt: g.updatedAt,
    },
    provenance: { ...m.provenance, [key]: prov },
  };
}

export function dismissGlobalChange(m: UserVenue, g: GlobalVenue, key: FieldKey | 'pricing'): UserVenue {
  const snap = m.globalSnapshot!;
  if (key === 'pricing') return { ...m, globalSnapshot: { ...snap, pricing: structuredClone(g.pricing) } };
  return {
    ...m,
    globalSnapshot: { ...snap, fields: { ...snap.fields, [key]: structuredClone(g.fields[key]) } },
  };
}

/** Did the user change this field from the global value? */
export function isUserEdited(m: UserVenue | undefined, key: FieldKey): boolean {
  if (!m?.globalSnapshot) return false;
  return !same(m.fields[key], m.globalSnapshot.fields[key]);
}

export function blankUserVenue(ownerId: string, fields: Partial<VenueFields> & { name: string }): UserVenue {
  return {
    id: crypto.randomUUID?.() ?? newId('uv'),
    ownerId,
    fields: { ...fields },
    pricing: { currency: 'USD', components: [] },
    provenance: {},
    tags: [],
    status: 'researching',
    shortlistRank: null,
    createdAt: now(),
    updatedAt: now(),
  };
}
