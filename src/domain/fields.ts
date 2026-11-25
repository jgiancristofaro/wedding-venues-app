import type { FieldKey, VenueFields } from './types';

export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'bool'
  | 'select'
  | 'tags'
  | 'url'
  | 'email'
  | 'phone'
  | 'spaces'
  | 'photos';
export type SectionKey =
  'basics' | 'location' | 'contact' | 'spaces' | 'catering' | 'policies' | 'logistics' | 'inclusions';

export interface FieldDef {
  key: FieldKey;
  label: string;
  section: SectionKey;
  type: FieldType;
  icon: string; // lucide icon name, resolved in UI
  options?: { value: string; label: string }[];
  /** Header synonyms for spreadsheet column auto-mapping. */
  synonyms: string[];
  /** Comparison direction for "best value" highlights. */
  better?: 'higher' | 'lower';
  compare?: boolean;
  suffix?: string;
}

export const SECTIONS: { key: SectionKey; title: string; icon: string }[] = [
  { key: 'basics', title: 'At a glance', icon: 'Sparkles' },
  { key: 'spaces', title: 'Spaces & capacity', icon: 'LayoutGrid' },
  { key: 'catering', title: 'Catering & bar', icon: 'UtensilsCrossed' },
  { key: 'inclusions', title: "What's included", icon: 'PackageCheck' },
  { key: 'policies', title: 'Policies & payments', icon: 'ScrollText' },
  { key: 'logistics', title: 'Logistics', icon: 'Car' },
  { key: 'location', title: 'Location', icon: 'MapPin' },
  { key: 'contact', title: 'Contact', icon: 'Phone' },
];

export const SETTING_OPTIONS = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'both', label: 'Indoor & outdoor' },
];
export const CATERING_OPTIONS = [
  { value: 'in_house', label: 'In-house only' },
  { value: 'preferred_list', label: 'Preferred caterers' },
  { value: 'outside_allowed', label: 'Outside catering allowed' },
];

export const INCLUSION_OPTIONS = [
  'Tables',
  'Chairs',
  'Linens',
  'Flatware & glassware',
  'AV / sound',
  'Dance floor',
  'Lighting',
  'Day-of coordinator',
  'Bridal suite',
  'Cake cutting',
  'Tasting',
  'Valet',
  'Getting-ready rooms',
];

export const STYLE_OPTIONS = [
  'Rustic',
  'Industrial',
  'Classic',
  'Modern',
  'Garden',
  'Waterfront',
  'Ballroom',
  'Barn',
  'Estate',
  'Rooftop',
  'Loft',
  'Vineyard',
  'Historic',
  'Bohemian',
  'Beach',
  'Restaurant',
  'Museum',
  'Intimate',
];

export const REGIONS = [
  'Manhattan',
  'Brooklyn',
  'Queens',
  'Hudson Valley',
  'Long Island',
  'New Jersey',
  'Connecticut',
  'Westchester',
];

export const FIELD_DEFS: FieldDef[] = [
  {
    key: 'name',
    label: 'Venue name',
    section: 'basics',
    type: 'text',
    icon: 'Building2',
    synonyms: ['name', 'venue', 'venue name', 'location name', 'place'],
  },
  {
    key: 'description',
    label: 'Description',
    section: 'basics',
    type: 'longtext',
    icon: 'AlignLeft',
    synonyms: ['description', 'about', 'overview', 'summary'],
  },
  {
    key: 'venueType',
    label: 'Venue type',
    section: 'basics',
    type: 'text',
    icon: 'Landmark',
    synonyms: ['type', 'venue type', 'category', 'kind'],
    compare: true,
  },
  {
    key: 'styleTags',
    label: 'Style',
    section: 'basics',
    type: 'tags',
    icon: 'Palette',
    synonyms: ['style', 'vibe', 'aesthetic', 'styles', 'tags'],
    compare: true,
  },
  {
    key: 'setting',
    label: 'Indoor / outdoor',
    section: 'basics',
    type: 'select',
    icon: 'Sun',
    options: SETTING_OPTIONS,
    synonyms: ['indoor/outdoor', 'indoor outdoor', 'setting', 'indoor', 'outdoor'],
    compare: true,
  },
  {
    key: 'capacitySeated',
    label: 'Seated capacity',
    section: 'spaces',
    type: 'number',
    icon: 'Armchair',
    synonyms: [
      'capacity',
      'seated',
      'seated capacity',
      'max guests',
      'guest capacity',
      'max capacity',
      'cap',
      'seated cap',
    ],
    better: 'higher',
    compare: true,
    suffix: 'guests',
  },
  {
    key: 'capacityStanding',
    label: 'Standing capacity',
    section: 'spaces',
    type: 'number',
    icon: 'Users',
    synonyms: ['standing', 'cocktail', 'standing capacity', 'reception capacity', 'cocktail capacity'],
    better: 'higher',
    compare: true,
    suffix: 'guests',
  },
  {
    key: 'spaces',
    label: 'Spaces',
    section: 'spaces',
    type: 'spaces',
    icon: 'LayoutGrid',
    synonyms: ['spaces', 'rooms', 'room', 'space'],
  },
  {
    key: 'ceremonyOnSite',
    label: 'Ceremony on-site',
    section: 'spaces',
    type: 'bool',
    icon: 'Heart',
    synonyms: ['ceremony', 'ceremony on site', 'ceremony onsite', 'on-site ceremony'],
    compare: true,
  },
  {
    key: 'rainPlan',
    label: 'Rain plan',
    section: 'spaces',
    type: 'longtext',
    icon: 'CloudRain',
    synonyms: ['rain plan', 'weather', 'backup', 'rain'],
    compare: true,
  },
  {
    key: 'cateringPolicy',
    label: 'Catering policy',
    section: 'catering',
    type: 'select',
    icon: 'ChefHat',
    options: CATERING_OPTIONS,
    synonyms: ['catering', 'catering policy', 'caterer', 'food'],
    compare: true,
  },
  {
    key: 'outsideCateringFee',
    label: 'Outside catering fee',
    section: 'catering',
    type: 'text',
    icon: 'Receipt',
    synonyms: ['outside catering fee', 'kitchen fee', 'outside vendor fee'],
  },
  {
    key: 'alcoholPolicy',
    label: 'Alcohol policy',
    section: 'catering',
    type: 'longtext',
    icon: 'Wine',
    synonyms: ['alcohol', 'bar', 'alcohol policy', 'byob', 'liquor'],
    compare: true,
  },
  {
    key: 'inclusions',
    label: 'Inclusions',
    section: 'inclusions',
    type: 'tags',
    icon: 'PackageCheck',
    synonyms: ['inclusions', 'included', 'includes', 'amenities', "what's included"],
    compare: true,
  },
  {
    key: 'hoursIncluded',
    label: 'Hours included',
    section: 'logistics',
    type: 'number',
    icon: 'Clock',
    synonyms: ['hours', 'hours included', 'event length', 'duration'],
    better: 'higher',
    compare: true,
    suffix: 'h',
  },
  {
    key: 'overtimeNotes',
    label: 'Overtime',
    section: 'logistics',
    type: 'text',
    icon: 'Timer',
    synonyms: ['overtime', 'additional hour', 'extra hour'],
  },
  {
    key: 'noiseCurfew',
    label: 'Noise curfew',
    section: 'logistics',
    type: 'text',
    icon: 'Moon',
    synonyms: ['curfew', 'noise', 'noise curfew', 'end time', 'music end'],
    compare: true,
  },
  {
    key: 'accommodations',
    label: 'Accommodations on-site',
    section: 'logistics',
    type: 'bool',
    icon: 'BedDouble',
    synonyms: ['accommodations', 'lodging', 'rooms on site', 'hotel', 'overnight'],
    compare: true,
  },
  {
    key: 'accommodationsNotes',
    label: 'Accommodation details',
    section: 'logistics',
    type: 'longtext',
    icon: 'Hotel',
    synonyms: ['accommodation notes', 'room block', 'lodging notes'],
  },
  {
    key: 'parking',
    label: 'Parking',
    section: 'logistics',
    type: 'text',
    icon: 'Car',
    synonyms: ['parking', 'valet', 'transport'],
    compare: true,
  },
  {
    key: 'accessibility',
    label: 'Accessibility',
    section: 'logistics',
    type: 'text',
    icon: 'Accessibility',
    synonyms: ['accessibility', 'ada', 'wheelchair', 'accessible'],
    compare: true,
  },
  {
    key: 'depositPolicy',
    label: 'Deposit',
    section: 'policies',
    type: 'text',
    icon: 'Landmark',
    synonyms: ['deposit', 'retainer', 'deposit policy'],
    compare: true,
  },
  {
    key: 'paymentSchedule',
    label: 'Payment schedule',
    section: 'policies',
    type: 'longtext',
    icon: 'CalendarClock',
    synonyms: ['payment schedule', 'payments', 'payment terms'],
  },
  {
    key: 'cancellationPolicy',
    label: 'Cancellation policy',
    section: 'policies',
    type: 'longtext',
    icon: 'CalendarX',
    synonyms: ['cancellation', 'cancellation policy', 'refund', 'refunds'],
    compare: true,
  },
  {
    key: 'address',
    label: 'Address',
    section: 'location',
    type: 'text',
    icon: 'MapPin',
    synonyms: ['address', 'street', 'street address', 'location', 'addr'],
  },
  {
    key: 'area',
    label: 'Neighborhood / town',
    section: 'location',
    type: 'text',
    icon: 'Map',
    synonyms: ['area', 'town', 'city', 'neighborhood', 'neighbourhood'],
    compare: true,
  },
  {
    key: 'region',
    label: 'Region',
    section: 'location',
    type: 'text',
    icon: 'Globe2',
    synonyms: ['region', 'county', 'state', 'borough', 'metro area'],
  },
  {
    key: 'website',
    label: 'Website',
    section: 'contact',
    type: 'url',
    icon: 'Globe',
    synonyms: ['website', 'url', 'link', 'web', 'site'],
  },
  {
    key: 'contactName',
    label: 'Contact name',
    section: 'contact',
    type: 'text',
    icon: 'User',
    synonyms: ['contact', 'contact name', 'coordinator', 'sales manager', 'rep'],
  },
  {
    key: 'contactEmail',
    label: 'Email',
    section: 'contact',
    type: 'email',
    icon: 'Mail',
    synonyms: ['email', 'e-mail', 'contact email'],
  },
  {
    key: 'contactPhone',
    label: 'Phone',
    section: 'contact',
    type: 'phone',
    icon: 'Phone',
    synonyms: ['phone', 'telephone', 'tel', 'contact phone', 'number'],
  },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f])) as Record<
  FieldKey,
  FieldDef
>;

export function formatFieldValue(key: FieldKey, v: VenueFields[FieldKey]): string {
  if (v == null || v === '') return '';
  const def = FIELD_BY_KEY[key];
  if (Array.isArray(v)) {
    if (key === 'spaces')
      return (v as VenueFields['spaces'])!
        .map((s) => `${s.name}${s.seated ? ` (${s.seated} seated)` : ''}`)
        .join('; ');
    if (key === 'photos') return `${v.length} photos`;
    return (v as string[]).join(', ');
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (def?.options) return def.options.find((o) => o.value === v)?.label ?? String(v);
  if (typeof v === 'number') return `${v.toLocaleString('en-US')}${def?.suffix ? ' ' + def.suffix : ''}`;
  return String(v);
}

export function isEmptyValue(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}
