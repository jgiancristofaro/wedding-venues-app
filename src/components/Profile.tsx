import { CalendarHeart, MapPin, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { WeddingProfile } from '../domain/types';
import { DAY_SHORT, MONTH_NAMES, type DayOfWeek } from '../lib/pricing';
import { cx, money } from '../lib/format';
import { useApp } from '../store/app';
import { backend } from '../backend';
import { Modal } from './ui';

export function profileSummary(p: WeddingProfile): string {
  const when = p.targetDate
    ? new Date(p.targetDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : [
        p.preferredDays?.length ? p.preferredDays.map((d) => DAY_SHORT[d]).join('/') : '',
        p.months?.length ? p.months.map((m) => MONTH_NAMES[m - 1].slice(0, 3)).join(', ') : '',
      ]
        .filter(Boolean)
        .join(' · ');
  return [`${p.guestCount} guests`, when || 'Any date', p.budget ? money(p.budget, { compact: true }) : '']
    .filter(Boolean)
    .join(' · ');
}

function GuestsStep({ p, set }: { p: WeddingProfile; set: (p: WeddingProfile) => void }) {
  const [range, setRange] = useState(p.guestMin != null || p.guestMax != null);
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="pf-guests" className="text-sm font-medium">
          About how many guests?
        </label>
        <div className="flex items-center gap-4 mt-3">
          <input
            id="pf-guests"
            type="range"
            min={10}
            max={400}
            step={5}
            value={p.guestCount}
            onChange={(e) => set({ ...p, guestCount: +e.target.value })}
            className="flex-1 accent-[rgb(var(--accent))] h-11"
          />
          <input
            aria-label="Guest count"
            className="input w-24 text-center text-lg font-medium"
            inputMode="numeric"
            value={p.guestCount}
            onChange={(e) => set({ ...p, guestCount: Math.max(1, +e.target.value.replace(/\D/g, '') || 1) })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm min-h-[44px]">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[rgb(var(--accent))]"
          checked={range}
          onChange={(e) => {
            setRange(e.target.checked);
            if (!e.target.checked) set({ ...p, guestMin: undefined, guestMax: undefined });
          }}
        />
        Not sure yet — give me a range
      </label>
      {range && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            At least
            <input
              className="input mt-1"
              inputMode="numeric"
              value={p.guestMin ?? ''}
              onChange={(e) => set({ ...p, guestMin: +e.target.value || undefined })}
            />
          </label>
          <label className="text-sm">
            At most
            <input
              className="input mt-1"
              inputMode="numeric"
              value={p.guestMax ?? ''}
              onChange={(e) => set({ ...p, guestMax: +e.target.value || undefined })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function WhenStep({ p, set }: { p: WeddingProfile; set: (p: WeddingProfile) => void }) {
  const toggle = <T,>(arr: T[] | undefined, v: T) =>
    arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v];
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="pf-date" className="text-sm font-medium">
          Have a date? <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="pf-date"
          type="date"
          className="input mt-1"
          value={p.targetDate ?? ''}
          onChange={(e) => set({ ...p, targetDate: e.target.value || undefined })}
        />
      </div>
      <fieldset>
        <legend className="text-sm font-medium mb-2">Or the months you’re considering</legend>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {MONTH_NAMES.map((m, i) => {
            const on = !!p.months?.includes(i + 1);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                className={cx('chip justify-center', on && 'chip-on')}
                onClick={() => set({ ...p, months: toggle(p.months, i + 1) })}
              >
                {m.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium mb-2">Preferred days</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_SHORT.map((d, i) => {
            const on = !!p.preferredDays?.includes(i as DayOfWeek);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                className={cx('chip w-14 justify-center', on && 'chip-on')}
                onClick={() => set({ ...p, preferredDays: toggle(p.preferredDays, i as DayOfWeek) })}
              >
                {d}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-2">Fridays and Sundays are often 20–40% less than Saturdays.</p>
      </fieldset>
    </div>
  );
}

function WhereStep({ p, set }: { p: WeddingProfile; set: (p: WeddingProfile) => void }) {
  const [status, setStatus] = useState('');
  const lookup = async () => {
    if (!p.locationLabel) return;
    setStatus('Looking up…');
    try {
      const r = await backend.geocode(p.locationLabel);
      if (r) {
        set({ ...p, lat: r.lat, lng: r.lng });
        setStatus(`Found: ${r.displayName?.split(',').slice(0, 3).join(',') ?? 'ok'}`);
      } else setStatus('We couldn’t find that place — distances will be hidden until you try another.');
    } catch {
      setStatus('Location lookup is unavailable right now. You can still browse; distances may be off.');
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="pf-loc" className="text-sm font-medium">
          Where should we measure distance from?
        </label>
        <div className="flex gap-2 mt-1">
          <input
            id="pf-loc"
            className="input"
            value={p.locationLabel ?? ''}
            onChange={(e) => set({ ...p, locationLabel: e.target.value })}
            onBlur={() => void lookup()}
            placeholder="e.g. Brooklyn, NY"
          />
          <button type="button" className="btn-secondary" onClick={() => void lookup()}>
            Find
          </button>
        </div>
        {status && (
          <p className="text-xs text-muted mt-1" aria-live="polite">
            {status}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Search radius (miles)
          <input
            className="input mt-1"
            inputMode="numeric"
            value={p.radiusMiles ?? ''}
            onChange={(e) => set({ ...p, radiusMiles: +e.target.value || undefined })}
          />
        </label>
        <label className="text-sm font-medium">
          Total budget ($)
          <input
            className="input mt-1"
            inputMode="numeric"
            value={p.budget ?? ''}
            onChange={(e) => set({ ...p, budget: +e.target.value.replace(/\D/g, '') || undefined })}
            placeholder="optional"
          />
        </label>
      </div>
      <label className="text-sm font-medium block">
        Event length (hours)
        <input
          className="input mt-1 w-28"
          inputMode="numeric"
          value={p.hours ?? ''}
          onChange={(e) => set({ ...p, hours: +e.target.value || undefined })}
        />
      </label>
    </div>
  );
}

const STEPS = [
  { title: 'Your guest count', icon: Users, C: GuestsStep },
  { title: 'When', icon: CalendarHeart, C: WhenStep },
  { title: 'Where & budget', icon: MapPin, C: WhereStep },
];

export function OnboardingDialog() {
  const open = useApp((s) => s.onboardingOpen);
  const setOpen = useApp((s) => s.setOnboarding);
  const profile = useApp((s) => s.profile);
  const save = useApp((s) => s.setProfile);
  const [p, set] = useState(profile);
  const [step, setStep] = useState(0);
  const close = () => {
    void save(p);
    setOpen(false);
  };
  const S = STEPS[step];
  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <S.icon size={20} className="text-gold" aria-hidden /> {S.title}
        </span>
      }
      footer={
        <>
          <button className="btn-ghost mr-auto" onClick={close}>
            Skip for now
          </button>
          {step > 0 && (
            <button className="btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="btn-primary" onClick={() => (step < 2 ? setStep(step + 1) : close())}>
            {step < 2 ? 'Next' : 'Show me venues'}
          </button>
        </>
      }
    >
      <p className="text-muted text-sm mb-5">
        Step {step + 1} of 3 · We use this to turn every venue’s pricing into an all-in estimate for{' '}
        <em>your</em> wedding. You can change it any time.
      </p>
      <div className="flex gap-1.5 mb-6" aria-hidden>
        {STEPS.map((_, i) => (
          <div key={i} className={cx('h-1 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
        ))}
      </div>
      <S.C p={p} set={set} />
    </Modal>
  );
}

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useApp((s) => s.profile);
  const save = useApp((s) => s.setProfile);
  const [p, set] = useState(profile);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Wedding profile"
      wide
      footer={
        <button
          className="btn-primary"
          onClick={() => {
            void save(p);
            onClose();
          }}
        >
          Save & update estimates
        </button>
      }
    >
      <div className="grid md:grid-cols-3 gap-8 pt-2">
        <section>
          <h3 className="text-lg mb-3 flex items-center gap-2">
            <Users size={18} className="text-gold" /> Guests
          </h3>
          <GuestsStep p={p} set={set} />
        </section>
        <section>
          <h3 className="text-lg mb-3 flex items-center gap-2">
            <CalendarHeart size={18} className="text-gold" /> When
          </h3>
          <WhenStep p={p} set={set} />
        </section>
        <section>
          <h3 className="text-lg mb-3 flex items-center gap-2">
            <Wallet size={18} className="text-gold" /> Where & budget
          </h3>
          <WhereStep p={p} set={set} />
        </section>
      </div>
    </Modal>
  );
}
