// AI features: document/spreadsheet parsing and Magic Fill enrichment.
// Both are behind server-side flags (AI_PARSING_ENABLED, AI_ENRICH_ENABLED), OFF by default.
import {
  ALLOWED_FIELDS, ENRICH_SCHEMA, ENRICH_SYSTEM, EXTRACTION_SCHEMA, PARSE_SYSTEM, SCHEMA_VERSION,
  buildEnrichUser, buildParseUser, envFlag, remainingQuota, runWithRepair, validateEnrich, validateExtraction,
} from '../_shared/aiCore.ts';
import { cors, getUser, json, serviceClient, sha256 } from '../_shared/http.ts';
import { getProvider } from '../_shared/providers.ts';

const flags = () => ({
  aiParsing: envFlag(Deno.env.get('AI_PARSING_ENABLED')),
  aiEnrich: envFlag(Deno.env.get('AI_ENRICH_ENABLED')),
  suggestToGlobal: envFlag(Deno.env.get('SUGGEST_TO_GLOBAL_ENABLED')),
  batchIngest: envFlag(Deno.env.get('BATCH_INGEST_ENABLED')),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method === 'GET') return json(req, flags());

  const user = await getUser(req);
  if (!user) return json(req, { error: 'Sign in required' }, 401);
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const f = flags();
  if (action === 'parse' && !f.aiParsing) return json(req, { error: 'AI parsing is disabled', code: 'disabled' }, 403);
  if (action === 'enrich' && !f.aiEnrich) return json(req, { error: 'Magic Fill is disabled', code: 'disabled' }, 403);
  if (action !== 'parse' && action !== 'enrich') return json(req, { error: 'Unknown action' }, 400);

  const db = serviceClient();
  const limit = Number(Deno.env.get(action === 'parse' ? 'AI_DAILY_PARSE_LIMIT' : 'AI_DAILY_ENRICH_LIMIT') ?? (action === 'parse' ? 20 : 30));
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('feature', action).eq('cached', false).gte('created_at', since);
  if (remainingQuota(count ?? 0, limit) <= 0) return json(req, { error: `Daily limit reached (${limit}/day)`, code: 'quota' }, 429);

  try {
    if (action === 'parse') {
      const pages: string[] = Array.isArray(body.pages) ? body.pages.map((p: unknown) => String(p).slice(0, 20000)) : [];
      if (!pages.length) return json(req, { error: 'No text to parse' }, 400);
      const maxPages = Number(Deno.env.get('AI_MAX_PAGES') ?? 30);
      const key = `${SCHEMA_VERSION}:parse:${await sha256(pages.slice(0, maxPages).join('\f'))}`;
      const { data: hit } = await db.from('ai_cache').select('result').eq('cache_key', key).maybeSingle();
      if (hit) {
        await db.from('ai_usage').insert({ user_id: user.id, feature: 'parse', cached: true });
        return json(req, { ...hit.result, cached: true });
      }
      const r = await runWithRepair(getProvider(), { system: PARSE_SYSTEM, user: buildParseUser(pages, maxPages, String(body.filename ?? 'document')), schema: EXTRACTION_SCHEMA }, validateExtraction);
      await db.from('ai_usage').insert({ user_id: user.id, feature: 'parse', model: r.usage.model, input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, ok: r.ok });
      if (!r.ok) return json(req, { error: 'AI output failed validation', details: r.errors }, 502);
      await db.from('ai_cache').upsert({ cache_key: key, feature: 'parse', result: r.value });
      return json(req, r.value);
    }

    // enrich
    const venue = body.venue ?? {};
    const fields: string[] = (Array.isArray(body.fields) ? body.fields : []).filter((x: string) => ALLOWED_FIELDS.has(x)).slice(0, 20);
    if (!venue.name || !fields.length) return json(req, { error: 'Venue name and fields are required' }, 400);
    const r = await runWithRepair(getProvider(), { system: ENRICH_SYSTEM, user: buildEnrichUser(venue, fields), schema: ENRICH_SCHEMA, webSearch: true }, (raw) => validateEnrich(raw, new Set(fields)));
    await db.from('ai_usage').insert({ user_id: user.id, feature: 'enrich', model: r.usage.model, input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, ok: r.ok });
    if (!r.ok) return json(req, { error: 'AI output failed validation', details: r.errors }, 502);
    return json(req, r.value);
  } catch (e) {
    return json(req, { error: (e as Error).message }, 500);
  }
});
