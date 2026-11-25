/**
 * Non-AI fallback parser: regex + keyword heuristics that turn brochure text (or a messy
 * spreadsheet cell) into venue-field and pricing-rule *suggestions*. Always available.
 * Results carry a confidence and the source snippet/page so the Review screen can show provenance.
 */
import type { FieldKey, VenueFields } from '../../domain/types';
import type { AddonType, DayOfWeek, PricingComponent, PricingRules, Rate, When } from '../pricing/types';
import { newId } from '../pricing/sanitize';

export interface Suggestion<T = unknown> {
  value: T;
  confidence: number; // 0..1
  page?: number; // 1-based
  snippet?: string;
}

export interface Extraction {
  fields: Partial<Record<FieldKey, Suggestion>>;
  pricing: PricingRules;
  /** component id → where it came from */
  pricingSources: Record<string, Suggestion<null>>;
  warnings: string[];
}

const DAY_WORDS: Array<[RegExp, DayOfWeek]> = [
  [/\bsun(day)?s?\b/, 0],
  [/\bmon(day)?s?\b/, 1],
  [/\btue(s|sday)?s?\b/, 2],
  [/\bwed(nesday)?s?\b/, 3],
  [/\bthu(r|rs|rsday)?s?\b/, 4],
  [/\bfri(day)?s?\b/, 5],
  [/\bsat(urday)?s?\b/, 6],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/g;

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const wordNum = (w: string) => (/^\d+$/.test(w) ? +w : NUM_WORDS.indexOf(w));
const monthNum = (w: string) => MONTHS.indexOf(w.slice(0, 3)) + 1;

/** "$25k" → 25000, "$1,500.00" → 1500, "25,000" → 25000 */
export function parseMoney(s: string): number | null {
  const m = /\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K|thousand)?\b/.exec(s);
  if (!m) return null;
  let v = parseFloat(m[1].replace(/,/g, ''));
  if (m[2]) v *= 1000;
  return Number.isFinite(v) ? v : null;
}

const MONEY_G = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)\s*(k\b|K\b)?(\s*\+\+)?/g;

interface Money {
  amount: number;
  index: number;
  end: number;
  raw: string;
  plusPlus: boolean;
}
export function findMoney(s: string): Money[] {
  const out: Money[] = [];
  for (const m of s.matchAll(MONEY_G)) {
    let v = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]) v *= 1000;
    out.push({ amount: v, index: m.index!, end: m.index! + m[0].length, raw: m[0], plusPlus: !!m[3] });
  }
  return out;
}

function expandRange<T extends number>(a: T, b: T, mod: number): T[] {
  const out: T[] = [];
  let x = a as number;
  for (let i = 0; i < mod; i++) {
    out.push(x as T);
    if (x === b) break;
    x = ((x - (mod === 7 ? 0 : 1) + 1) % mod) + (mod === 7 ? 0 : 1);
  }
  return out;
}

export function detectDays(l: string): DayOfWeek[] | undefined {
  if (/\bweekdays?\b/.test(l)) return [1, 2, 3, 4];
  if (/\bweekends?\b/.test(l) && !/\bsat/.test(l)) return [5, 6, 0];
  // ranges like "monday - thursday" / "mon–thu"
  const range = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:-|–|—|to|through|thru)\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*/.exec(l);
  const key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  if (range) return expandRange(key.indexOf(range[1]) as DayOfWeek, key.indexOf(range[2]) as DayOfWeek, 7);
  const days = DAY_WORDS.filter(([re]) => re.test(l)).map(([, d]) => d);
  return days.length ? days : undefined;
}

export function detectMonths(l: string): number[] | undefined {
  const range = new RegExp(`${MONTH_RE.source}\\s*(?:-|–|—|to|through|thru)\\s*${MONTH_RE.source}`).exec(l);
  if (range) return expandRange(monthNum(range[1]), monthNum(range[2]), 12);
  const found = [...l.matchAll(MONTH_RE)].map((m) => monthNum(m[1]));
  // "may" is ambiguous ("you may"), only accept it when other months appear or it's capitalized-like context
  const filtered = found.filter((m, _i, arr) => m !== 5 || arr.length > 1 || /\bmay\s+(\d|-|–|through|to)/.test(l));
  return filtered.length ? [...new Set(filtered)] : undefined;
}

export function detectGuestRange(l: string): Pick<When, 'guestMin' | 'guestMax'> | undefined {
  let m = /(\d{2,4})\s*(?:-|–|—|to)\s*(\d{2,4})\s*(?:guests|people|ppl|pax|persons)/.exec(l);
  if (m) return { guestMin: +m[1], guestMax: +m[2] };
  m = /(?:up to|under|fewer than|less than|maximum of|max)\s*(\d{2,4})\s*(?:guests|people|persons)?/.exec(l);
  if (m && /guest|people|person|pax/.test(l)) return { guestMax: +m[1] - (/under|fewer|less/.test(m[0]) ? 1 : 0) };
  m = /(\d{2,4})\s*\+\s*(?:guests|people)|(?:over|more than|above)\s*(\d{2,4})\s*(?:guests|people)/.exec(l);
  if (m) return { guestMin: +(m[1] ?? m[2]) + (m[2] ? 1 : 0) };
  return undefined;
}

function detectSeason(l: string): When['season'] | undefined {
  if (/off[\s-]?(peak|season)|low season|winter rate|non[\s-]?peak/.test(l)) return 'off_peak';
  if (/\bpeak\b|high season|prime season/.test(l)) return 'peak';
  return undefined;
}

function conditionsFor(l: string): When | undefined {
  const w: When = {};
  const days = detectDays(l);
  if (days) w.days = days;
  const season = detectSeason(l);
  const months = detectMonths(l);
  if (season) w.season = season;
  else if (months) w.months = months;
  if (/\b(daytime|brunch|luncheon|day event|morning)\b/.test(l)) w.timeSlot = 'day';
  const d = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(l) ?? /\b(20\d\d)-(\d\d)-(\d\d)\b/.exec(l);
  if (d && /holiday|new year|special date|date-specific|override/.test(l)) {
    w.dates = [d[1].length === 4 ? `${d[1]}-${d[2]}-${d[3]}` : `${d[3]}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}`];
  }
  return Object.keys(w).length ? w : undefined;
}

const PER_PERSON_RE = /^\s*(\+\+)?\s*(?:(?:sat|sun|mon|tue|wed|thu|fri|peak|off[- ]peak|weekend|weekday)[a-z]*\.?\s+)?(?:per\s*(?:person|guest|head)|pp\b|p\/p\b|\/\s*(?:pp|person|guest|head)\b|a\s*head|each\s*guest|pps\b)/;

const ADDON_KEYS: Array<[RegExp, AddonType, string]> = [
  [/ceremony\s*(fee|site|rental|charge)?/, 'ceremony', 'Ceremony fee'],
  [/coordinator|planner|day[- ]of/, 'coordinator', 'Coordinator'],
  [/security|guard/, 'security', 'Security'],
  [/clean(ing|[- ]up)/, 'cleaning', 'Cleaning'],
  [/cake[- ]cutting|cake fee/, 'cake_cutting', 'Cake cutting'],
  [/corkage/, 'corkage', 'Corkage'],
  [/bar package|open bar|beverage package/, 'bar', 'Bar package'],
  [/tent|restroom|trailer|rentals?\b/, 'rentals', 'Rentals'],
  [/valet|coat check|permit|insurance/, 'other', 'Fee'],
];

interface Segment {
  text: string;
  lower: string;
  page: number;
}

function segments(pages: string[]): Segment[] {
  const out: Segment[] = [];
  pages.forEach((p, i) => {
    for (const rawLine of p.split(/\r?\n|•|·|•|;/)) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      // further split long lines on sentence boundaries
      const parts = line.length > 160 ? line.split(/(?<=[.!?])\s+(?=[A-Z])/) : [line];
      for (const t of parts) out.push({ text: t, lower: t.toLowerCase(), page: i + 1 });
    }
  });
  return out;
}

function snippet(s: string) {
  return s.length > 180 ? s.slice(0, 177) + '…' : s;
}

function pkgName(seg: string, before: string): string | undefined {
  const lead = before.replace(/[:\-–—|]+\s*$/, '').trim();
  const named = /([A-Z][A-Za-z'&]+(?:\s+[A-Z0-9][A-Za-z'&]*){0,3})\s*(?:package|menu|dinner|buffet|reception|collection)?\s*$/.exec(lead);
  if (named && named[1].length <= 40 && !/^(The|Per|Price|Pricing|Food|Starting|From)$/.test(named[1])) return named[1].trim();
  const m = /(package\s+[a-z0-9]+|[a-z]+\s+package)/i.exec(seg);
  return m ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
}

/** Parse pricing-ish text into rules. Exported for spreadsheet cells like "$150pp, $25k min Sat". */
export function parsePricingText(pages: string[] | string, into?: PricingRules, sources?: Record<string, Suggestion<null>>): PricingRules {
  const rules: PricingRules = into ?? { currency: 'USD', components: [] };
  const src = sources ?? {};
  const segs = segments(Array.isArray(pages) ? pages : [pages]);
  const comp = <T extends PricingComponent['kind']>(kind: T) => rules.components.find((c) => c.kind === kind);
  const charges = (rules.charges ??= {});
  const addRate = (c: PricingComponent, rate: Rate, seg: Segment, conf: number) => {
    if (!c.rates.some((r) => r.amount === rate.amount && JSON.stringify(r.when) === JSON.stringify(rate.when))) c.rates.push(rate);
    src[c.id] ??= { value: null, confidence: conf, page: seg.page, snippet: snippet(seg.text) };
  };

  for (const seg of segs) {
    const l = seg.lower;

    // Season definitions: "Peak season: May – October"
    const seasonDef = /(peak|high|prime|off[\s-]?peak|off|low)[\s-]*season[^a-z]{0,6}/.exec(l);
    if (seasonDef) {
      const months = detectMonths(l.slice(seasonDef.index));
      if (months && months.length < 12) {
        rules.seasons ??= {};
        if (/off|low/.test(seasonDef[1])) rules.seasons.offPeakMonths = months;
        else rules.seasons.peakMonths = months;
      }
    }

    // Percentages: keyword right after the number ("22% service charge"), else right before ("Service charge: 22%")
    const pcts = [...l.matchAll(/(\d{1,2}(?:\.\d{1,3})?)\s*%/g)];
    pcts.forEach((pm, i) => {
      const v = parseFloat(pm[1]);
      const end = pm.index! + pm[0].length;
      const after = l.slice(end, pcts[i + 1]?.index ?? end + 40).slice(0, 40);
      const before = l.slice(i ? pcts[i - 1].index! + pcts[i - 1][0].length : 0, pm.index!).slice(-40);
      const pick = (ctx: string) =>
        /service\s*(charge|fee)|production fee|operations fee/.test(ctx)
          ? 'serviceChargePct'
          : /admin(istrative)?\s*fee/.test(ctx)
            ? 'adminFeePct'
            : /gratuit|\btip/.test(ctx)
              ? 'gratuityPct'
              : /\btax/.test(ctx) && v < 15
                ? 'taxPct'
                : null;
      const key = pick(after.split(/[.;]/)[0]) ?? pick(before);
      if (key && charges[key] == null) charges[key] = v;
    });
    if (/no service charge|service charge (is )?not applicable|gratuity[- ]free/.test(l)) charges.noServiceCharge = true;

    // Hours / overtime
    const hm = /(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(?:hour|hr)s?\s*(?:event|reception|rental|of (?:venue|event) time|included|package|block)/.exec(l) ?? /(?:includes?|included)\s*(\d{1,2})\s*hours/.exec(l);
    if (hm && rules.hoursIncluded == null) rules.hoursIncluded = wordNum(hm[1]);

    const money = findMoney(seg.text);
    if (!money.length) continue;

    const segWhen = conditionsFor(l);
    const guestRangeSeg = detectGuestRange(l);

    if (/(additional|extra|overtime|each additional|per additional)\s*(hour|hr)|\/\s*(hour|hr)\s*(overtime|extension)/.test(l) && !/security|guard|coordinator|staff/.test(l)) {
      rules.overtimePerHour ??= money[0].amount;
      src.overtime ??= { value: null, confidence: 0.7, page: seg.page, snippet: snippet(seg.text) };
      continue;
    }
    let handled = false;
    for (let mi = 0; mi < money.length; mi++) {
      const m = money[mi];
      const prevEnd = mi ? money[mi - 1].end : 0;
      const nextStart = money[mi + 1]?.index ?? l.length;
      // text after the amount up to the next amount or clause boundary
      const afterFull = l.slice(m.end, nextStart);
      const cut = afterFull.search(/[.;|]\s|,\s*(?=\$|[a-z]+\s*\$)|\s\|/);
      const after = (cut >= 0 ? afterFull.slice(0, cut) : afterFull).slice(0, 40);
      const beforeRaw = seg.text.slice(prevEnd, m.index);
      const beforeSentence = beforeRaw.split(/(?<=[a-z0-9)])\.\s+/i).pop() ?? beforeRaw;
      const before = beforeSentence.slice(-70);
      const beforeL = before.toLowerCase();
      // Classification looks only at the words hugging the amount, so table rows like
      // "Site fee $9,000 Saturday food and beverage minimum $38,000" classify each amount correctly.
      const near = beforeL.split('|').pop()!.slice(-36) + l.slice(m.index, m.end) + after.slice(0, 14);
      const local = beforeL + ' ' + after;
      const when = conditionsFor(local) ?? (money.length === 1 ? segWhen : undefined);
      const guestRange = detectGuestRange(local) ?? (money.length === 1 ? guestRangeSeg : undefined);
      const isPP = PER_PERSON_RE.test(after) || /(per (person|guest)|\bpp)\s*[:\-–]?\s*(from\s*)?$/.test(beforeL);

      if (isPP) {
        const addon = ADDON_KEYS.find(([re]) => re.test(beforeL.slice(-40)) || re.test(after));
        if (addon && /cake|corkage|bar|beverage/.test(addon[2].toLowerCase())) {
          const c: PricingComponent = { id: newId('add'), kind: 'addon', name: addon[2], addonType: addon[1], unit: 'per_person', required: /cake|corkage/.test(addon[2].toLowerCase()), rates: [] };
          rules.components.push(c);
          addRate(c, { amount: m.amount, ...(when ? { when } : {}) }, seg, 0.6);
        } else {
          const name = pkgName(seg.text, before) ?? 'Per-person package';
          let c = rules.components.find((x) => x.kind === 'per_person' && x.name === name);
          if (!c) {
            c = { id: newId('pp'), kind: 'per_person', name, rates: [] };
            rules.components.push(c);
          }
          const minG = /minimum of (\d{2,4}) guests|(\d{2,4})[- ]guest minimum/.exec(l);
          if (minG && c.kind === 'per_person') c.minGuests = +(minG[1] ?? minG[2]);
          const w = { ...(when ?? {}), ...(guestRange ?? {}) };
          addRate(c, { amount: m.amount, ...(Object.keys(w).length ? { when: w } : {}) }, seg, 0.7);
        }
        handled = true;
        continue;
      }

      if (/min(imum)?\b|\bmin\.|f\s*&\s*b\s*min|food (and|&) bev(erage)?|spend/.test(near) && !/guest minimum|minimum of \d+ guests/.test(near)) {
        let c = comp('fnb_minimum');
        if (!c) {
          c = { id: newId('min'), kind: 'fnb_minimum', rates: [], includesServiceCharge: false, includesTax: false };
          rules.components.push(c);
        }
        if (c.kind === 'fnb_minimum') {
          if (/inclusive of (tax|service)|includes? (tax|service)|tax and service included|all[- ]inclusive/.test(l)) {
            c.includesServiceCharge = /service/.test(l);
            c.includesTax = /tax/.test(l);
          }
        }
        addRate(c, { amount: m.amount, ...(when ? { when } : {}) }, seg, 0.75);
        handled = true;
        continue;
      }

      if (/buy[\s-]?out|exclusive (use|rental)|entire (property|venue|estate)/.test(near)) {
        let c = comp('buyout');
        if (!c) {
          c = { id: newId('buy'), kind: 'buyout', rates: [], optional: /optional|available|also offer/.test(l), replaces: ['site_fee', 'fnb_minimum'] };
          rules.components.push(c);
        }
        addRate(c, { amount: m.amount, ...(when ? { when } : {}) }, seg, 0.65);
        handled = true;
        continue;
      }

      if (guestRange && /guest|people|package|all[- ]inclusive|tier/.test(l)) {
        let c = comp('capacity_tier');
        if (!c) {
          const allIn = /all[- ]inclusive|includes (dinner|food|catering|bar)/.test(l);
          c = { id: newId('tier'), kind: 'capacity_tier', rates: [], category: allIn ? 'fnb' : 'rental', includesFnb: allIn };
          rules.components.push(c);
        }
        addRate(c, { amount: m.amount, when: { ...(when ?? {}), ...guestRange } }, seg, 0.65);
        handled = true;
        continue;
      }

      const addon = ADDON_KEYS.find(([re]) => re.test(beforeL.slice(-45)) || re.test(after.slice(0, 20)));
      if (addon && !/site fee|rental fee|venue (fee|rental)/.test(near)) {
        const hourly = /\/\s*(hr|hour)|per hour|hourly/.test(after);
        const c: PricingComponent = {
          id: newId('add'),
          kind: 'addon',
          name: addon[2],
          addonType: addon[1],
          unit: hourly ? 'per_hour' : 'flat',
          required: !/optional|available|upon request|add[- ]on/.test(l),
          rates: [],
        };
        rules.components.push(c);
        addRate(c, { amount: m.amount, ...(when ? { when } : {}) }, seg, 0.55);
        handled = true;
        continue;
      }

      if (/site fee|rental fee|venue fee|room (fee|rental)|space rental|rental|venue rental|facility fee|site rental|day rate|\bfee\b/.test(near)) {
        let c = comp('site_fee');
        if (!c) {
          c = { id: newId('site'), kind: 'site_fee', rates: [] };
          rules.components.push(c);
        }
        addRate(c, { amount: m.amount, ...(when ? { when } : {}) }, seg, 0.7);
        handled = true;
      }
    }
    void handled;
  }

  if (charges && !Object.keys(charges).length) delete rules.charges;
  return rules;
}

const STYLE_WORDS: Array<[RegExp, string]> = [
  [/rustic/, 'Rustic'],
  [/industrial/, 'Industrial'],
  [/\bbarn\b/, 'Barn'],
  [/ballroom/, 'Ballroom'],
  [/garden/, 'Garden'],
  [/waterfront|harbor|riverfront|lakeside|oceanfront|on the water/, 'Waterfront'],
  [/rooftop|roof deck/, 'Rooftop'],
  [/vineyard|winery/, 'Vineyard'],
  [/historic|landmark|19th[- ]century|18\d\d/, 'Historic'],
  [/modern|contemporary/, 'Modern'],
  [/beach/, 'Beach'],
  [/\bloft\b/, 'Loft'],
  [/estate|mansion|manor/, 'Estate'],
  [/bohemian|boho/, 'Bohemian'],
  [/intimate|small weddings|micro[- ]wedding/, 'Intimate'],
];
const TYPE_WORDS = ['ballroom', 'barn', 'loft', 'estate', 'mansion', 'vineyard', 'winery', 'rooftop', 'restaurant', 'hotel', 'inn', 'greenhouse', 'conservatory', 'museum', 'library', 'boathouse', 'country club', 'warehouse', 'farm'];
const INCLUSION_WORDS: Array<[RegExp, string]> = [
  [/\btables?\b/, 'Tables'],
  [/\bchairs?\b|chiavari/, 'Chairs'],
  [/linens?/, 'Linens'],
  [/flatware|glassware|china/, 'Flatware & glassware'],
  [/sound system|\bav\b|audio[- ]visual|microphone/, 'AV / sound'],
  [/dance floor/, 'Dance floor'],
  [/uplighting|lighting/, 'Lighting'],
  [/coordinator/, 'Day-of coordinator'],
  [/bridal suite|getting[- ]ready suite/, 'Bridal suite'],
  [/tasting/, 'Tasting'],
  [/valet/, 'Valet'],
];

function firstMatch(segs: Segment[], re: RegExp): Segment | undefined {
  return segs.find((s) => re.test(s.lower));
}

/** Full document parse: fields + pricing. */
export function parseVenueText(pages: string[]): Extraction {
  const segs = segments(pages);
  const fields: Extraction['fields'] = {};
  const warnings: string[] = [];
  const set = <K extends FieldKey>(k: K, value: VenueFields[K], confidence: number, seg?: Segment) => {
    if (value == null || (Array.isArray(value) && !value.length)) return;
    if (fields[k] && (fields[k]!.confidence ?? 0) >= confidence) return;
    fields[k] = { value, confidence, page: seg?.page, snippet: seg ? snippet(seg.text) : undefined };
  };

  // Name: first short title-like line on page 1
  const nameSeg = segs.find(
    (s) => s.page === 1 && s.text.length >= 3 && s.text.length <= 60 && !/\$|\d{3}|@|www\.|http|pricing|price list|wedding packages?$/i.test(s.text) && /[A-Za-z]/.test(s.text),
  );
  if (nameSeg) set('name', nameSeg.text.replace(/\s+(weddings?|events?)\s*(guide|brochure|packages?|menu|information|info|\d{4})?\s*$/i, '').trim(), 0.5, nameSeg);

  const all = pages.join('\n');
  const url = /\b(?:https?:\/\/)?(?:www\.)[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s)]*)?/i.exec(all) ?? /https?:\/\/[^\s)]+/i.exec(all);
  if (url) set('website', url[0].startsWith('http') ? url[0] : `https://${url[0]}`, 0.8, segs.find((s) => s.text.includes(url[0])));
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(all);
  if (email) set('contactEmail', email[0], 0.9, segs.find((s) => s.text.includes(email[0])));
  const phone = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.exec(all);
  if (phone) set('contactPhone', phone[0].trim(), 0.85, segs.find((s) => s.text.includes(phone[0])));
  const addr = /\b\d{1,5}\s+(?:[A-Z][\w.'-]*\s){1,4}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Way|Place|Pl\.?|Turnpike|Highway|Hwy)\b[^\n]{0,60}/.exec(all);
  if (addr) set('address', addr[0].replace(/\s*[|•].*$/, '').trim(), 0.7, segs.find((s) => s.text.includes(addr[0].slice(0, 12))));

  // Capacities
  let seated = 0;
  let standing = 0;
  let seatSeg: Segment | undefined;
  let standSeg: Segment | undefined;
  for (const s of segs) {
    for (const m of s.lower.matchAll(/(?:seat(?:s|ed|ing)?)[^\d$%]{0,25}(\d{2,4})|(\d{2,4})\s*(?:guests\s*)?(?:seated|for dinner|banquet|seats)/g)) {
      const v = +(m[1] ?? m[2]);
      if (v > seated && v < 2000) {
        seated = v;
        seatSeg = s;
      }
    }
    for (const m of s.lower.matchAll(/(?:standing|cocktail|reception[- ]style)[^\d$%]{0,25}(\d{2,4})|(\d{2,4})\s*(?:guests\s*)?(?:standing|cocktail)/g)) {
      const v = +(m[1] ?? m[2]);
      if (v > standing && v < 3000) {
        standing = v;
        standSeg = s;
      }
    }
    const cap = /(?:capacity|accommodates?|up to|hosts? up to)\s*(?:of\s*)?(\d{2,4})\s*(?:guests|people)?/.exec(s.lower);
    if (cap && !seated && +cap[1] < 2000 && !/\$/.test(s.text.slice(0, cap.index + 2))) {
      seated = +cap[1];
      seatSeg = s;
    }
  }
  if (seated) set('capacitySeated', seated, 0.7, seatSeg);
  if (standing) set('capacityStanding', standing, 0.7, standSeg);

  const indoor = /\bindoor|ballroom|hall\b|loft/.test(all.toLowerCase());
  const outdoor = /\boutdoor|garden|lawn|terrace|patio|courtyard|meadow|beach/.test(all.toLowerCase());
  if (indoor || outdoor) set('setting', indoor && outdoor ? 'both' : indoor ? 'indoor' : 'outdoor', 0.55);

  const cer = firstMatch(segs, /ceremon(y|ies)\s*(on[- ]?site|site|space|lawn|room|location|fee|can be held|available)|on[- ]?site ceremon/);
  if (cer) set('ceremonyOnSite', true, 0.65, cer);

  const cat =
    firstMatch(segs, /outside (caterers?|catering)\s*(are\s*)?(welcome|allowed|permitted)|bring your own caterer|any licensed caterer|byo caterer/) ??
    firstMatch(segs, /preferred (caterers?|vendor|catering)|approved caterers?|list of caterers/) ??
    firstMatch(segs, /in[- ]house (catering|culinary|chef|kitchen)|exclusive caterer|catering (is )?provided|our (chef|culinary team)/);
  if (cat) {
    const v = /outside|bring your own|any licensed|byo/.test(cat.lower) ? 'outside_allowed' : /preferred|approved|list of/.test(cat.lower) ? 'preferred_list' : 'in_house';
    set('cateringPolicy', v, 0.65, cat);
  }
  const fee = firstMatch(segs, /(outside|vendor|kitchen) (catering |vendor )?fee/);
  if (fee) set('outsideCateringFee', fee.text, 0.55, fee);

  const textFields: Array<[FieldKey, RegExp]> = [
    ['alcoholPolicy', /alcohol|\bbar\b.*(package|service|policy)|byob|liquor|bartend/],
    ['rainPlan', /rain (plan|location|backup)|inclement weather|in case of rain|weather backup|tent(ed)? backup/],
    ['noiseCurfew', /curfew|music (must )?(end|stop)|amplified (music|sound)|noise ordinance|end by \d/],
    ['parking', /parking|valet|shuttle/],
    ['accessibility', /accessib|ada\b|wheelchair|elevator|step[- ]free/],
    ['depositPolicy', /deposit|retainer/],
    ['paymentSchedule', /payment schedule|balance (is )?due|final payment|installments?/],
    ['cancellationPolicy', /cancel|refund|postpone/],
    ['overtimeNotes', /additional hour|overtime|extra hour/],
  ];
  for (const [k, re] of textFields) {
    const s = firstMatch(segs, re);
    if (s) set(k, s.text, 0.5, s);
  }

  const acc = firstMatch(segs, /guest rooms|overnight|on[- ]site (lodging|accommodations?|rooms)|sleeps \d+|cottages?|cabins|suites for guests|room block/);
  if (acc) {
    set('accommodations', !/room block at nearby|nearby hotels?/.test(acc.lower), 0.55, acc);
    set('accommodationsNotes', acc.text, 0.5, acc);
  }

  const hours = /(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*(?:hour|hr)s?\s*(?:event|reception|rental|included|package)/.exec(all.toLowerCase());
  if (hours) set('hoursIncluded', wordNum(hours[1]), 0.65, segs.find((s) => s.lower.includes(hours[0])));

  const lowerAll = all.toLowerCase();
  const styles = STYLE_WORDS.filter(([re]) => re.test(lowerAll)).map(([, v]) => v);
  if (styles.length) set('styleTags', styles.slice(0, 5), 0.45);
  const type = TYPE_WORDS.find((t) => lowerAll.includes(t));
  if (type) set('venueType', type.replace(/\b\w/g, (c) => c.toUpperCase()), 0.45);
  const incl = INCLUSION_WORDS.filter(([re]) => re.test(lowerAll)).map(([, v]) => v);
  if (incl.length) set('inclusions', incl, 0.5);

  const sources: Record<string, Suggestion<null>> = {};
  const pricing = parsePricingText(pages, undefined, sources);

  const asOf = /(?:pricing|rates?|prices?)\s*(?:valid|effective|as of|for)\s*(?:through\s*)?(?:(january|february|march|april|may|june|july|august|september|october|november|december)\s*)?(\d{4})/i.exec(all) ?? /\b(20\d\d)\s*(?:pricing|rates|wedding packages|price list)/i.exec(all);
  if (asOf) {
    const year = asOf[2] ?? asOf[1];
    const mon = asOf[2] && asOf[1] ? String(monthNum(asOf[1].toLowerCase())).padStart(2, '0') : '01';
    if (/^\d{4}$/.test(year)) pricing.asOf = `${year}-${mon}-01`;
  }

  if (!pricing.components.length) warnings.push('No prices were recognized. Add pricing rules manually in the editor below.');
  if (!fields.name) warnings.push('Could not detect the venue name.');
  return { fields, pricing, pricingSources: sources, warnings };
}

/** Parse "150 seated / 200 cocktail" style capacity text. */
export function parseCapacityText(s: string): { seated?: number; standing?: number } {
  const l = s.toLowerCase();
  const out: { seated?: number; standing?: number } = {};
  const seated = /(\d{2,4})\s*(?:seated|seat|dinner|banquet)|(?:seated|dinner)\s*:?\s*(\d{2,4})/.exec(l);
  const standing = /(\d{2,4})\s*(?:standing|cocktail|reception)|(?:standing|cocktail)\s*:?\s*(\d{2,4})/.exec(l);
  if (seated) out.seated = +(seated[1] ?? seated[2]);
  if (standing) out.standing = +(standing[1] ?? standing[2]);
  if (!seated && !standing) {
    const nums = [...l.matchAll(/\d{2,4}/g)].map((m) => +m[0]);
    if (nums.length) out.seated = Math.max(...nums);
  }
  return out;
}
