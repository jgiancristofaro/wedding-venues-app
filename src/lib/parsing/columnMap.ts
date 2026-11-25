/**
 * Fuzzy column → field auto-mapping for spreadsheet imports, and row → venue conversion.
 */
import { FIELD_DEFS } from '../../domain/fields';
import type { CateringPolicy, FieldKey, Setting, VenueFields, VenueStatus } from '../../domain/types';
import { STATUSES } from '../../domain/types';
import type { PricingRules } from '../pricing/types';
import { newId } from '../pricing/sanitize';
import { parseCapacityText, parseMoney, parsePricingText } from './textHeuristics';

export type ExtraTarget =
  | 'pricingText'
  | 'perPerson'
  | 'fnbMinimum'
  | 'siteFee'
  | 'serviceCharge'
  | 'taxPct'
  | 'pricingAsOf'
  | 'capacityText'
  | 'notes'
  | 'status'
  | 'rating'
  | 'tags';
export type MapTarget = FieldKey | ExtraTarget | 'skip';

export interface ColumnMapping {
  index: number;
  header: string;
  target: MapTarget;
  confidence: number;
}

export const EXTRA_TARGETS: { key: ExtraTarget; label: string; synonyms: string[] }[] = [
  {
    key: 'pricingText',
    label: 'Pricing (free text)',
    synonyms: [
      'price',
      'pricing',
      'cost',
      'costs',
      'rate',
      'rates',
      'price notes',
      'pricing notes',
      'quote',
      'est cost',
      'estimate',
    ],
  },
  {
    key: 'perPerson',
    label: 'Per-person price',
    synonyms: [
      'per person',
      'pp',
      'price per person',
      'per guest',
      'cost per person',
      'cost per head',
      'pp price',
      '$/pp',
      'per head',
    ],
  },
  {
    key: 'fnbMinimum',
    label: 'F&B minimum',
    synonyms: [
      'minimum',
      'f&b minimum',
      'fnb min',
      'food and beverage minimum',
      'min spend',
      'minimum spend',
      'f&b min',
      'food minimum',
    ],
  },
  {
    key: 'siteFee',
    label: 'Site / rental fee',
    synonyms: ['site fee', 'rental fee', 'venue fee', 'rental', 'room fee', 'venue rental', 'facility fee'],
  },
  {
    key: 'serviceCharge',
    label: 'Service charge %',
    synonyms: ['service charge', 'service', 'service %', 'svc charge', 'service fee'],
  },
  { key: 'taxPct', label: 'Sales tax %', synonyms: ['tax', 'sales tax', 'tax rate', 'tax %'] },
  {
    key: 'pricingAsOf',
    label: 'Pricing as of',
    synonyms: ['pricing as of', 'as of', 'quote date', 'price date', 'date quoted'],
  },
  {
    key: 'capacityText',
    label: 'Capacity (free text)',
    synonyms: ['capacity notes', 'capacity (seated/standing)', 'guest count', 'max', 'capacity range'],
  },
  {
    key: 'notes',
    label: 'Notes',
    synonyms: [
      'notes',
      'comments',
      'thoughts',
      'comment',
      'remarks',
      'our notes',
      'impressions',
      'pros/cons',
      'misc',
    ],
  },
  { key: 'status', label: 'Status', synonyms: ['status', 'stage', 'progress'] },
  { key: 'rating', label: 'Rating', synonyms: ['rating', 'score', 'stars', 'rank', 'our rating'] },
  { key: 'tags', label: 'Tags', synonyms: ['labels', 'my tags', 'categories'] },
];

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%$/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): string[] {
  const t = s.replace(/\s/g, '');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice coefficient on character bigrams (0..1). */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const x of A) counts.set(x, (counts.get(x) ?? 0) + 1);
  let inter = 0;
  for (const x of B) {
    const c = counts.get(x);
    if (c) {
      inter++;
      counts.set(x, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

function scoreHeader(h: string, synonyms: string[]): number {
  const n = normalizeHeader(h);
  if (!n) return 0;
  let best = 0;
  for (const syn of synonyms) {
    const s = normalizeHeader(syn);
    if (n === s) return 1;
    if (new RegExp(`(^| )${s.replace(/[$/]/g, '\\$&')}( |$)`).test(n))
      best = Math.max(best, s.length > 3 ? 0.85 : 0.7);
    best = Math.max(best, dice(n, s) * 0.9);
  }
  return best;
}

const ALL_TARGETS: { key: MapTarget; synonyms: string[] }[] = [
  ...FIELD_DEFS.filter((f) => f.type !== 'photos').map((f) => ({
    key: f.key as MapTarget,
    synonyms: f.synonyms,
  })),
  ...EXTRA_TARGETS.map((t) => ({ key: t.key as MapTarget, synonyms: t.synonyms })),
];

function contentHint(values: string[]): { target: MapTarget; confidence: number } | null {
  const v = values
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 25);
  if (!v.length) return null;
  const ratio = (re: RegExp) => v.filter((x) => re.test(x)).length / v.length;
  if (ratio(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i) > 0.6) return { target: 'contactEmail', confidence: 0.8 };
  if (ratio(/^(https?:\/\/|www\.)/i) > 0.6) return { target: 'website', confidence: 0.8 };
  if (ratio(/^\+?[\d\s().-]{10,}$/) > 0.6) return { target: 'contactPhone', confidence: 0.7 };
  if (ratio(/\$|\bpp\b|per person|min/i) > 0.5) return { target: 'pricingText', confidence: 0.6 };
  return null;
}

/** Auto-map headers to targets. Each target is used at most once (highest confidence wins). */
export function autoMapColumns(headers: string[], sampleRows: string[][] = []): ColumnMapping[] {
  const cands: { index: number; target: MapTarget; confidence: number }[] = [];
  headers.forEach((h, i) => {
    for (const t of ALL_TARGETS) {
      const sc = scoreHeader(h, t.synonyms);
      if (sc >= 0.6) cands.push({ index: i, target: t.key, confidence: sc });
    }
    const hint = contentHint(sampleRows.map((r) => r[i] ?? ''));
    if (hint)
      cands.push({ index: i, target: hint.target, confidence: hint.confidence - (h.trim() ? 0.05 : 0) });
  });
  cands.sort((a, b) => b.confidence - a.confidence);
  const usedT = new Set<MapTarget>();
  const usedC = new Set<number>();
  const result: ColumnMapping[] = headers.map((h, i) => ({
    index: i,
    header: h,
    target: 'skip',
    confidence: 0,
  }));
  for (const c of cands) {
    if (usedT.has(c.target) || usedC.has(c.index)) continue;
    usedT.add(c.target);
    usedC.add(c.index);
    result[c.index] = {
      index: c.index,
      header: headers[c.index],
      target: c.target,
      confidence: +c.confidence.toFixed(2),
    };
  }
  // Unmapped columns with long text become notes if no notes column exists.
  if (!usedT.has('notes')) {
    for (const m of result) {
      if (m.target !== 'skip') continue;
      const vals = sampleRows.map((r) => r[m.index] ?? '').filter(Boolean);
      if (vals.length && vals.reduce((a, x) => a + x.length, 0) / vals.length > 30) {
        m.target = 'notes';
        m.confidence = 0.4;
        break;
      }
    }
  }
  return result;
}

export interface RowResult {
  fields: VenueFields;
  pricing: PricingRules;
  notes: string[];
  status?: VenueStatus;
  rating?: number;
  tags: string[];
  confidence: number;
  warnings: string[];
}

const truthy = (s: string) =>
  /^(y|yes|true|x|✓|✔|1|on[- ]?site|available|allowed)$/i.test(s.trim()) || /^yes\b/i.test(s.trim());
const falsy = (s: string) =>
  /^(n|no|false|0|none|not available|n\/a)$/i.test(s.trim()) || /^no\b/i.test(s.trim());

function parseNumber(s: string): number | undefined {
  const m = /-?\d[\d,]*(\.\d+)?/.exec(s);
  if (!m) return undefined;
  const v = parseFloat(m[0].replace(/,/g, ''));
  return Number.isFinite(v) ? v : undefined;
}

function parseSetting(s: string): Setting | undefined {
  const l = s.toLowerCase();
  const i = /indoor|inside/.test(l);
  const o = /outdoor|outside|garden|lawn/.test(l);
  if (/both|indoor\s*(\/|&|and)\s*outdoor/.test(l) || (i && o)) return 'both';
  if (i) return 'indoor';
  if (o) return 'outdoor';
  return undefined;
}

function parseCatering(s: string): CateringPolicy | undefined {
  const l = s.toLowerCase();
  if (/outside|byo|any caterer|bring your own|own caterer/.test(l)) return 'outside_allowed';
  if (/prefer|approved|list/.test(l)) return 'preferred_list';
  if (/in[- ]?house|exclusive|on[- ]?site|included|provided/.test(l)) return 'in_house';
  return undefined;
}

function toIsoDate(s: string): string | undefined {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const y = /\b(20\d\d)\b/.exec(t);
  return y ? `${y[1]}-01-01` : undefined;
}

/** Convert one spreadsheet row into a venue candidate using the mapping. */
export function rowToVenue(row: string[], mapping: ColumnMapping[]): RowResult {
  const fields: VenueFields = { name: '' };
  const pricing: PricingRules = { currency: 'USD', components: [] };
  const notes: string[] = [];
  const tags: string[] = [];
  const warnings: string[] = [];
  let status: VenueStatus | undefined;
  let rating: number | undefined;
  let mappedCount = 0;
  let parsedOk = 0;
  const pricingTexts: string[] = [];

  for (const m of mapping) {
    if (m.target === 'skip') continue;
    const raw = (row[m.index] ?? '').toString().trim();
    if (!raw) continue;
    mappedCount++;
    const t = m.target;
    const ok = () => parsedOk++;
    switch (t) {
      case 'capacitySeated':
      case 'capacityStanding': {
        const cap = parseCapacityText(raw);
        if (t === 'capacitySeated' && (cap.seated ?? cap.standing)) {
          fields.capacitySeated = cap.seated ?? cap.standing;
          if (cap.standing && cap.seated) fields.capacityStanding ??= cap.standing;
          ok();
        } else if (t === 'capacityStanding' && (cap.standing ?? cap.seated)) {
          fields.capacityStanding = cap.standing ?? cap.seated;
          ok();
        } else warnings.push(`Couldn't read capacity "${raw}"`);
        break;
      }
      case 'capacityText': {
        const cap = parseCapacityText(raw);
        if (cap.seated) fields.capacitySeated ??= cap.seated;
        if (cap.standing) fields.capacityStanding ??= cap.standing;
        if (cap.seated || cap.standing) ok();
        break;
      }
      case 'hoursIncluded': {
        const n = parseNumber(raw);
        if (n) {
          fields.hoursIncluded = n;
          pricing.hoursIncluded = n;
          ok();
        }
        break;
      }
      case 'lat':
      case 'lng': {
        const n = parseNumber(raw);
        if (n != null) {
          fields[t] = n;
          ok();
        }
        break;
      }
      case 'ceremonyOnSite':
      case 'accommodations': {
        if (truthy(raw)) fields[t] = true;
        else if (falsy(raw)) fields[t] = false;
        else {
          fields[t] = true;
          if (t === 'accommodations') fields.accommodationsNotes = raw;
        }
        ok();
        break;
      }
      case 'setting':
        fields.setting = parseSetting(raw);
        if (fields.setting) ok();
        break;
      case 'cateringPolicy':
        fields.cateringPolicy = parseCatering(raw);
        if (fields.cateringPolicy) ok();
        else notes.push(`Catering: ${raw}`);
        break;
      case 'styleTags':
      case 'inclusions':
        fields[t] = raw
          .split(/[,;/|]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        ok();
        break;
      case 'spaces':
        fields.spaces = raw.split(/[;|\n]+/).map((s) => {
          const cap = parseCapacityText(s);
          return {
            name: s.replace(/\(.*?\)|\d+\s*(seated|standing|guests)?/gi, '').trim() || s.trim(),
            seated: cap.seated,
            standing: cap.standing,
          };
        });
        ok();
        break;
      case 'pricingText':
      case 'perPerson':
      case 'fnbMinimum':
      case 'siteFee': {
        if (t === 'pricingText') pricingTexts.push(raw);
        else {
          const hasDollar = /\$|\d/.test(raw);
          const v = parseMoney(raw);
          if (v == null || !hasDollar) {
            pricingTexts.push(raw);
            break;
          }
          // Free-text inside a typed column ("$150 Sat / $125 Fri") — let the text parser handle conditions.
          if (/[a-z]{3,}/i.test(raw.replace(/per person|pp|k\b|min(imum)?|fee/gi, ''))) {
            const suffix = t === 'perPerson' ? ' per person' : t === 'fnbMinimum' ? ' minimum' : ' site fee';
            pricingTexts.push(
              raw
                .split(/[,;/]+/)
                .map((p) => (/\$|\d/.test(p) ? p + suffix : p))
                .join('; '),
            );
          } else if (t === 'perPerson')
            pricing.components.push({
              id: newId('pp'),
              kind: 'per_person',
              name: 'Per-person package',
              rates: [{ amount: v }],
            });
          else if (t === 'fnbMinimum')
            pricing.components.push({ id: newId('min'), kind: 'fnb_minimum', rates: [{ amount: v }] });
          else pricing.components.push({ id: newId('site'), kind: 'site_fee', rates: [{ amount: v }] });
        }
        ok();
        break;
      }
      case 'serviceCharge':
      case 'taxPct': {
        const n = parseNumber(raw);
        if (n != null) {
          const pct = n < 1 ? n * 100 : n;
          pricing.charges ??= {};
          if (t === 'serviceCharge') pricing.charges.serviceChargePct = pct;
          else pricing.charges.taxPct = pct;
          ok();
        }
        break;
      }
      case 'pricingAsOf': {
        const d = toIsoDate(raw);
        if (d) {
          pricing.asOf = d;
          ok();
        }
        break;
      }
      case 'notes':
        notes.push(raw);
        ok();
        break;
      case 'status': {
        const s = STATUSES.find((x) => raw.toLowerCase().includes(x.slice(0, 5)));
        if (s) status = s;
        else tags.push(raw);
        ok();
        break;
      }
      case 'rating': {
        const n = parseNumber(raw);
        if (n != null) rating = Math.max(0, Math.min(5, n > 5 ? Math.round(n / 2) : Math.round(n)));
        else if (/★|⭐|\*/.test(raw)) rating = Math.min(5, (raw.match(/★|⭐|\*/g) ?? []).length);
        ok();
        break;
      }
      case 'tags':
        tags.push(
          ...raw
            .split(/[,;|]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
        ok();
        break;
      default: {
        const def = FIELD_DEFS.find((f) => f.key === t);
        if (def?.type === 'number') {
          const n = parseNumber(raw);
          if (n != null) (fields as unknown as Record<string, unknown>)[t] = n;
        } else (fields as unknown as Record<string, unknown>)[t] = raw;
        ok();
      }
    }
  }

  if (pricingTexts.length) {
    const parsed = parsePricingText(pricingTexts.join('\n'));
    pricing.components.push(...parsed.components);
    if (parsed.charges) pricing.charges = { ...parsed.charges, ...pricing.charges };
    if (parsed.seasons) pricing.seasons = parsed.seasons;
    pricing.hoursIncluded ??= parsed.hoursIncluded;
    pricing.overtimePerHour ??= parsed.overtimePerHour;
    if (!parsed.components.length) {
      warnings.push(`Pricing text kept as a note: "${pricingTexts.join(' / ').slice(0, 80)}"`);
      notes.push(`Pricing: ${pricingTexts.join(' / ')}`);
    }
  }
  if (!fields.name) warnings.push('Missing venue name');
  const confidence = !fields.name
    ? 0.1
    : mappedCount
      ? Math.min(0.95, 0.4 + (parsedOk / mappedCount) * 0.5 + (pricing.components.length ? 0.1 : 0))
      : 0.3;
  return { fields, pricing, notes, status, rating, tags, confidence: +confidence.toFixed(2), warnings };
}
