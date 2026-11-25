import type { DayOfWeek, PricingOverrides, PricingRules } from '../lib/pricing/types';

export type Setting = 'indoor' | 'outdoor' | 'both';
export type CateringPolicy = 'in_house' | 'preferred_list' | 'outside_allowed';

export interface Space {
  name: string;
  seated?: number;
  standing?: number;
  notes?: string;
}

export interface Photo {
  url: string;
  caption?: string;
  /** 'generated' placeholder art, 'upload', 'document', 'web' */
  source?: string;
  /** For uploads in cloud storage. */
  storagePath?: string;
}

/** The editable venue record. Every field optional so partial imports are valid. */
export interface VenueFields {
  name: string;
  description?: string;
  address?: string;
  area?: string; // neighborhood / town
  region?: string; // Manhattan, Brooklyn, Hudson Valley …
  lat?: number;
  lng?: number;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  venueType?: string;
  styleTags?: string[];
  setting?: Setting;
  spaces?: Space[];
  capacitySeated?: number;
  capacityStanding?: number;
  ceremonyOnSite?: boolean;
  rainPlan?: string;
  cateringPolicy?: CateringPolicy;
  outsideCateringFee?: string;
  alcoholPolicy?: string;
  hoursIncluded?: number;
  overtimeNotes?: string;
  accommodations?: boolean;
  accommodationsNotes?: string;
  parking?: string;
  accessibility?: string;
  noiseCurfew?: string;
  depositPolicy?: string;
  paymentSchedule?: string;
  cancellationPolicy?: string;
  inclusions?: string[];
  photos?: Photo[];
}

export type FieldKey = keyof VenueFields;

export type ProvenanceSource =
  'manual' | 'spreadsheet' | 'document' | 'global' | 'ai_web' | 'ai_document' | 'geocoder';

export interface FieldProvenance {
  source: ProvenanceSource;
  /** e.g. "booklet.pdf p.4", "Sheet1 row 12" */
  detail?: string;
  url?: string;
  snippet?: string;
  confidence?: number; // 0..1
  at: string; // ISO timestamp
}

export interface SourceInfo {
  source: string; // e.g. "Sample data (fictional)", "Venue brochure"
  sourceUrl?: string;
  license: string; // permission / license note
  pricingAsOf?: string;
}

export interface GlobalVenue {
  id: string;
  slug?: string;
  fields: VenueFields;
  pricing: PricingRules;
  provenance: SourceInfo;
  isSample: boolean;
  published: boolean;
  updatedAt: string;
  createdAt: string;
}

export const STATUSES = ['researching', 'contacted', 'toured', 'shortlisted', 'passed', 'booked'] as const;
export type VenueStatus = (typeof STATUSES)[number];

export interface UserVenue {
  id: string;
  ownerId: string;
  globalId?: string;
  /** The global record's values as last accepted — used to compute field-level diffs. */
  globalSnapshot?: { fields: VenueFields; pricing: PricingRules; updatedAt: string };
  fields: VenueFields;
  pricing: PricingRules;
  provenance: Partial<Record<FieldKey | 'pricing', FieldProvenance>>;
  rating?: number; // 0-5
  tags: string[];
  status: VenueStatus;
  shortlistRank?: number | null;
  overrides?: PricingOverrides;
  createdAt: string;
  updatedAt: string;
}

export type NoteKind = 'note' | 'pro' | 'con';
export interface VenueNote {
  id: string;
  ownerId: string;
  venueId: string;
  kind: NoteKind;
  html: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WeddingProfile {
  guestCount: number;
  guestMin?: number;
  guestMax?: number;
  targetDate?: string;
  months?: number[];
  preferredDays?: DayOfWeek[];
  hours?: number;
  locationLabel?: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  budget?: number;
  completed?: boolean;
  updatedAt?: string;
}

export const DEFAULT_PROFILE: WeddingProfile = {
  guestCount: 120,
  preferredDays: [6],
  months: [6],
  hours: 5,
  locationLabel: 'New York, NY',
  lat: 40.7128,
  lng: -74.006,
  radiusMiles: 75,
};

export interface DocumentRecord {
  id: string;
  ownerId: string;
  venueId?: string;
  filename: string;
  mimeType: string;
  size: number;
  hash: string;
  storagePath?: string;
  pageCount?: number;
  extractedText?: string[]; // per page
  createdAt: string;
}

export type ImportJobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export interface ImportJob {
  id: string;
  ownerId: string;
  kind: 'spreadsheet' | 'document';
  label: string;
  status: ImportJobStatus;
  progress: number; // 0..1
  total: number;
  processed: number;
  errors: string[];
  results: { created: number; linked: number; updated: number; skipped: number; venueIds: string[] };
  createdAt: string;
  updatedAt: string;
}

export interface CompareSet {
  id: string;
  ownerId: string;
  name: string;
  venueRefs: string[];
  createdAt: string;
}

export interface FilterState {
  q: string;
  regions: string[];
  maxDistance?: number;
  fitsGuests: boolean;
  totalMin?: number;
  totalMax?: number;
  perGuestMax?: number;
  settings: string[];
  styles: string[];
  catering: string[];
  ceremonyOnSite: boolean;
  accommodations: boolean;
  statuses: string[];
  tags: string[];
  confidence: string[];
  sort: SortKey;
}
export type SortKey = 'total' | 'perGuest' | 'distance' | 'rating' | 'recent' | 'rank' | 'name';

export const EMPTY_FILTERS: FilterState = {
  q: '',
  regions: [],
  fitsGuests: false,
  settings: [],
  styles: [],
  catering: [],
  ceremonyOnSite: false,
  accommodations: false,
  statuses: [],
  tags: [],
  confidence: [],
  sort: 'total',
};

export interface FilterPreset {
  id: string;
  ownerId: string;
  name: string;
  scope: 'discover' | 'mine';
  filters: FilterState;
  createdAt: string;
}

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface FeatureFlags {
  aiParsing: boolean;
  aiEnrich: boolean;
  suggestToGlobal: boolean;
  batchIngest: boolean;
}

/** A venue as rendered in lists — either a global or a private record. */
export interface VenueView {
  ref: string; // "g:<id>" or "u:<id>"
  kind: 'global' | 'mine';
  id: string;
  fields: VenueFields;
  pricing: PricingRules;
  global?: GlobalVenue;
  mine?: UserVenue;
  isSample: boolean;
  pricingAsOf?: string;
}
