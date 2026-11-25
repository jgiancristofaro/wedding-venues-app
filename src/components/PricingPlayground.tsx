import { RotateCcw } from 'lucide-react';
import type { WeddingProfile } from '../domain/types';
import { estimateFor } from '../domain/venues';
import { DAY_NAMES, MONTH_NAMES, perPersonPackages, type DayOfWeek, type PricingOverrides, type PricingRules } from '../lib/pricing';
import { money, range } from '../lib/format';
import { Breakdown, ConfidenceBadge } from './Pricing';

/** Live "what if" controls: guests, date/day, month, package, buyout, add-ons, hours. */
export function PricingPlayground({
  pricing,
  profile,
  overrides,
  onOverrides,
  name,
  pricingAsOf,
}: {
  pricing: PricingRules;
  profile: WeddingProfile;
  overrides: PricingOverrides;
  onOverrides: (o: PricingOverrides) => void;
  name: string;
  pricingAsOf?: string;
}) {
  const e = estimateFor(pricing, profile, overrides);
  const pkgs = perPersonPackages(pricing);
  const buyout = pricing.components.find((c) => c.kind === 'buyout' && c.optional);
  const optAddons = pricing.components.filter((c) => c.kind === 'addon' && !c.required);
  const guests = overrides.guests ?? profile.guestCount;
  const set = (patch: Partial<PricingOverrides>) => {
    const next: PricingOverrides = { ...overrides, ...patch };
    for (const k of Object.keys(next) as (keyof PricingOverrides)[]) if (next[k] === undefined) delete next[k];
    onOverrides(next);
  };
  const customized = Object.keys(overrides).length > 0;
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      <div className="space-y-5" data-testid="pricing-controls">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="pp-guests" className="text-sm font-medium">
              Guests
            </label>
            <span className="tabular-nums text-sm" aria-hidden>
              {guests}
            </span>
          </div>
          <input
            id="pp-guests"
            type="range"
            min={10}
            max={Math.max(400, guests)}
            step={5}
            value={guests}
            onChange={(ev) => set({ guests: +ev.target.value })}
            className="w-full h-11 accent-[rgb(var(--accent))]"
            aria-valuetext={`${guests} guests`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium col-span-2">
            Specific date
            <input type="date" className="input mt-1" value={overrides.date ?? ''} onChange={(ev) => set({ date: ev.target.value || undefined, day: undefined, month: undefined })} />
          </label>
          <label className="text-sm font-medium">
            Day
            <select aria-label="Day" className="input mt-1" value={overrides.day ?? ''} disabled={!!overrides.date} onChange={(ev) => set({ day: ev.target.value === '' ? undefined : (+ev.target.value as DayOfWeek) })}>
              <option value="">From profile</option>
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Month
            <select aria-label="Month" className="input mt-1" value={overrides.month ?? ''} disabled={!!overrides.date} onChange={(ev) => set({ month: ev.target.value === '' ? undefined : +ev.target.value })}>
              <option value="">From profile</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pkgs.length > 1 && (
          <label className="text-sm font-medium block">
            Package
            <select aria-label="Package" className="input mt-1" value={overrides.packageId ?? ''} onChange={(ev) => set({ packageId: ev.target.value || undefined })}>
              <option value="">Lowest-priced (default)</option>
              {pkgs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm font-medium block">
          Event length (hours)
          <input className="input mt-1 w-28" inputMode="numeric" value={overrides.hours ?? profile.hours ?? ''} onChange={(ev) => set({ hours: +ev.target.value || undefined })} />
        </label>
        {(buyout || optAddons.length > 0) && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium mb-1">Options</legend>
            {buyout && (
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <input type="checkbox" className="h-5 w-5" checked={!!overrides.buyout} onChange={(ev) => set({ buyout: ev.target.checked || undefined })} /> Full buyout
              </label>
            )}
            {optAddons.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm min-h-[44px]">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={!!overrides.addonIds?.includes(a.id)}
                  onChange={(ev) => {
                    const ids = new Set(overrides.addonIds ?? []);
                    if (ev.target.checked) ids.add(a.id);
                    else ids.delete(a.id);
                    set({ addonIds: ids.size ? [...ids] : undefined });
                  }}
                />
                {a.kind === 'addon' ? a.name : ''}
              </label>
            ))}
          </fieldset>
        )}
        {customized && (
          <button className="btn-ghost btn-sm" onClick={() => onOverrides({})}>
            <RotateCcw size={14} /> Reset to my wedding profile
          </button>
        )}
      </div>
      <div className="card p-5 sm:p-6" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="label mb-1">Estimated all-in</div>
            <div className="font-serif text-4xl tabular-nums" data-testid="detail-total">
              {e.total == null ? 'Price on request' : money(e.total)}
            </div>
            {e.total != null && (
              <div className="text-sm text-muted mt-1 tabular-nums">
                {money(e.perGuest)} per guest{range(e.low, e.high) ? ` · range ${range(e.low, e.high)}` : ''}
              </div>
            )}
          </div>
          <ConfidenceBadge c={e.confidence} />
        </div>
        <Breakdown e={e} pricingAsOf={pricingAsOf} />
        <p className="sr-only">Estimate for {name} updated.</p>
      </div>
    </div>
  );
}
