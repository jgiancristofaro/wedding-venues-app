import { CATERING_OPTIONS, REGIONS, SETTING_OPTIONS, STYLE_OPTIONS } from '../domain/fields';
import { EMPTY_FILTERS, STATUSES, type FilterState } from '../domain/types';
import { cx } from '../lib/format';
import { Modal, Toggle } from './ui';

function Chips({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <fieldset>
      <legend className="label mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button key={o.value} type="button" className={cx('chip', on && 'chip-on')} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Number(s.replace(/[^\d.]/g, ''))));

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  for (const k of ['regions', 'settings', 'styles', 'catering', 'statuses', 'tags', 'confidence'] as const) n += f[k].length ? 1 : 0;
  for (const k of ['maxDistance', 'totalMin', 'totalMax', 'perGuestMax'] as const) n += f[k] != null ? 1 : 0;
  for (const k of ['fitsGuests', 'ceremonyOnSite', 'accommodations'] as const) n += f[k] ? 1 : 0;
  return n;
}

export function FiltersDialog({
  open,
  onClose,
  value,
  onChange,
  scope,
  allTags,
  guestCount,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  value: FilterState;
  onChange: (f: FilterState) => void;
  scope: 'discover' | 'mine';
  allTags: string[];
  guestCount: number;
  resultCount: number;
}) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      wide
      footer={
        <>
          <button className="btn-ghost mr-auto" onClick={() => onChange({ ...EMPTY_FILTERS, q: value.q, sort: value.sort })}>
            Clear all
          </button>
          <button className="btn-primary" onClick={onClose}>
            Show {resultCount} venues
          </button>
        </>
      }
    >
      <div className="space-y-6 py-2">
        <div className="grid sm:grid-cols-3 gap-3">
          <Toggle checked={value.fitsGuests} onChange={(v) => set('fitsGuests', v)} label={`Fits ${guestCount} guests`} />
          <Toggle checked={value.ceremonyOnSite} onChange={(v) => set('ceremonyOnSite', v)} label="Ceremony on-site" />
          <Toggle checked={value.accommodations} onChange={(v) => set('accommodations', v)} label="Accommodations" />
        </div>
        <fieldset>
          <legend className="label mb-2">Estimated total</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-sm">
              Min $<input className="input mt-1" inputMode="numeric" value={value.totalMin ?? ''} onChange={(e) => set('totalMin', num(e.target.value))} aria-label="Minimum estimated total" />
            </label>
            <label className="text-sm">
              Max $<input className="input mt-1" inputMode="numeric" value={value.totalMax ?? ''} onChange={(e) => set('totalMax', num(e.target.value))} aria-label="Maximum estimated total" />
            </label>
            <label className="text-sm">
              Max per guest $<input className="input mt-1" inputMode="numeric" value={value.perGuestMax ?? ''} onChange={(e) => set('perGuestMax', num(e.target.value))} aria-label="Maximum per guest" />
            </label>
            <label className="text-sm">
              Within miles<input className="input mt-1" inputMode="numeric" value={value.maxDistance ?? ''} onChange={(e) => set('maxDistance', num(e.target.value))} aria-label="Maximum distance in miles" />
            </label>
          </div>
        </fieldset>
        <Chips label="Area" options={REGIONS.map((r) => ({ value: r, label: r }))} value={value.regions} onChange={(v) => set('regions', v)} />
        <Chips label="Indoor / outdoor" options={SETTING_OPTIONS} value={value.settings} onChange={(v) => set('settings', v)} />
        <Chips label="Style" options={STYLE_OPTIONS.map((s) => ({ value: s, label: s }))} value={value.styles} onChange={(v) => set('styles', v)} />
        <Chips label="Catering" options={CATERING_OPTIONS} value={value.catering} onChange={(v) => set('catering', v)} />
        <Chips
          label="Pricing confidence"
          options={[
            { value: 'complete', label: 'Complete' },
            { value: 'partial', label: 'Partial' },
            { value: 'rough', label: 'Rough' },
            { value: 'unknown', label: 'Unknown' },
          ]}
          value={value.confidence}
          onChange={(v) => set('confidence', v)}
        />
        {scope === 'mine' && (
          <>
            <Chips label="Status" options={STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} value={value.statuses} onChange={(v) => set('statuses', v)} />
            {allTags.length > 0 && <Chips label="Tags" options={allTags.map((t) => ({ value: t, label: t }))} value={value.tags} onChange={(v) => set('tags', v)} />}
          </>
        )}
      </div>
    </Modal>
  );
}
