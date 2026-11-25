/**
 * Demo-mode backend: everything lives in this browser (localStorage + IndexedDB) with a mock sign-in.
 * Data is namespaced per demo user, so switching accounts shows only that user's library.
 */
import { buildSeedVenues, buildStressVenues } from '../data/seedVenues';
import type { AppUser, FeatureFlags, GlobalVenue } from '../domain/types';
import { geocode } from '../lib/geo';
import { newId } from '../lib/pricing/sanitize';
import { BackendError, type Backend } from './types';
import { idb } from './idb';

const SESSION = 'vellum:demo:session';
const GLOBAL_OVERRIDES = 'vellum:demo:global';

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    throw new BackendError('This browser is out of storage space for the demo library.', 'server');
  }
}

export function demoAdminEmails(): string[] {
  const env = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? '';
  return ['admin@demo.vellum', ...env.split(',')].map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function createLocalBackend(): Backend {
  const listeners = new Set<(u: AppUser | null) => void>();
  const current = () => read<AppUser | null>(SESSION, null);
  const uid = () => {
    const u = current();
    if (!u) throw new BackendError('Please sign in first.', 'auth');
    return u.id;
  };
  const col = <T>(name: string) => ({
    key: () => `vellum:demo:${uid()}:${name}`,
    all: (): T[] => read<T[]>(`vellum:demo:${uid()}:${name}`, []),
    set: (rows: T[]) => write(`vellum:demo:${uid()}:${name}`, rows),
  });
  function upsert<T extends { id: string }>(name: string, row: T): T {
    const c = col<T>(name);
    const rows = c.all();
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    c.set(rows);
    return row;
  }
  function remove(name: string, id: string) {
    const c = col<{ id: string }>(name);
    c.set(c.all().filter((r) => r.id !== id));
  }
  const notify = () => listeners.forEach((l) => l(current()));
  const stress = Number(new URLSearchParams(location.search).get('stress') || 0);

  const backend: Backend = {
    mode: 'demo',
    async getUser() {
      return current();
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signInWithGoogle() {
      // No OAuth provider in demo mode — fall back to a demo account so the flow can be tried.
      await backend.signInDemo!('guest@demo.vellum', 'Demo Guest');
    },
    async signInWithEmail(email) {
      await backend.signInDemo!(email);
    },
    async signInDemo(email, name) {
      const e = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new BackendError('Enter a valid email address.', 'auth');
      const id = 'demo-' + Array.from(e).reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36).replace('-', 'n');
      const user: AppUser = { id, email: e, name: name || e.split('@')[0] };
      write(SESSION, user);
      notify();
      return user;
    },
    async signOut() {
      localStorage.removeItem(SESSION);
      notify();
    },
    async isAdmin(user) {
      return demoAdminEmails().includes(user.email.toLowerCase());
    },
    async flags(): Promise<FeatureFlags> {
      return { aiParsing: false, aiEnrich: false, suggestToGlobal: false, batchIngest: false };
    },
    async listGlobal(opts) {
      const overrides = read<Record<string, GlobalVenue | null>>(GLOBAL_OVERRIDES, {});
      const base = stress ? buildStressVenues(stress) : buildSeedVenues();
      const merged = base.map((v) => (v.id in overrides ? overrides[v.id] : v)).filter((v): v is GlobalVenue => !!v);
      for (const [id, v] of Object.entries(overrides)) if (v && !base.some((b) => b.id === id)) merged.push(v);
      return opts?.includeUnpublished ? merged : merged.filter((v) => v.published);
    },
    async saveGlobal(v) {
      const u = current();
      if (!u || !(await backend.isAdmin(u))) throw new BackendError('Only admins can edit the global library.', 'auth');
      const o = read<Record<string, GlobalVenue | null>>(GLOBAL_OVERRIDES, {});
      const saved = { ...v, id: v.id || newId('gv'), updatedAt: new Date().toISOString() };
      o[saved.id] = saved;
      write(GLOBAL_OVERRIDES, o);
      return saved;
    },
    async deleteGlobal(id) {
      const o = read<Record<string, GlobalVenue | null>>(GLOBAL_OVERRIDES, {});
      o[id] = null;
      write(GLOBAL_OVERRIDES, o);
    },
    listMine: async () => col<never>('venues').all(),
    saveMine: async (v) => upsert('venues', { ...v, ownerId: uid(), updatedAt: new Date().toISOString() }),
    async saveMineBulk(vs) {
      const c = col<(typeof vs)[number]>('venues');
      const rows = c.all();
      for (const v of vs) {
        const i = rows.findIndex((r) => r.id === v.id);
        if (i >= 0) rows[i] = v;
        else rows.push({ ...v, ownerId: uid() });
      }
      c.set(rows);
    },
    async deleteMine(id) {
      remove('venues', id);
      const notes = col<{ id: string; venueId: string }>('notes');
      notes.set(notes.all().filter((n) => n.venueId !== id));
    },
    listNotes: async () => col<never>('notes').all(),
    saveNote: async (n) => upsert('notes', { ...n, ownerId: uid() }),
    deleteNote: async (id) => remove('notes', id),
    getProfile: async () => read(`vellum:demo:${uid()}:profile`, null),
    saveProfile: async (p) => write(`vellum:demo:${uid()}:profile`, p),
    listDocuments: async () => col<never>('documents').all(),
    async uploadDocument(file, meta) {
      const id = newId('doc');
      const key = `${uid()}/${id}`;
      await idb.put(key, file);
      return upsert('documents', { ...meta, id, ownerId: uid(), storagePath: key, createdAt: new Date().toISOString() });
    },
    updateDocument: async (d) => void upsert('documents', d),
    async getDocumentBlob(d) {
      const b = d.storagePath ? await idb.get(d.storagePath) : undefined;
      if (!b) throw new BackendError('That file is no longer available in this browser.', 'not_found');
      return b;
    },
    async deleteDocument(d) {
      if (d.storagePath) await idb.del(d.storagePath);
      remove('documents', d.id);
    },
    listJobs: async () => col<never>('jobs').all(),
    saveJob: async (j) => void upsert('jobs', j),
    listCompareSets: async () => col<never>('compare').all(),
    saveCompareSet: async (s) => upsert('compare', { ...s, ownerId: uid() }),
    deleteCompareSet: async (id) => remove('compare', id),
    listPresets: async () => col<never>('presets').all(),
    savePreset: async (p) => upsert('presets', { ...p, ownerId: uid() }),
    deletePreset: async (id) => remove('presets', id),
    geocode: (q) => geocode(q),
    async aiParse() {
      throw new BackendError("AI features aren't enabled on this site yet.", 'disabled');
    },
    async aiEnrich() {
      throw new BackendError("AI features aren't enabled on this site yet.", 'disabled');
    },
    async fetchDocument(url) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const type = res.headers.get('content-type') ?? '';
        if (!/pdf|image/.test(type)) throw new BackendError('viewer', 'viewer');
        return await res.blob();
      } catch (e) {
        if (e instanceof BackendError) throw new BackendError(VIEWER_MSG, 'viewer');
        throw new BackendError(
          "We couldn't download that link from your browser (the site blocks it or it's an online viewer). Please download the PDF yourself, or take screenshots of the pages, and drop them here.",
          'blocked',
        );
      }
    },
    async deleteAccount() {
      const id = uid();
      for (const k of Object.keys(localStorage)) if (k.startsWith(`vellum:demo:${id}:`)) localStorage.removeItem(k);
      await backend.signOut();
    },
  };
  return backend;
}

export const VIEWER_MSG =
  'This link opens a page viewer (like an online flipbook), not a downloadable file. Please download the PDF from the viewer, or take screenshots of the pages, and upload them here.';
