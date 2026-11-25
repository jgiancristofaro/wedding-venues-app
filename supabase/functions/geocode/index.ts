// Geocoding proxy with a shared DB cache. Respects the Nominatim usage policy:
// identifies the app via User-Agent, ≤1 request/second per instance, results cached forever.
import { cors, json, serviceClient } from '../_shared/http.ts';

let last = 0;
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const { q } = await req.json().catch(() => ({ q: '' }));
  const query = String(q ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 300);
  if (!query) return json(req, { error: 'Missing query' }, 400);
  const db = serviceClient();
  const { data: hit } = await db.from('geocode_cache').select('lat,lng,display_name').eq('query', query).maybeSingle();
  if (hit) return json(req, hit.lat == null ? null : { lat: hit.lat, lng: hit.lng, displayName: hit.display_name });
  const wait = Math.max(0, last + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const ua = Deno.env.get('GEOCODER_USER_AGENT') ?? 'VellumVenueApp/1.0 (self-hosted wedding venue research app)';
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': ua, Accept: 'application/json' },
  });
  if (!res.ok) return json(req, { error: `Geocoder unavailable (${res.status})` }, 502);
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const row = data[0] ? { lat: +data[0].lat, lng: +data[0].lon, display_name: data[0].display_name } : { lat: null, lng: null, display_name: null };
  await db.from('geocode_cache').upsert({ query, ...row });
  return json(req, row.lat == null ? null : { lat: row.lat, lng: row.lng, displayName: row.display_name });
});
