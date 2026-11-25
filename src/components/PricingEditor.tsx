import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  componentKindLabel,
  DAY_SHORT,
  MONTH_NAMES,
  type AddonComponent,
  type Charges,
  type ComponentKind,
  type DayOfWeek,
  type PricingComponent,
  type PricingRules,
  type Rate,
  type When,
} from '../lib/pricing';
import { newId } from '../lib/pricing/sanitize';
import { cx, money } from '../lib/format';

const KINDS: ComponentKind[] = ['site_fee', 'fnb_minimum', 'per_person', 'capacity_tier', 'buyout', 'addon'];

function blank(kind: ComponentKind): PricingComponent {
  const id = newId(kind.slice(0, 3));
  switch (kind) {
    case 'per_person':
      return { id, kind, name: 'Package', rates: [{ amount: 0 }] };
    case 'addon':
      return { id, kind, name: 'Add-on', unit: 'flat', required: true, rates: [{ amount: 0 }] };
    case 'capacity_tier':
      return { id, kind, rates: [{ amount: 0, when: { guestMax: 100 } }], category: 'rental' };
    case 'buyout':
      return { id, kind, rates: [{ amount: 0 }], replaces: ['site_fee', 'fnb_minimum'] };
    case 'fnb_minimum':
      return { id, kind, rates: [{ amount: 0 }] };
    default:
      return { id, kind: 'site_fee', rates: [{ amount: 0 }] };
  }
}

export function describeWhen(w?: When): string {
  if (!w) return 'Default';
  const parts: string[] = [];
  if (w.dates?.length) parts.push(w.dates.join(', '));
  if (w.days?.length) parts.push(w.days.map((d) => DAY_SHORT[d]).join('/'));
  if (w.season) parts.push(w.season === 'off_peak' ? 'Off-peak' : w.season === 'peak' ? 'Peak' : 'Standard season');
  if (w.months?.length) parts.push(w.months.map((m) => MONTH_NAMES[m - 1].slice(0, 3)).join(', '));
  if (w.timeSlot) parts.push(w.timeSlot);
  if (w.guestMin != null || w.guestMax != null) parts.push(`${w.guestMin ?? 0}–${w.guestMax ?? '∞'} guests`);
  return parts.join(' · ') || 'Default';
}

const numOrU = (s: string) => (s.trim() === '' || !Number.isFinite(+s) ? undefined : +s);

function RateRow({ rate, onChange, onRemove, perPerson }: { rate: Rate; onChange: (r: Rate) => void; onRemove: () => void; perPerson?: boolean }) {
  const [open, setOpen] = useState(false);
  const w = rate.when ?? {};
  const setW = (patch: Partial<When>) => {
    const next = { ...w, ...patch };
    for (const k of Object.keys(next) as (keyof When)[]) {
      const v = next[k];
      if (v == null || (Array.isArray(v) && !v.length) || v === '') delete next[k];
    }
    onChange({ ...rate, when: Object.keys(next).length ? next : undefined });
  };
  return (
    <div className="rounded-xl border border-line bg-bg/40">
      <div className="flex items-center gap-2 p-2">
        <label className="relative">
          <span className="sr-only">Amount</span>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
          <input className="input w-32 pl-6 tabular-nums" inputMode="decimal" value={rate.amount} onChange={(e) => onChange({ ...rate, amount: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} aria-label={`Amount${perPerson ? ' per person' : ''}`} />
        </label>
        {perPerson && <span className="text-xs text-muted">/guest</span>}
        <button type="button" className="flex-1 text-left text-sm text-muted hover:text-ink inline-flex items-center gap-1 min-h-[44px]" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown size={14} className={cx('transition', open && 'rotate-180')} /> {describeWhen(rate.when)}
        </button>
        <button type="button" className="icon-btn h-9 w-9" onClick={onRemove} aria-label="Remove rate">
          <Trash2 size={15} />
        </button>
      </div>
      {open && (
        <div className="border-t border-line p-3 space-y-3 text-sm">
          <div>
            <div className="label mb-1.5">Days</div>
            <div className="flex flex-wrap gap-1.5">
              {DAY_SHORT.map((d, i) => {
                const on = !!w.days?.includes(i as DayOfWeek);
                return (
                  <button key={d} type="button" aria-pressed={on} className={cx('chip h-8 px-2.5', on && 'chip-on')} onClick={() => setW({ days: on ? w.days!.filter((x) => x !== i) : [...(w.days ?? []), i as DayOfWeek] })}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <label>
              Season
              <select className="input mt-1" value={w.season ?? ''} onChange={(e) => setW({ season: (e.target.value || undefined) as When['season'] })}>
                <option value="">Any</option>
                <option value="peak">Peak</option>
                <option value="standard">Standard</option>
                <option value="off_peak">Off-peak</option>
              </select>
            </label>
            <label>
              Min guests
              <input className="input mt-1" inputMode="numeric" value={w.guestMin ?? ''} onChange={(e) => setW({ guestMin: numOrU(e.target.value) })} />
            </label>
            <label>
              Max guests
              <input className="input mt-1" inputMode="numeric" value={w.guestMax ?? ''} onChange={(e) => setW({ guestMax: numOrU(e.target.value) })} />
            </label>
          </div>
          <div>
            <div className="label mb-1.5">Months</div>
            <div className="flex flex-wrap gap-1.5">
              {MONTH_NAMES.map((m, i) => {
                const on = !!w.months?.includes(i + 1);
                return (
                  <button key={m} type="button" aria-pressed={on} className={cx('chip h-8 px-2.5', on && 'chip-on')} onClick={() => setW({ months: on ? w.months!.filter((x) => x !== i + 1) : [...(w.months ?? []), i + 1] })}>
                    {m.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <label>
              Specific dates (YYYY-MM-DD, comma-separated)
              <input className="input mt-1" value={w.dates?.join(', ') ?? ''} onChange={(e) => setW({ dates: e.target.value.split(/[,\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) })} />
            </label>
            <label>
              Time slot
              <select className="input mt-1" value={w.timeSlot ?? ''} onChange={(e) => setW({ timeSlot: e.target.value || undefined })}>
                <option value="">Any</option>
                <option value="evening">Evening</option>
                <option value="day">Daytime</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentCard({ c, onChange, onRemove }: { c: PricingComponent; onChange: (c: PricingComponent) => void; onRemove: () => void }) {
  const setRates = (rates: Rate[]) => onChange({ ...c, rates } as PricingComponent);
  const perPerson = c.kind === 'per_person' || (c.kind === 'addon' && c.unit === 'per_person');
  return (
    <div className="card p-4 space-y-3" data-testid={`pricing-component-${c.kind}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="label">{componentKindLabel(c.kind)}</div>
          {(c.kind === 'per_person' || c.kind === 'addon') && (
            <input className="input" aria-label="Name" value={c.name} onChange={(e) => onChange({ ...c, name: e.target.value })} />
          )}
          {c.kind !== 'per_person' && c.kind !== 'addon' && (
            <input className="input" aria-label="Label" placeholder={componentKindLabel(c.kind)} value={c.label ?? ''} onChange={(e) => onChange({ ...c, label: e.target.value || undefined })} />
          )}
        </div>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove ${componentKindLabel(c.kind)}`}>
          <Trash2 size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {c.kind === 'fnb_minimum' && (
          <>
            <label className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-4 w-4" checked={!!c.includesServiceCharge} onChange={(e) => onChange({ ...c, includesServiceCharge: e.target.checked })} /> Includes service charge</label>
            <label className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-4 w-4" checked={!!c.includesTax} onChange={(e) => onChange({ ...c, includesTax: e.target.checked })} /> Includes tax</label>
          </>
        )}
        {c.kind === 'per_person' && (
          <label className="inline-flex items-center gap-2">Guest minimum <input className="input w-20 h-9" inputMode="numeric" value={c.minGuests ?? ''} onChange={(e) => onChange({ ...c, minGuests: numOrU(e.target.value) })} /></label>
        )}
        {(c.kind === 'capacity_tier' || c.kind === 'buyout') && (
          <label className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-4 w-4" checked={!!c.includesFnb} onChange={(e) => onChange({ ...c, includesFnb: e.target.checked, category: e.target.checked ? 'fnb' : 'rental' })} /> Includes food & drink</label>
        )}
        {c.kind === 'buyout' && (
          <label className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-4 w-4" checked={!!c.optional} onChange={(e) => onChange({ ...c, optional: e.target.checked })} /> Optional (only if chosen)</label>
        )}
        {c.kind === 'addon' && (
          <>
            <label className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-4 w-4" checked={c.required} onChange={(e) => onChange({ ...c, required: e.target.checked })} /> Required</label>
            <label className="inline-flex items-center gap-2">
              Unit
              <select className="input h-9 w-36" value={c.unit} onChange={(e) => onChange({ ...c, unit: e.target.value as AddonComponent['unit'] })}>
                <option value="flat">Flat</option>
                <option value="per_person">Per guest</option>
                <option value="per_hour">Per hour</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className="space-y-2">
        {c.rates.map((r, i) => (
          <RateRow key={i} rate={r} perPerson={perPerson} onChange={(nr) => setRates(c.rates.map((x, j) => (j === i ? nr : x)))} onRemove={() => setRates(c.rates.filter((_, j) => j !== i))} />
        ))}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setRates([...c.rates, { amount: 0, when: c.kind === 'capacity_tier' ? { guestMin: 0, guestMax: 0 } : { days: [6] } }])}>
          <Plus size={14} /> Add a rate {c.kind === 'capacity_tier' ? 'tier' : '(e.g. Saturday, peak season)'}
        </button>
      </div>
    </div>
  );
}

export function PricingEditor({ value, onChange }: { value: PricingRules; onChange: (r: PricingRules) => void }) {
  const ch = value.charges ?? {};
  const setCh = (patch: Partial<Charges>) => onChange({ ...value, charges: { ...ch, ...patch } });
  const pct = (k: 'serviceChargePct' | 'adminFeePct' | 'gratuityPct' | 'taxPct', label: string, placeholder?: string) => (
    <label className="text-sm">
      {label}
      <span className="relative block mt-1">
        <input className="input pr-7" inputMode="decimal" value={ch[k] ?? ''} placeholder={placeholder} onChange={(e) => setCh({ [k]: numOrU(e.target.value) })} aria-label={label} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">%</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {value.components.map((c, i) => (
          <ComponentCard
            key={c.id}
            c={c}
            onChange={(nc) => onChange({ ...value, components: value.components.map((x, j) => (j === i ? nc : x)) })}
            onRemove={() => onChange({ ...value, components: value.components.filter((_, j) => j !== i) })}
          />
        ))}
        {!value.components.length && <p className="text-sm text-muted">No pricing rules yet. Add how this venue quotes prices:</p>}
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k} type="button" className="chip" onClick={() => onChange({ ...value, components: [...value.components, blank(k)] })}>
              <Plus size={14} /> {componentKindLabel(k)}
            </button>
          ))}
        </div>
      </div>
      <fieldset className="card p-4">
        <legend className="label px-1">Service, fees & tax</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {pct('serviceChargePct', 'Service charge', 'unknown')}
          {pct('adminFeePct', 'Admin fee')}
          {pct('gratuityPct', 'Gratuity')}
          {pct('taxPct', 'Sales tax', '8.875')}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm">
          <label className="inline-flex items-center gap-2">
            Service charge applies to
            <select className="input h-9 w-40" value={ch.serviceChargeBase ?? 'fnb'} onChange={(e) => setCh({ serviceChargeBase: e.target.value as Charges['serviceChargeBase'] })}>
              <option value="fnb">Food & beverage</option>
              <option value="fnb_rental">F&B + rental</option>
              <option value="all">Everything</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-4 w-4" checked={ch.taxOnServiceCharge ?? true} onChange={(e) => setCh({ taxOnServiceCharge: e.target.checked })} /> Tax applies to service charge</label>
          <label className="inline-flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-4 w-4" checked={!!ch.noServiceCharge} onChange={(e) => setCh({ noServiceCharge: e.target.checked })} /> Venue has no service charge</label>
        </div>
      </fieldset>
      <fieldset className="card p-4 grid sm:grid-cols-4 gap-3 text-sm">
        <legend className="label px-1">Timing & seasons</legend>
        <label>
          Hours included
          <input className="input mt-1" inputMode="numeric" value={value.hoursIncluded ?? ''} onChange={(e) => onChange({ ...value, hoursIncluded: numOrU(e.target.value) })} />
        </label>
        <label>
          Overtime per hour ($)
          <input className="input mt-1" inputMode="numeric" value={value.overtimePerHour ?? ''} onChange={(e) => onChange({ ...value, overtimePerHour: numOrU(e.target.value) })} />
        </label>
        <label>
          Pricing as of
          <input className="input mt-1" type="date" value={value.asOf ?? ''} onChange={(e) => onChange({ ...value, asOf: e.target.value || undefined })} />
        </label>
        <label>
          Peak months (e.g. 5-10)
          <input
            className="input mt-1"
            defaultValue={value.seasons?.peakMonths?.join(',') ?? ''}
            onBlur={(e) => {
              const months = parseMonthList(e.target.value);
              onChange({ ...value, seasons: { ...value.seasons, peakMonths: months } });
            }}
          />
        </label>
      </fieldset>
      <p className="text-xs text-muted">Tip: rates without conditions are the default. Add a Saturday or peak-season rate and the most specific matching rate wins.</p>
      {value.components.some((c) => c.rates.some((r) => !r.amount)) && <p className="text-xs text-warn">Some rates are {money(0)} — fill them in or remove them.</p>}
    </div>
  );
}

export function parseMonthList(s: string): number[] | undefined {
  const out = new Set<number>();
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
    if (!m) continue;
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    for (let x = a; ; x = (x % 12) + 1) {
      if (x >= 1 && x <= 12) out.add(x);
      if (x === b || out.size >= 12) break;
    }
  }
  return out.size ? [...out] : undefined;
}
