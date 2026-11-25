/**
 * Cloud backend: Supabase Postgres (RLS), Auth (Google + magic link), Storage, Edge Functions.
 * Writes that fail because the device is offline are queued in an outbox and replayed when back online.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppUser,
  CompareSet,
  DocumentRecord,
  FeatureFlags,
  FilterPreset,
  GlobalVenue,
  ImportJob,
  UserVenue,
  VenueNote,
} from '../domain/types';
import { geocode } from '../lib/geo';
import { sanitizePricing } from '../lib/pricing/sanitize';
import { BackendError, type AiExtraction, type AiFieldValue, type Backend } from './types';

type Row = Record<string, unknown>;
const OUTBOX = 'vellum:outbox:v1';
const CACHE = 'vellum:cache:v1:';

interface OutboxOp {
  table: string;
  op: 'upsert' | 'delete';
  row?: Row;
  id?: string;
  key?: string;
}

const isNetworkError = (e: unknown) =>
  e instanceof TypeError ||
  /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(String((e as Error)?.message ?? e));

function toUser(
  u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined,
): AppUser | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? '',
    name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || undefined,
    avatarUrl: (u.user_metadata?.avatar_url as string) || undefined,
  };
}

const globalFromRow = (r: Row): GlobalVenue => ({
  id: r.id as string,
  slug: (r.slug as string) ?? undefined,
  fields: r.data as GlobalVenue['fields'],
  pricing: sanitizePricing(r.pricing),
  provenance: {
    source: r.source as string,
    sourceUrl: (r.source_url as string) ?? undefined,
    license: r.license_note as string,
    pricingAsOf: (r.pricing_as_of as string) ?? undefined,
  },
  isSample: !!r.is_sample,
  published: !!r.published,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const globalToRow = (v: GlobalVenue): Row => ({
  ...(v.id && !v.id.startsWith('gv_') ? { id: v.id } : {}),
  slug: v.slug ?? null,
  data: v.fields,
  pricing: v.pricing,
  source: v.provenance.source,
  source_url: v.provenance.sourceUrl ?? null,
  license_note: v.provenance.license,
  pricing_as_of: v.provenance.pricingAsOf || v.pricing.asOf || null,
  is_sample: v.isSample,
  published: v.published,
});

const mineFromRow = (r: Row): UserVenue => ({
  id: r.id as string,
  ownerId: r.owner_id as string,
  globalId: (r.global_id as string) ?? undefined,
  globalSnapshot: (r.global_snapshot as UserVenue['globalSnapshot']) ?? undefined,
  fields: r.data as UserVenue['fields'],
  pricing: sanitizePricing(r.pricing),
  provenance: (r.field_provenance as UserVenue['provenance']) ?? {},
  rating: (r.rating as number) ?? undefined,
  tags: (r.tags as string[]) ?? [],
  status: r.status as UserVenue['status'],
  shortlistRank: (r.shortlist_rank as number) ?? null,
  overrides: (r.overrides as UserVenue['overrides']) ?? undefined,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const mineToRow = (v: UserVenue): Row => ({
  id: v.id,
  owner_id: v.ownerId,
  global_id: v.globalId ?? null,
  global_snapshot: v.globalSnapshot ?? null,
  data: v.fields,
  pricing: v.pricing,
  field_provenance: v.provenance,
  rating: v.rating ?? null,
  tags: v.tags,
  status: v.status,
  shortlist_rank: v.shortlistRank ?? null,
  overrides: v.overrides ?? null,
});

const noteFromRow = (r: Row): VenueNote => ({
  id: r.id as string,
  ownerId: r.owner_id as string,
  venueId: r.venue_id as string,
  kind: r.kind as VenueNote['kind'],
  html: r.html as string,
  pinned: !!r.pinned,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const docFromRow = (r: Row): DocumentRecord => ({
  id: r.id as string,
  ownerId: r.owner_id as string,
  venueId: (r.venue_id as string) ?? undefined,
  filename: r.filename as string,
  mimeType: r.mime_type as string,
  size: r.size_bytes as number,
  hash: r.sha256 as string,
  storagePath: r.storage_path as string,
  pageCount: (r.page_count as number) ?? undefined,
  extractedText: (r.extracted_text as string[]) ?? undefined,
  createdAt: r.created_at as string,
});

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  let userId: string | null = null;

  const uid = () => {
    if (!userId) throw new BackendError('Please sign in first.', 'auth');
    return userId;
  };

  function check<T>(res: { data: T; error: { message: string; code?: string; status?: number } | null }): T {
    if (res.error) {
      const msg = res.error.message;
      if (/JWT|expired|not authenticated|401/i.test(msg) || res.error.code === 'PGRST301') {
        throw new BackendError('Your session expired. Please sign in again.', 'auth');
      }
      if (isNetworkError(msg))
        throw new BackendError("You're offline — we'll sync when you're back.", 'offline');
      throw new BackendError(msg, 'server');
    }
    return res.data;
  }

  // ── offline outbox ──
  const loadOutbox = (): OutboxOp[] => {
    try {
      return JSON.parse(localStorage.getItem(OUTBOX) || '[]');
    } catch {
      return [];
    }
  };
  const saveOutbox = (ops: OutboxOp[]) => localStorage.setItem(OUTBOX, JSON.stringify(ops));
  async function apply(op: OutboxOp) {
    if (op.op === 'upsert')
      check(await sb.from(op.table).upsert(op.row!, op.key ? { onConflict: op.key } : undefined));
    else check(await sb.from(op.table).delete().eq('id', op.id!));
  }
  async function write(op: OutboxOp) {
    try {
      await apply(op);
    } catch (e) {
      if (isNetworkError(e) || (e instanceof BackendError && e.code === 'offline') || !navigator.onLine) {
        saveOutbox([...loadOutbox(), op]);
        return;
      }
      throw e;
    }
  }
  async function flush() {
    const ops = loadOutbox();
    if (!ops.length) return;
    const left: OutboxOp[] = [];
    for (const op of ops) {
      try {
        await apply(op);
      } catch (e) {
        if (isNetworkError(e)) left.push(op);
      }
    }
    saveOutbox(left);
  }
  window.addEventListener('online', () => void flush());

  // ── read cache for offline viewing ──
  async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const k = CACHE + (userId ?? 'anon') + ':' + key;
    try {
      const v = await fn();
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* ignore quota */
      }
      return v;
    } catch (e) {
      const hit = localStorage.getItem(k);
      if (hit && (isNetworkError(e) || (e instanceof BackendError && e.code !== 'auth')))
        return JSON.parse(hit) as T;
      throw e;
    }
  }

  async function fn<T>(name: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
    const { data: s } = await sb.auth.getSession();
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${s.session?.access_token ?? anonKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => {
      throw new BackendError('Could not reach the server. Check your connection and try again.', 'offline');
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const code =
        j.code === 'disabled'
          ? 'disabled'
          : j.code === 'quota'
            ? 'quota'
            : res.status === 401
              ? 'auth'
              : j.code === 'viewer'
                ? 'viewer'
                : 'server';
      throw new BackendError(j.error || `Server error ${res.status}`, code);
    }
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? await res.json() : await res.blob()) as T;
  }

  const backend: Backend = {
    mode: 'cloud',
    async getUser() {
      const { data } = await sb.auth.getSession();
      userId = data.session?.user.id ?? null;
      if (userId) void flush();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => {
        userId = session?.user.id ?? null;
        cb(toUser(session?.user));
      });
      return () => data.subscription.unsubscribe();
    },
    async signInWithGoogle(redirectTo) {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw new BackendError(error.message, 'auth');
    },
    async signInWithEmail(email, redirectTo) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (error) throw new BackendError(error.message, 'auth');
    },
    async signOut() {
      await sb.auth.signOut();
      userId = null;
    },
    async isAdmin() {
      const { data, error } = await sb.rpc('is_admin');
      return !error && data === true;
    },
    async flags() {
      try {
        return await fn<FeatureFlags>('ai', undefined, 'GET');
      } catch {
        return { aiParsing: false, aiEnrich: false, suggestToGlobal: false, batchIngest: false };
      }
    },
    async listGlobal(opts) {
      return cached(`global:${!!opts?.includeUnpublished}`, async () => {
        const out: GlobalVenue[] = [];
        for (let from = 0; ; from += 1000) {
          let q = sb
            .from('global_venues')
            .select('*')
            .order('name')
            .range(from, from + 999);
          if (!opts?.includeUnpublished) q = q.eq('published', true);
          const rows = check(await q) as Row[];
          out.push(...rows.map(globalFromRow));
          if (rows.length < 1000) break;
        }
        return out;
      });
    },
    async saveGlobal(v) {
      const row = check(await sb.from('global_venues').upsert(globalToRow(v)).select().single()) as Row;
      return globalFromRow(row);
    },
    async deleteGlobal(id) {
      check(await sb.from('global_venues').delete().eq('id', id));
    },
    listMine: () =>
      cached('mine', async () => (check(await sb.from('user_venues').select('*')) as Row[]).map(mineFromRow)),
    async saveMine(v) {
      const row = mineToRow({ ...v, ownerId: uid() });
      await write({ table: 'user_venues', op: 'upsert', row });
      return { ...v, ownerId: uid(), updatedAt: new Date().toISOString() };
    },
    async saveMineBulk(vs) {
      const rows = vs.map((v) => mineToRow({ ...v, ownerId: uid() }));
      for (let i = 0; i < rows.length; i += 200)
        check(await sb.from('user_venues').upsert(rows.slice(i, i + 200)));
    },
    deleteMine: (id) => write({ table: 'user_venues', op: 'delete', id }),
    listNotes: () =>
      cached('notes', async () =>
        (check(await sb.from('venue_notes').select('*')) as Row[]).map(noteFromRow),
      ),
    async saveNote(n) {
      await write({
        table: 'venue_notes',
        op: 'upsert',
        row: {
          id: n.id,
          owner_id: uid(),
          venue_id: n.venueId,
          kind: n.kind,
          html: n.html,
          pinned: n.pinned,
          created_at: n.createdAt,
        },
      });
      return n;
    },
    deleteNote: (id) => write({ table: 'venue_notes', op: 'delete', id }),
    async getProfile() {
      return cached('profile', async () => {
        const r = check(await sb.from('wedding_profiles').select('data').maybeSingle()) as Row | null;
        return (r?.data as never) ?? null;
      });
    },
    saveProfile: (p) =>
      write({ table: 'wedding_profiles', op: 'upsert', row: { owner_id: uid(), data: p }, key: 'owner_id' }),
    listDocuments: async () =>
      (
        check(
          await sb
            .from('documents')
            .select(
              'id,owner_id,venue_id,filename,mime_type,size_bytes,sha256,storage_path,page_count,created_at',
            ),
        ) as Row[]
      ).map(docFromRow),
    async uploadDocument(file, meta) {
      const id = crypto.randomUUID();
      const safe = meta.filename.replace(/[^\w.-]+/g, '_').slice(-120);
      const path = `${uid()}/${id}/${safe}`;
      check(
        await sb.storage.from('documents').upload(path, file, { contentType: meta.mimeType, upsert: false }),
      );
      const row = check(
        await sb
          .from('documents')
          .insert({
            id,
            owner_id: uid(),
            venue_id: meta.venueId ?? null,
            filename: meta.filename,
            mime_type: meta.mimeType,
            size_bytes: meta.size,
            sha256: meta.hash,
            storage_path: path,
            page_count: meta.pageCount ?? null,
            extracted_text: meta.extractedText ?? null,
          })
          .select()
          .single(),
      ) as Row;
      return docFromRow(row);
    },
    async updateDocument(d) {
      check(
        await sb
          .from('documents')
          .update({
            venue_id: d.venueId ?? null,
            page_count: d.pageCount ?? null,
            extracted_text: d.extractedText ?? null,
          })
          .eq('id', d.id),
      );
    },
    async getDocumentBlob(d) {
      return check(await sb.storage.from('documents').download(d.storagePath!)) as Blob;
    },
    async deleteDocument(d) {
      if (d.storagePath) await sb.storage.from('documents').remove([d.storagePath]);
      check(await sb.from('documents').delete().eq('id', d.id));
    },
    listJobs: async () =>
      (
        check(
          await sb.from('import_jobs').select('*').order('created_at', { ascending: false }).limit(20),
        ) as Row[]
      ).map((r) => ({
        id: r.id as string,
        ownerId: r.owner_id as string,
        kind: r.kind as ImportJob['kind'],
        label: r.label as string,
        status: r.status as ImportJob['status'],
        progress: r.progress as number,
        total: r.total as number,
        processed: r.processed as number,
        errors: r.errors as string[],
        results: r.results as ImportJob['results'],
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      })),
    saveJob: (j) =>
      write({
        table: 'import_jobs',
        op: 'upsert',
        row: {
          id: j.id,
          owner_id: uid(),
          kind: j.kind,
          label: j.label,
          status: j.status,
          progress: j.progress,
          total: j.total,
          processed: j.processed,
          errors: j.errors,
          results: j.results,
        },
      }),
    listCompareSets: async () =>
      (check(await sb.from('compare_sets').select('*')) as Row[]).map((r): CompareSet => ({
        id: r.id as string,
        ownerId: r.owner_id as string,
        name: r.name as string,
        venueRefs: r.venue_refs as string[],
        createdAt: r.created_at as string,
      })),
    async saveCompareSet(s) {
      check(
        await sb
          .from('compare_sets')
          .upsert({ id: s.id, owner_id: uid(), name: s.name, venue_refs: s.venueRefs }),
      );
      return s;
    },
    deleteCompareSet: (id) => write({ table: 'compare_sets', op: 'delete', id }),
    listPresets: async () =>
      (check(await sb.from('filter_presets').select('*')) as Row[]).map((r): FilterPreset => ({
        id: r.id as string,
        ownerId: r.owner_id as string,
        name: r.name as string,
        scope: r.scope as FilterPreset['scope'],
        filters: r.filters as FilterPreset['filters'],
        createdAt: r.created_at as string,
      })),
    async savePreset(p) {
      check(
        await sb
          .from('filter_presets')
          .upsert({ id: p.id, owner_id: uid(), name: p.name, scope: p.scope, filters: p.filters }),
      );
      return p;
    },
    deletePreset: (id) => write({ table: 'filter_presets', op: 'delete', id }),
    geocode: (q) => geocode(q, (query) => fn('geocode', { q: query })),
    aiParse: (pages, filename) => fn<AiExtraction>('ai', { action: 'parse', pages, filename }),
    aiEnrich: async (venue, fields) =>
      (await fn<{ proposals: AiFieldValue[] }>('ai', { action: 'enrich', venue, fields })).proposals,
    async fetchDocument(link) {
      const r = await fn<Blob | { redirectTo?: string }>('fetch-document', { url: link });
      if (r instanceof Blob) return r;
      if (r.redirectTo) return backend.fetchDocument(r.redirectTo);
      throw new BackendError('No document found at that link.', 'viewer');
    },
    async deleteAccount() {
      await fn('delete-account', { confirm: 'DELETE' });
      await sb.auth.signOut();
      for (const k of Object.keys(localStorage))
        if (k.startsWith(CACHE) || k === OUTBOX) localStorage.removeItem(k);
    },
  };
  return backend;
}
