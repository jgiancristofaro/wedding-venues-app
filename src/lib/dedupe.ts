/**
 * Duplicate detection between an incoming venue and existing records (My Venues + global library).
 */
import { milesBetween } from './geo';

export interface DedupeCandidate {
  ref: string;
  name: string;
  area?: string;
  lat?: number;
  lng?: number;
  website?: string;
}

export interface DedupeMatch {
  ref: string;
  name: string;
  score: number; // 0..1
  reason: string;
}

const STOP = new Set(['the', 'at', 'of', 'and', 'a', 'venue', 'events', 'event', 'weddings', 'wedding', 'nyc', 'ny', 'llc', 'inc']);

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ')
    .trim();
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

function tokenSetRatio(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size) - (Math.abs(A.size - B.size) > 2 ? 0.15 : 0);
}

function host(u?: string) {
  if (!u) return '';
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function similarity(x: DedupeCandidate, y: DedupeCandidate): { score: number; reason: string } {
  const hx = host(x.website);
  if (hx && hx === host(y.website) && !hx.endsWith('example.com')) return { score: 0.99, reason: 'Same website' };
  const a = normalizeName(x.name);
  const b = normalizeName(y.name);
  if (!a || !b) return { score: 0, reason: '' };
  let score = Math.max(jaroWinkler(a, b) * 0.95, tokenSetRatio(a, b) * 0.95);
  if (a === b) score = 0.97;
  let reason = a === b ? 'Same name' : 'Similar name';
  if (x.lat != null && x.lng != null && y.lat != null && y.lng != null) {
    const d = milesBetween(x.lat, x.lng, y.lat, y.lng);
    if (d < 0.5) {
      score = Math.min(1, score + 0.08);
      reason += ', same location';
    } else if (d > 25) score -= 0.3;
  } else if (x.area && y.area) {
    if (normalizeName(x.area) === normalizeName(y.area)) {
      score = Math.min(1, score + 0.04);
      reason += ', same town';
    }
  }
  return { score: +Math.max(0, score).toFixed(3), reason };
}

export const DUPLICATE_THRESHOLD = 0.88;
export const POSSIBLE_THRESHOLD = 0.78;

export function findDuplicates(c: DedupeCandidate, pool: DedupeCandidate[], limit = 3): DedupeMatch[] {
  const out: DedupeMatch[] = [];
  for (const p of pool) {
    if (p.ref === c.ref) continue;
    const { score, reason } = similarity(c, p);
    if (score >= POSSIBLE_THRESHOLD) out.push({ ref: p.ref, name: p.name, score, reason });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
