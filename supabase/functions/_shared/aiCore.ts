/**
 * Provider-agnostic AI core. Pure TypeScript (no Deno/Node APIs) so it runs in Edge Functions
 * and in Vitest with mocked model responses.
 */

export const SCHEMA_VERSION = 'v1';

const rate = {
  type: 'object',
  additionalProperties: false,
  required: ['amount'],
  properties: {
    amount: { type: 'number' },
    label: { type: 'string' },
    when: {
      type: 'object',
      additionalProperties: false,
      properties: {
        days: { type: 'array', items: { type: 'integer' } },
        months: { type: 'array', items: { type: 'integer' } },
        season: { type: 'string', enum: ['peak', 'off_peak', 'standard'] },
        dates: { type: 'array', items: { type: 'string' } },
        timeSlot: { type: 'string' },
        guestMin: { type: 'integer' },
        guestMax: { type: 'integer' },
      },
    },
  },
};

const fieldValue = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'value', 'confidence'],
  properties: {
    field: { type: 'string' },
    value: { type: ['string', 'number', 'boolean', 'array'], items: { type: 'string' } },
    confidence: { type: 'number' },
    page: { type: 'integer' },
    snippet: { type: 'string' },
    sourceUrl: { type: 'string' },
    sourceDate: { type: 'string' },
  },
};

/** JSON schema for document/spreadsheet parsing output (mirrors src/lib/pricing/types.ts). */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields', 'pricing'],
  properties: {
    fields: { type: 'array', items: fieldValue },
    pricing: {
      type: 'object',
      additionalProperties: false,
      required: ['components'],
      properties: {
        asOf: { type: 'string' },
        seasons: {
          type: 'object',
          additionalProperties: false,
          properties: {
            peakMonths: { type: 'array', items: { type: 'integer' } },
            offPeakMonths: { type: 'array', items: { type: 'integer' } },
          },
        },
        hoursIncluded: { type: 'number' },
        overtimePerHour: { type: 'number' },
        charges: {
          type: 'object',
          additionalProperties: false,
          properties: {
            serviceChargePct: { type: 'number' },
            serviceChargeBase: { type: 'string', enum: ['fnb', 'fnb_rental', 'all'] },
            adminFeePct: { type: 'number' },
            gratuityPct: { type: 'number' },
            taxPct: { type: 'number' },
            taxOnServiceCharge: { type: 'boolean' },
            noServiceCharge: { type: 'boolean' },
          },
        },
        components: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'rates'],
            properties: {
              kind: {
                type: 'string',
                enum: ['site_fee', 'fnb_minimum', 'per_person', 'capacity_tier', 'buyout', 'addon'],
              },
              label: { type: 'string' },
              name: { type: 'string' },
              rates: { type: 'array', items: rate },
              includesServiceCharge: { type: 'boolean' },
              includesTax: { type: 'boolean' },
              includesFnb: { type: 'boolean' },
              optional: { type: 'boolean' },
              required: { type: 'boolean' },
              unit: { type: 'string', enum: ['flat', 'per_person', 'per_hour'] },
              addonType: { type: 'string' },
              category: { type: 'string', enum: ['rental', 'fnb', 'other'] },
              minGuests: { type: 'integer' },
              page: { type: 'integer' },
              snippet: { type: 'string' },
            },
          },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** JSON schema for Magic Fill (web enrichment) proposals. */
export const ENRICH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value', 'confidence', 'sourceUrl'],
        properties: {
          field: { type: 'string' },
          value: { type: ['string', 'number', 'boolean', 'array'], items: { type: 'string' } },
          confidence: { type: 'number' },
          sourceUrl: { type: 'string' },
          sourceDate: { type: 'string' },
          snippet: { type: 'string' },
        },
      },
    },
  },
} as const;

export const ALLOWED_FIELDS = new Set([
  'name',
  'description',
  'address',
  'area',
  'region',
  'website',
  'contactName',
  'contactEmail',
  'contactPhone',
  'venueType',
  'styleTags',
  'setting',
  'capacitySeated',
  'capacityStanding',
  'ceremonyOnSite',
  'rainPlan',
  'cateringPolicy',
  'outsideCateringFee',
  'alcoholPolicy',
  'hoursIncluded',
  'overtimeNotes',
  'accommodations',
  'accommodationsNotes',
  'parking',
  'accessibility',
  'noiseCurfew',
  'depositPolicy',
  'paymentSchedule',
  'cancellationPolicy',
  'inclusions',
]);

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

type Json = unknown;
type Schema = {
  type?: string | readonly string[];
  properties?: Record<string, Schema>;
  required?: readonly string[];
  items?: Schema;
  enum?: readonly string[];
  additionalProperties?: boolean;
};

function typeOf(v: Json): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

/** Minimal JSON-schema validator covering the subset used above. */
export function validate(schema: Schema, v: Json, path = '$', errors: string[] = []): string[] {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(v);
    const ok = types.some((x) => x === t || (x === 'number' && t === 'integer'));
    if (!ok) {
      errors.push(`${path}: expected ${types.join('|')}, got ${t}`);
      return errors;
    }
  }
  if (schema.enum && !schema.enum.includes(v as string))
    errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (typeOf(v) === 'object' && schema.properties) {
    const o = v as Record<string, Json>;
    for (const r of schema.required ?? []) if (!(r in o)) errors.push(`${path}.${r}: required`);
    for (const [k, val] of Object.entries(o)) {
      const sub = schema.properties[k];
      if (!sub) {
        if (schema.additionalProperties === false) errors.push(`${path}.${k}: unexpected property`);
        continue;
      }
      validate(sub, val, `${path}.${k}`, errors);
    }
  }
  if (Array.isArray(v) && schema.items)
    v.forEach((x, i) => validate(schema.items!, x, `${path}[${i}]`, errors));
  return errors;
}

export interface Extraction {
  fields: Array<{ field: string; value: unknown; confidence: number; page?: number; snippet?: string }>;
  pricing: { components: unknown[]; [k: string]: unknown };
  warnings?: string[];
}
export interface EnrichResult {
  proposals: Array<{
    field: string;
    value: unknown;
    confidence: number;
    sourceUrl: string;
    sourceDate?: string;
    snippet?: string;
  }>;
}

function semanticChecks(x: Extraction): string[] {
  const errs: string[] = [];
  x.fields.forEach((f, i) => {
    if (!ALLOWED_FIELDS.has(f.field)) errs.push(`$.fields[${i}].field: unknown field "${f.field}"`);
    if (f.confidence < 0 || f.confidence > 1) errs.push(`$.fields[${i}].confidence: must be 0..1`);
  });
  (x.pricing.components as Array<{ rates: Array<{ amount: number }> }>).forEach((c, i) =>
    c.rates.forEach((r, j) => {
      if (r.amount < 0 || r.amount > 5_000_000)
        errs.push(`$.pricing.components[${i}].rates[${j}].amount: out of range`);
    }),
  );
  return errs;
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  return JSON.parse(trimmed);
}

export function validateExtraction(raw: unknown): ValidationResult<Extraction> {
  const errors = validate(EXTRACTION_SCHEMA as unknown as Schema, raw);
  if (errors.length) return { ok: false, errors };
  const x = raw as Extraction;
  const sem = semanticChecks(x);
  return sem.length ? { ok: false, errors: sem } : { ok: true, value: x, errors: [] };
}

export function validateEnrich(
  raw: unknown,
  allowedFields: Set<string> = ALLOWED_FIELDS,
): ValidationResult<EnrichResult> {
  const errors = validate(ENRICH_SCHEMA as unknown as Schema, raw);
  if (errors.length) return { ok: false, errors };
  const r = raw as EnrichResult;
  const sem: string[] = [];
  r.proposals.forEach((p, i) => {
    if (!allowedFields.has(p.field)) sem.push(`$.proposals[${i}].field: not an allowed field`);
    if (!/^https?:\/\//.test(p.sourceUrl))
      sem.push(`$.proposals[${i}].sourceUrl: must be a public http(s) URL`);
  });
  return sem.length ? { ok: false, errors: sem } : { ok: true, value: r, errors: [] };
}

/** What a provider adapter must implement. `repairOf` carries the previous invalid output + errors. */
export interface ModelCall {
  system: string;
  user: string;
  schema: object;
  webSearch?: boolean;
  repairOf?: { output: string; errors: string[] };
}
export interface ModelReply {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}
export type CallModel = (call: ModelCall) => Promise<ModelReply>;

export interface RunResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
  attempts: number;
  usage: { inputTokens: number; outputTokens: number; model: string };
}

/** Call the model, validate, and retry once with the validation errors if needed. */
export async function runWithRepair<T>(
  callModel: CallModel,
  call: ModelCall,
  validator: (raw: unknown) => ValidationResult<T>,
): Promise<RunResult<T>> {
  const usage = { inputTokens: 0, outputTokens: 0, model: '' };
  let last: { output: string; errors: string[] } | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callModel(attempt === 1 ? call : { ...call, repairOf: last });
    usage.inputTokens += reply.inputTokens ?? 0;
    usage.outputTokens += reply.outputTokens ?? 0;
    usage.model = reply.model;
    let parsed: unknown;
    try {
      parsed = parseJsonLoose(reply.text);
    } catch (e) {
      last = { output: reply.text.slice(0, 4000), errors: [`Invalid JSON: ${(e as Error).message}`] };
      continue;
    }
    const v = validator(parsed);
    if (v.ok) return { ok: true, value: v.value, errors: [], attempts: attempt, usage };
    last = { output: reply.text.slice(0, 4000), errors: v.errors.slice(0, 20) };
  }
  return { ok: false, errors: last?.errors ?? ['Unknown error'], attempts: 2, usage };
}

export const PARSE_SYSTEM = `You extract wedding-venue facts and pricing from brochures and spreadsheets.
Return ONLY data supported by the text. Never invent prices. Each field gets a confidence 0..1, the 1-based page, and a short verbatim snippet.
Pricing must be structured rules: site_fee, fnb_minimum (with includesServiceCharge/includesTax), per_person packages (rates may vary by guest range via when.guestMin/guestMax), capacity_tier (flat price per guest-count tier), buyout, addon (unit flat|per_person|per_hour, required true/false).
Use rate.when for day-of-week (0=Sunday..6=Saturday), months (1-12), season (peak/off_peak), specific dates (YYYY-MM-DD), timeSlot.
Percentages go in charges (serviceChargePct, adminFeePct, gratuityPct, taxPct). Allowed field names: ${[...ALLOWED_FIELDS].join(', ')}.`;

export const ENRICH_SYSTEM = `You research a wedding venue on the public web and propose values ONLY for the requested missing or stale fields.
Use only publicly accessible pages (no logins, no paywalls). Every proposal must include the exact sourceUrl it came from, the page date if visible (sourceDate, YYYY-MM-DD), and a short verbatim snippet.
If you cannot find a value with a clear source, omit it. Never guess prices.`;

export function buildParseUser(pages: string[], maxPages: number, filename: string): string {
  const used = pages.slice(0, maxPages);
  return (
    `Document: ${filename}\nPages: ${used.length}${pages.length > maxPages ? ` (truncated from ${pages.length} by the per-document page limit)` : ''}\n\n` +
    used.map((p, i) => `--- PAGE ${i + 1} ---\n${p}`).join('\n\n')
  );
}

export function buildEnrichUser(
  venue: { name: string; area?: string; website?: string },
  fields: string[],
): string {
  return `Venue: ${venue.name}${venue.area ? ` (${venue.area})` : ''}${venue.website ? `\nWebsite: ${venue.website}` : ''}\nFind these fields: ${fields.join(', ')}`;
}

export function repairSuffix(r: { output: string; errors: string[] }): string {
  return `\n\nYour previous output did not validate against the schema. Errors:\n- ${r.errors.join('\n- ')}\nReturn corrected JSON only.`;
}

/** Quota check helper: returns remaining calls for today. */
export function remainingQuota(usedToday: number, dailyLimit: number): number {
  return Math.max(0, dailyLimit - usedToday);
}

export function envFlag(v: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((v ?? '').trim());
}
