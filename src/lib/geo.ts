/** Geo helpers + rate-limited, cached geocoding (Nominatim usage policy: ≤1 req/s, identify app, cache results). */

export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface GeoResult {
  lat: number;
  lng: number;
  displayName?: string;
}

const LS_KEY = 'vellum:geocache:v1';
function loadCache(): Record<string, GeoResult | null> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveCache(c: Record<string, GeoResult | null>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(c));
  } catch {
    /* storage full or unavailable */
  }
}

let last = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Queue so we never exceed one request per second. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, last + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

export type RemoteGeocoder = (query: string) => Promise<GeoResult | null>;

/**
 * Geocode with layered caching: localStorage → remote (Edge Function with DB cache when the
 * cloud backend is configured, else Nominatim directly from the browser).
 */
export async function geocode(query: string, remote?: RemoteGeocoder): Promise<GeoResult | null> {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return null;
  const cache = loadCache();
  if (q in cache) return cache[q];
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline');
  const result = await throttled(async () => {
    if (remote) return remote(q);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Geocoder error ${res.status}`);
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    return data[0] ? { lat: +data[0].lat, lng: +data[0].lon, displayName: data[0].display_name } : null;
  });
  cache[q] = result;
  saveCache(cache);
  return result;
}
