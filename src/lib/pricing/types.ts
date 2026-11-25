/**
 * Structured, composable venue pricing rules.
 * Pure data — no framework imports. Shared by the engine, editors, parsers and AI schema.
 */

/** 0 = Sunday … 6 = Saturday */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Season = 'peak' | 'off_peak' | 'standard';
export type CostCategory = 'rental' | 'fnb' | 'other';

/** Conditions under which a rate applies. All present conditions must match. */
export interface When {
  days?: DayOfWeek[];
  months?: number[]; // 1-12
  season?: Season;
  dates?: string[]; // ISO yyyy-mm-dd specific-date overrides
  timeSlot?: string; // e.g. 'day' | 'evening'
  guestMin?: number;
  guestMax?: number;
}

export interface Rate {
  amount: number;
  when?: When;
  label?: string;
}

interface BaseComponent {
  id: string;
  label?: string;
  notes?: string;
}

/** Flat rental / site fee. May vary by day, season, date, time slot. */
export interface SiteFeeComponent extends BaseComponent {
  kind: 'site_fee';
  rates: Rate[];
}

/** Food & beverage minimum spend. */
export interface FnbMinimumComponent extends BaseComponent {
  kind: 'fnb_minimum';
  rates: Rate[];
  includesServiceCharge?: boolean;
  includesTax?: boolean;
}

/** Per-person package (e.g. "Package B"). Rates may vary by guest-count range, day, season. */
export interface PerPersonComponent extends BaseComponent {
  kind: 'per_person';
  name: string;
  rates: Rate[];
  category?: CostCategory; // default 'fnb'
  minGuests?: number; // billed guest guarantee
}

/** Flat price by capacity tier, e.g. up to 100 guests $X, 101-150 $Y. */
export interface CapacityTierComponent extends BaseComponent {
  kind: 'capacity_tier';
  /** Each rate must carry guestMin/guestMax in `when`. */
  rates: Rate[];
  category?: CostCategory; // default 'rental'; use 'fnb' for all-inclusive packages
  includesFnb?: boolean; // all-inclusive: suppresses estimated outside catering
}

/** Full buyout pricing. */
export interface BuyoutComponent extends BaseComponent {
  kind: 'buyout';
  rates: Rate[];
  /** If true the buyout is only used when the user opts in. */
  optional?: boolean;
  /** Components suppressed when the buyout applies. */
  replaces?: Array<'site_fee' | 'fnb_minimum'>;
  includesFnb?: boolean;
  category?: CostCategory; // default 'rental'
}

export type AddonType =
  | 'ceremony'
  | 'coordinator'
  | 'security'
  | 'cleaning'
  | 'cake_cutting'
  | 'corkage'
  | 'bar'
  | 'rentals'
  | 'other';

export interface AddonComponent extends BaseComponent {
  kind: 'addon';
  name: string;
  addonType?: AddonType;
  unit: 'flat' | 'per_person' | 'per_hour';
  rates: Rate[];
  required: boolean;
  category?: CostCategory; // default 'other' (cake cutting/corkage/bar default 'fnb')
}

export type PricingComponent =
  | SiteFeeComponent
  | FnbMinimumComponent
  | PerPersonComponent
  | CapacityTierComponent
  | BuyoutComponent
  | AddonComponent;

export type ComponentKind = PricingComponent['kind'];

export type ChargeBase = 'fnb' | 'fnb_rental' | 'all';

export interface Charges {
  serviceChargePct?: number;
  serviceChargeBase?: ChargeBase; // default 'fnb'
  adminFeePct?: number;
  adminFeeBase?: ChargeBase; // default = serviceChargeBase
  gratuityPct?: number;
  gratuityBase?: ChargeBase; // default 'fnb'
  taxPct?: number; // default DEFAULT_TAX_PCT when undefined
  taxOnServiceCharge?: boolean; // default true (NY treats mandatory service charges as taxable)
  taxOnAdminFee?: boolean; // default true
  taxOnGratuity?: boolean; // default false
  /** True when the venue explicitly states there is no service charge. */
  noServiceCharge?: boolean;
}

export interface PricingRules {
  currency?: string; // default USD
  asOf?: string; // ISO date pricing was quoted
  seasons?: { peakMonths?: number[]; offPeakMonths?: number[] };
  components: PricingComponent[];
  charges?: Charges;
  hoursIncluded?: number;
  overtimePerHour?: number;
  notes?: string;
}

/** Per-venue user overrides of the wedding profile assumptions. */
export interface PricingOverrides {
  guests?: number;
  date?: string;
  day?: DayOfWeek;
  month?: number;
  packageId?: string;
  buyout?: boolean;
  addonIds?: string[];
  hours?: number;
  timeSlot?: string;
}

export interface EstimateContext {
  guests: number;
  guestMin?: number;
  guestMax?: number;
  date?: string;
  days?: DayOfWeek[];
  months?: number[];
  timeSlot?: string;
  packageId?: string;
  buyout?: boolean;
  addonIds?: string[];
  hours?: number;
  now?: Date;
  defaultTaxPct?: number;
}

export type Confidence = 'complete' | 'partial' | 'rough' | 'unknown';

export type LineCategory = 'rental' | 'fnb' | 'addons' | 'service' | 'tax';

export interface EstimateLine {
  key: string;
  label: string;
  category: LineCategory;
  amount: number;
  detail?: string;
  estimated?: boolean;
}

export interface Scenario {
  guests: number;
  day: DayOfWeek;
  month: number;
  date?: string;
  packageId?: string;
  timeSlot?: string;
}

export interface Estimate {
  total: number | null;
  perGuest: number | null;
  low: number | null;
  high: number | null;
  confidence: Confidence;
  lines: EstimateLine[];
  assumptions: string[];
  missing: string[];
  scenario: Scenario;
  stale: boolean;
  currency: string;
  /** Totals by category for stacked charts. */
  byCategory: Record<LineCategory, number>;
}
