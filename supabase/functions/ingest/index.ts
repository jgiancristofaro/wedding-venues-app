// FUTURE HOOK (inactive): batch ingestion of structured venues into the global library.
// Disabled unless BATCH_INGEST_ENABLED=true. Requires an admin JWT and provenance metadata.
import { envFlag } from '../_shared/aiCore.ts';
import { cors, getUser, isAdminEmail, json, serviceClient } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (!envFlag(Deno.env.get('BATCH_INGEST_ENABLED'))) return json(req, { error: 'Batch ingestion is not enabled', code: 'disabled' }, 503);
  const user = await getUser(req);
  if (!user || !isAdminEmail(user.email)) return json(req, { error: 'Admin only' }, 403);
  const body = await req.json().catch(() => null);
  const { source, sourceUrl, license, pricingAsOf, venues } = body ?? {};
  if (!source || !license || !Array.isArray(venues)) {
    return json(req, { error: 'Required: source, license (permission note), venues[] (each {fields, pricing})' }, 400);
  }
  const rows = venues.slice(0, 500).map((v: { fields: Record<string, unknown>; pricing?: unknown }) => ({
    data: v.fields, pricing: v.pricing ?? { components: [] }, source, source_url: sourceUrl ?? null,
    license_note: license, pricing_as_of: pricingAsOf ?? null, published: false, created_by: user.id,
  }));
  const { error, count } = await serviceClient().from('global_venues').insert(rows, { count: 'exact' });
  if (error) return json(req, { error: error.message }, 400);
  return json(req, { inserted: count, published: false });
});
