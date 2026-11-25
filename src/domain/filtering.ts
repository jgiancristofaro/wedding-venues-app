import type { Estimate } from '../lib/pricing';
import type { FilterState, VenueView, WeddingProfile } from './types';
import { distanceFrom, viewEstimate } from './venues';

export interface Row {
  v: VenueView;
  e: Estimate;
  dist: number | null;
  search: string;
}

export function buildRows(views: VenueView[], profile: WeddingProfile): Row[] {
  return views.map((v) => ({
    v,
    e: viewEstimate(v, profile),
    dist: distanceFrom(v.fields, profile),
    search: [
      v.fields.name,
      v.fields.area,
      v.fields.region,
      v.fields.venueType,
      ...(v.fields.styleTags ?? []),
      ...(v.mine?.tags ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }));
}

export function applyFilters(rows: Row[], f: FilterState, profile: WeddingProfile): Row[] {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = rows.filter(({ v, e, dist, search }) => {
    const x = v.fields;
    if (terms.length && !terms.every((t) => search.includes(t))) return false;
    if (f.regions.length && !f.regions.includes(x.region ?? '')) return false;
    if (f.maxDistance != null && (dist == null || dist > f.maxDistance)) return false;
    if (f.fitsGuests && !((x.capacitySeated ?? x.capacityStanding ?? 0) >= profile.guestCount)) return false;
    if (f.totalMin != null && (e.total == null || e.total < f.totalMin)) return false;
    if (f.totalMax != null && (e.total == null || e.total > f.totalMax)) return false;
    if (f.perGuestMax != null && (e.perGuest == null || e.perGuest > f.perGuestMax)) return false;
    if (
      f.settings.length &&
      !(
        x.setting &&
        (f.settings.includes(x.setting) ||
          (x.setting === 'both' && f.settings.some((s) => s === 'indoor' || s === 'outdoor')))
      )
    )
      return false;
    if (f.styles.length && !f.styles.some((s) => x.styleTags?.includes(s))) return false;
    if (f.catering.length && !f.catering.includes(x.cateringPolicy ?? '')) return false;
    if (f.ceremonyOnSite && !x.ceremonyOnSite) return false;
    if (f.accommodations && !x.accommodations) return false;
    if (f.statuses.length && !f.statuses.includes(v.mine?.status ?? '')) return false;
    if (f.tags.length && !f.tags.some((t) => v.mine?.tags.includes(t))) return false;
    if (f.confidence.length && !f.confidence.includes(e.confidence)) return false;
    return true;
  });
  const nullsLast = (a: number | null | undefined, b: number | null | undefined) =>
    (a ?? Infinity) - (b ?? Infinity);
  const sorters: Record<FilterState['sort'], (a: Row, b: Row) => number> = {
    total: (a, b) => nullsLast(a.e.total, b.e.total),
    perGuest: (a, b) => nullsLast(a.e.perGuest, b.e.perGuest),
    distance: (a, b) => nullsLast(a.dist, b.dist),
    rating: (a, b) => (b.v.mine?.rating ?? -1) - (a.v.mine?.rating ?? -1),
    recent: (a, b) =>
      (b.v.mine?.createdAt ?? b.v.global?.createdAt ?? '').localeCompare(
        a.v.mine?.createdAt ?? a.v.global?.createdAt ?? '',
      ),
    rank: (a, b) => nullsLast(a.v.mine?.shortlistRank, b.v.mine?.shortlistRank),
    name: (a, b) => a.v.fields.name.localeCompare(b.v.fields.name),
  };
  return out.sort((a, b) => sorters[f.sort](a, b) || a.v.fields.name.localeCompare(b.v.fields.name));
}
