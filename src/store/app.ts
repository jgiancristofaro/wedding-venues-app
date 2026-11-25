import { create } from 'zustand';
import { backend, BackendError } from '../backend';
import type {
  AppUser,
  CompareSet,
  DocumentRecord,
  FeatureFlags,
  FieldKey,
  FieldProvenance,
  FilterPreset,
  GlobalVenue,
  ImportJob,
  UserVenue,
  VenueFields,
  VenueNote,
  VenueStatus,
  WeddingProfile,
} from '../domain/types';
import { DEFAULT_PROFILE } from '../domain/types';
import { copyGlobalToMine } from '../domain/venues';
import type { PricingRules } from '../lib/pricing/types';

export interface Toast {
  id: string;
  text: string;
  tone?: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
  progress?: number;
}

export type PendingAction =
  | { type: 'heart'; globalId: string }
  | { type: 'navigate'; to: string }
  | { type: 'compare-save' };

const PENDING_KEY = 'vellum:pending';
const COMPARE_KEY = 'vellum:compare';
const PROFILE_KEY = 'vellum:profile:anon';
const THEME_KEY = 'vellum:theme';

function lsGet<T>(k: string, f: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : f;
  } catch {
    return f;
  }
}
function lsSet(k: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

interface State {
  ready: boolean;
  user: AppUser | null;
  isAdmin: boolean;
  flags: FeatureFlags;
  profile: WeddingProfile;
  profileSet: boolean;
  onboardingOpen: boolean;
  globals: GlobalVenue[];
  globalsLoading: boolean;
  globalsError: string | null;
  mine: UserVenue[];
  notes: VenueNote[];
  documents: DocumentRecord[];
  jobs: ImportJob[];
  presets: FilterPreset[];
  compareSets: CompareSet[];
  compare: string[];
  toasts: Toast[];
  signIn: { open: boolean; reason?: string };
  online: boolean;
  theme: 'light' | 'dark' | 'system';

  init(): Promise<void>;
  loadUserData(): Promise<void>;
  reloadGlobals(): Promise<void>;
  requireAuth(reason: string, action?: PendingAction): boolean;
  closeSignIn(): void;
  afterSignIn(): Promise<void>;
  signOut(): Promise<void>;
  setProfile(p: WeddingProfile): Promise<void>;
  setOnboarding(open: boolean): void;

  heartGlobal(globalId: string): Promise<UserVenue | null>;
  unsave(venueId: string, opts?: { undo?: boolean }): Promise<void>;
  saveVenue(v: UserVenue): Promise<UserVenue>;
  addVenues(vs: UserVenue[]): Promise<void>;
  updateFields(id: string, patch: Partial<VenueFields>, prov?: Omit<FieldProvenance, 'at'>): Promise<void>;
  updatePricing(id: string, pricing: PricingRules, prov?: Omit<FieldProvenance, 'at'>): Promise<void>;
  patchVenue(id: string, patch: Partial<UserVenue>): Promise<void>;
  setStatus(id: string, s: VenueStatus): Promise<void>;
  addToShortlist(id: string): Promise<void>;
  removeFromShortlist(id: string): Promise<void>;
  reorderShortlist(ids: string[]): Promise<void>;

  saveNote(n: VenueNote): Promise<void>;
  deleteNote(id: string): Promise<void>;

  toggleCompare(ref: string): void;
  setCompare(refs: string[]): void;
  saveCompareSet(name: string): Promise<void>;
  deleteCompareSet(id: string): Promise<void>;
  savePreset(p: FilterPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;

  upsertJob(j: ImportJob): void;
  addDocument(d: DocumentRecord): void;
  removeDocument(d: DocumentRecord): Promise<void>;

  toast(t: Omit<Toast, 'id'> & { id?: string }, ms?: number): string;
  dismissToast(id: string): void;
  handleError(e: unknown, fallback?: string): void;
  setTheme(t: 'light' | 'dark' | 'system'): void;
}

const iso = () => new Date().toISOString();

export const useApp = create<State>((set, get) => ({
  ready: false,
  user: null,
  isAdmin: false,
  flags: { aiParsing: false, aiEnrich: false, suggestToGlobal: false, batchIngest: false },
  profile: lsGet(PROFILE_KEY, DEFAULT_PROFILE),
  profileSet: !!localStorage.getItem(PROFILE_KEY),
  onboardingOpen: false,
  globals: [],
  globalsLoading: true,
  globalsError: null,
  mine: [],
  notes: [],
  documents: [],
  jobs: [],
  presets: [],
  compareSets: [],
  compare: lsGet<string[]>(COMPARE_KEY, []),
  toasts: [],
  signIn: { open: false },
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  theme: lsGet(THEME_KEY, 'system'),

  async init() {
    window.addEventListener('online', () => set({ online: true }));
    window.addEventListener('offline', () => set({ online: false }));
    backend.onAuthChange((u) => {
      const prev = get().user;
      set({ user: u });
      if (u && u.id !== prev?.id) void get().afterSignIn();
      if (!u && prev) set({ mine: [], notes: [], documents: [], jobs: [], presets: [], compareSets: [], isAdmin: false });
    });
    void backend.flags().then((flags) => set({ flags }));
    const [user] = await Promise.all([backend.getUser().catch(() => null), get().reloadGlobals()]);
    set({ user, ready: true });
    if (user) await get().afterSignIn();
    else if (!get().profileSet) set({ onboardingOpen: true });
  },

  async reloadGlobals() {
    set({ globalsLoading: true, globalsError: null });
    try {
      const globals = await backend.listGlobal({ includeUnpublished: get().isAdmin });
      set({ globals, globalsLoading: false });
    } catch (e) {
      set({ globalsLoading: false, globalsError: e instanceof Error ? e.message : 'Could not load venues' });
    }
  },

  async loadUserData() {
    try {
      const [mine, notes, documents, jobs, presets, compareSets, profile] = await Promise.all([
        backend.listMine(),
        backend.listNotes(),
        backend.listDocuments().catch(() => []),
        backend.listJobs().catch(() => []),
        backend.listPresets().catch(() => []),
        backend.listCompareSets().catch(() => []),
        backend.getProfile(),
      ]);
      set({ mine, notes, documents, jobs, presets, compareSets });
      if (profile) set({ profile, profileSet: true });
      else if (get().profileSet) await backend.saveProfile(get().profile).catch(() => undefined);
      else set({ onboardingOpen: true });
    } catch (e) {
      get().handleError(e, 'Could not load your library');
    }
  },

  requireAuth(reason, action) {
    if (get().user) return true;
    if (action) sessionStorage.setItem(PENDING_KEY, JSON.stringify(action));
    set({ signIn: { open: true, reason } });
    return false;
  },
  closeSignIn() {
    set({ signIn: { open: false } });
  },

  async afterSignIn() {
    const u = get().user;
    if (!u) return;
    set({ signIn: { open: false } });
    const isAdmin = await backend.isAdmin(u).catch(() => false);
    set({ isAdmin });
    if (isAdmin) void get().reloadGlobals();
    await get().loadUserData();
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (raw) {
      const action = JSON.parse(raw) as PendingAction;
      if (action.type === 'heart') await get().heartGlobal(action.globalId);
      if (action.type === 'navigate') window.dispatchEvent(new CustomEvent('vellum:navigate', { detail: action.to }));
    }
  },

  async signOut() {
    await backend.signOut();
    set({ user: null, mine: [], notes: [], documents: [], isAdmin: false });
    get().toast({ text: 'Signed out' });
  },

  async setProfile(p) {
    const profile = { ...p, completed: true, updatedAt: iso() };
    set({ profile, profileSet: true });
    lsSet(PROFILE_KEY, profile);
    if (get().user) await backend.saveProfile(profile).catch((e) => get().handleError(e));
  },
  setOnboarding(open) {
    set({ onboardingOpen: open });
  },

  async heartGlobal(globalId) {
    if (!get().requireAuth('Sign in to save venues to your private library.', { type: 'heart', globalId })) return null;
    const existing = get().mine.find((m) => m.globalId === globalId);
    if (existing) return existing;
    const g = get().globals.find((x) => x.id === globalId);
    if (!g) return null;
    const copy = copyGlobalToMine(g, get().user!.id);
    set({ mine: [...get().mine, copy] });
    try {
      await backend.saveMine(copy);
    } catch (e) {
      set({ mine: get().mine.filter((m) => m.id !== copy.id) });
      get().handleError(e, 'Could not save');
      return null;
    }
    get().toast({ text: `Saved ${g.fields.name} to My Venues`, tone: 'success', action: { label: 'Undo', run: () => void get().unsave(copy.id, { undo: true }) } }, 6000);
    return copy;
  },

  async unsave(venueId, opts) {
    const v = get().mine.find((m) => m.id === venueId);
    if (!v) return;
    set({ mine: get().mine.filter((m) => m.id !== venueId), notes: get().notes.filter((n) => n.venueId !== venueId), compare: get().compare.filter((r) => r !== `u:${venueId}`) });
    try {
      await backend.deleteMine(venueId);
      if (!opts?.undo) get().toast({ text: `Removed ${v.fields.name}`, action: { label: 'Undo', run: () => void get().saveVenue(v) } }, 6000);
    } catch (e) {
      set({ mine: [...get().mine, v] });
      get().handleError(e);
    }
  },

  async saveVenue(v) {
    const next = { ...v, updatedAt: iso() };
    const list = get().mine;
    const i = list.findIndex((m) => m.id === v.id);
    set({ mine: i >= 0 ? list.map((m) => (m.id === v.id ? next : m)) : [...list, next] });
    try {
      return await backend.saveMine(next);
    } catch (e) {
      get().handleError(e, 'Could not save changes');
      return next;
    }
  },

  async addVenues(vs) {
    set({ mine: [...get().mine, ...vs] });
    await backend.saveMineBulk(vs);
  },

  async updateFields(id, patch, prov) {
    const v = get().mine.find((m) => m.id === id);
    if (!v) return;
    const provenance = { ...v.provenance };
    for (const k of Object.keys(patch) as FieldKey[]) provenance[k] = { source: 'manual', detail: 'You entered', ...prov, at: iso() };
    await get().saveVenue({ ...v, fields: { ...v.fields, ...patch }, provenance });
  },

  async updatePricing(id, pricing, prov) {
    const v = get().mine.find((m) => m.id === id);
    if (!v) return;
    await get().saveVenue({ ...v, pricing, provenance: { ...v.provenance, pricing: { source: 'manual', detail: 'You edited', ...prov, at: iso() } } });
  },

  async patchVenue(id, patch) {
    const v = get().mine.find((m) => m.id === id);
    if (v) await get().saveVenue({ ...v, ...patch });
  },

  async setStatus(id, s) {
    const v = get().mine.find((m) => m.id === id);
    if (!v) return;
    if (s === 'shortlisted' && v.shortlistRank == null) {
      const max = Math.max(0, ...get().mine.map((m) => m.shortlistRank ?? 0));
      await get().saveVenue({ ...v, status: s, shortlistRank: max + 1 });
    } else await get().saveVenue({ ...v, status: s });
  },

  async addToShortlist(id) {
    const v = get().mine.find((m) => m.id === id);
    if (!v || v.shortlistRank != null) return;
    const max = Math.max(0, ...get().mine.map((m) => m.shortlistRank ?? 0));
    await get().saveVenue({ ...v, shortlistRank: max + 1, status: v.status === 'researching' || v.status === 'contacted' || v.status === 'toured' ? 'shortlisted' : v.status });
    get().toast({ text: `Added ${v.fields.name} to your shortlist`, tone: 'success' });
  },
  async removeFromShortlist(id) {
    const v = get().mine.find((m) => m.id === id);
    if (v) await get().saveVenue({ ...v, shortlistRank: null, status: v.status === 'shortlisted' ? 'researching' : v.status });
  },

  async reorderShortlist(ids) {
    const changed: UserVenue[] = [];
    const mine = get().mine.map((m) => {
      const idx = ids.indexOf(m.id);
      if (idx < 0) return m;
      if (m.shortlistRank === idx + 1) return m;
      const n = { ...m, shortlistRank: idx + 1, updatedAt: iso() };
      changed.push(n);
      return n;
    });
    set({ mine });
    try {
      for (const v of changed) await backend.saveMine(v);
    } catch (e) {
      get().handleError(e, 'Could not save the new order');
    }
  },

  async saveNote(n) {
    const list = get().notes;
    const i = list.findIndex((x) => x.id === n.id);
    set({ notes: i >= 0 ? list.map((x) => (x.id === n.id ? n : x)) : [...list, n] });
    try {
      await backend.saveNote(n);
    } catch (e) {
      get().handleError(e, 'Could not save note');
    }
  },
  async deleteNote(id) {
    set({ notes: get().notes.filter((n) => n.id !== id) });
    await backend.deleteNote(id).catch((e) => get().handleError(e));
  },

  toggleCompare(ref) {
    const c = get().compare;
    let next: string[];
    if (c.includes(ref)) next = c.filter((r) => r !== ref);
    else if (c.length >= 4) {
      get().toast({ text: 'You can compare up to 4 venues. Remove one first.', tone: 'error' });
      return;
    } else next = [...c, ref];
    set({ compare: next });
    lsSet(COMPARE_KEY, next);
  },
  setCompare(refs) {
    const next = refs.slice(0, 4);
    set({ compare: next });
    lsSet(COMPARE_KEY, next);
  },
  async saveCompareSet(name) {
    if (!get().requireAuth('Sign in to save comparisons.', { type: 'navigate', to: '/compare' })) return;
    const s: CompareSet = { id: crypto.randomUUID(), ownerId: get().user!.id, name, venueRefs: get().compare, createdAt: iso() };
    set({ compareSets: [...get().compareSets, s] });
    await backend.saveCompareSet(s).catch((e) => get().handleError(e));
    get().toast({ text: `Saved comparison “${name}”`, tone: 'success' });
  },
  async deleteCompareSet(id) {
    set({ compareSets: get().compareSets.filter((s) => s.id !== id) });
    await backend.deleteCompareSet(id).catch((e) => get().handleError(e));
  },
  async savePreset(p) {
    set({ presets: [...get().presets.filter((x) => x.id !== p.id), p] });
    await backend.savePreset(p).catch((e) => get().handleError(e));
  },
  async deletePreset(id) {
    set({ presets: get().presets.filter((p) => p.id !== id) });
    await backend.deletePreset(id).catch((e) => get().handleError(e));
  },

  upsertJob(j) {
    const list = get().jobs;
    set({ jobs: list.some((x) => x.id === j.id) ? list.map((x) => (x.id === j.id ? j : x)) : [j, ...list] });
  },
  addDocument(d) {
    set({ documents: [...get().documents.filter((x) => x.id !== d.id), d] });
  },
  async removeDocument(d) {
    set({ documents: get().documents.filter((x) => x.id !== d.id) });
    await backend.deleteDocument(d).catch((e) => get().handleError(e));
  },

  toast(t, ms = 4000) {
    const id = t.id ?? Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts.filter((x) => x.id !== id), { ...t, id }] });
    if (ms > 0) setTimeout(() => get().dismissToast(id), ms);
    return id;
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  handleError(e, fallback = 'Something went wrong') {
    console.error(e);
    if (e instanceof BackendError && e.code === 'auth') {
      set({ signIn: { open: true, reason: e.message } });
      return;
    }
    const msg = e instanceof BackendError ? e.message : e instanceof Error && e.message ? `${fallback}: ${e.message}` : fallback;
    get().toast({ text: msg, tone: 'error' }, 7000);
  },
  setTheme(theme) {
    set({ theme });
    lsSet(THEME_KEY, theme);
    applyTheme(theme);
  },
}));

export function applyTheme(t: 'light' | 'dark' | 'system') {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
