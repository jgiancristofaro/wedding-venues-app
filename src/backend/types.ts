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
  WeddingProfile,
} from '../domain/types';
import type { GeoResult } from '../lib/geo';

export interface AiFieldValue {
  field: string;
  value: unknown;
  confidence: number;
  page?: number;
  snippet?: string;
  sourceUrl?: string;
  sourceDate?: string;
}
export interface AiExtraction {
  fields: AiFieldValue[];
  pricing: unknown;
  warnings?: string[];
  cached?: boolean;
}

export class BackendError extends Error {
  constructor(
    message: string,
    public code:
      | 'offline'
      | 'auth'
      | 'disabled'
      | 'quota'
      | 'not_found'
      | 'too_large'
      | 'viewer'
      | 'blocked'
      | 'server'
      | 'unknown' = 'unknown',
  ) {
    super(message);
  }
}

export interface Backend {
  mode: 'demo' | 'cloud';
  // auth
  getUser(): Promise<AppUser | null>;
  onAuthChange(cb: (u: AppUser | null) => void): () => void;
  signInWithGoogle(redirectTo: string): Promise<void>;
  signInWithEmail(email: string, redirectTo: string): Promise<void>;
  signInDemo?(email: string, name?: string): Promise<AppUser>;
  signOut(): Promise<void>;
  isAdmin(user: AppUser): Promise<boolean>;
  flags(): Promise<FeatureFlags>;
  // global library
  listGlobal(opts?: { includeUnpublished?: boolean }): Promise<GlobalVenue[]>;
  saveGlobal(v: GlobalVenue): Promise<GlobalVenue>;
  deleteGlobal(id: string): Promise<void>;
  // private library
  listMine(): Promise<UserVenue[]>;
  saveMine(v: UserVenue): Promise<UserVenue>;
  saveMineBulk(vs: UserVenue[]): Promise<void>;
  deleteMine(id: string): Promise<void>;
  listNotes(): Promise<VenueNote[]>;
  saveNote(n: VenueNote): Promise<VenueNote>;
  deleteNote(id: string): Promise<void>;
  getProfile(): Promise<WeddingProfile | null>;
  saveProfile(p: WeddingProfile): Promise<void>;
  // documents
  listDocuments(): Promise<DocumentRecord[]>;
  uploadDocument(
    file: Blob,
    meta: Omit<DocumentRecord, 'id' | 'ownerId' | 'createdAt' | 'storagePath'>,
  ): Promise<DocumentRecord>;
  updateDocument(d: DocumentRecord): Promise<void>;
  getDocumentBlob(d: DocumentRecord): Promise<Blob>;
  deleteDocument(d: DocumentRecord): Promise<void>;
  // jobs / sets / presets
  listJobs(): Promise<ImportJob[]>;
  saveJob(j: ImportJob): Promise<void>;
  listCompareSets(): Promise<CompareSet[]>;
  saveCompareSet(s: CompareSet): Promise<CompareSet>;
  deleteCompareSet(id: string): Promise<void>;
  listPresets(): Promise<FilterPreset[]>;
  savePreset(p: FilterPreset): Promise<FilterPreset>;
  deletePreset(id: string): Promise<void>;
  // services
  geocode(q: string): Promise<GeoResult | null>;
  aiParse(pages: string[], filename: string): Promise<AiExtraction>;
  aiEnrich(
    venue: { name: string; area?: string; website?: string },
    fields: string[],
  ): Promise<AiFieldValue[]>;
  fetchDocument(url: string): Promise<Blob>;
  deleteAccount(): Promise<void>;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
