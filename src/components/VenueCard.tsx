import { useDraggable } from '@dnd-kit/core';
import { Check, GitCompareArrows, Heart, MapPin, Star, Users } from 'lucide-react';
import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { VenueView, WeddingProfile } from '../domain/types';
import { fit, viewEstimate } from '../domain/venues';
import { venuePhotos } from '../lib/images';
import { cx } from '../lib/format';
import { useApp } from '../store/app';
import { ConfidenceBadge, PriceSummary } from './Pricing';

export function venueHref(v: VenueView) {
  return v.kind === 'global' ? `/venue/g/${v.id}` : `/venue/u/${v.id}`;
}

export function HeartButton({
  v,
  className,
  size = 20,
}: {
  v: VenueView;
  className?: string;
  size?: number;
}) {
  const heartGlobal = useApp((s) => s.heartGlobal);
  const unsave = useApp((s) => s.unsave);
  const linked = useApp((s) =>
    v.kind === 'global' ? s.mine.find((m) => m.globalId === v.id) : s.mine.find((m) => m.id === v.id),
  );
  const [pop, setPop] = useState(false);
  const on = !!linked;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${v.fields.name} from My Venues` : `Save ${v.fields.name} to My Venues`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (on) void unsave(linked!.id);
        else {
          setPop(true);
          setTimeout(() => setPop(false), 400);
          if (v.kind === 'global') void heartGlobal(v.id);
        }
      }}
      className={cx(
        'inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90',
        className,
      )}
    >
      <Heart
        size={size}
        className={cx(
          'transition drop-shadow',
          pop && 'animate-pop',
          on ? 'fill-rose text-rose' : 'text-white fill-black/25',
        )}
        strokeWidth={2}
      />
    </button>
  );
}

export function CompareToggle({
  v,
  className,
  variant = 'overlay',
}: {
  v: VenueView;
  className?: string;
  variant?: 'overlay' | 'button';
}) {
  const on = useApp((s) => s.compare.includes(v.ref));
  const toggle = useApp((s) => s.toggleCompare);
  if (variant === 'button') {
    return (
      <button
        type="button"
        className={cx('btn-secondary btn-sm', className)}
        aria-pressed={on}
        onClick={() => toggle(v.ref)}
      >
        {on ? <Check size={16} /> : <GitCompareArrows size={16} />} {on ? 'In compare' : 'Add to compare'}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${v.fields.name} from compare` : `Add ${v.fields.name} to compare`}
      title={on ? 'In compare' : 'Add to compare'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(v.ref);
      }}
      className={cx(
        'inline-flex items-center gap-1 h-8 rounded-full px-2.5 text-xs font-medium backdrop-blur transition',
        on ? 'bg-ink text-bg' : 'bg-white/85 text-[#1f1b16] hover:bg-white',
        className,
      )}
    >
      {on ? <Check size={14} /> : <GitCompareArrows size={14} />}
      <span>{on ? 'Comparing' : 'Compare'}</span>
    </button>
  );
}

function CardInner({
  v,
  profile,
  distance,
}: {
  v: VenueView;
  profile: WeddingProfile;
  distance?: number | null;
}) {
  const e = viewEstimate(v, profile);
  const f = fit(v.fields, profile.guestCount);
  const photo = venuePhotos(v.ref.slice(2), v.fields)[0];
  const status = v.mine?.status;
  return (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sunken">
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
          <CompareToggle v={v} />
          <HeartButton v={v} />
        </div>
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {v.isSample && (
            <span className="rounded-full bg-black/55 text-white text-[10px] uppercase tracking-wider px-2 py-0.5 backdrop-blur">
              Sample data
            </span>
          )}
          {v.kind === 'mine' && !v.mine?.globalId && (
            <span className="rounded-full bg-black/55 text-white text-[10px] uppercase tracking-wider px-2 py-0.5 backdrop-blur">
              Your venue
            </span>
          )}
          {status && status !== 'researching' && (
            <span className="rounded-full bg-white/90 text-[#1f1b16] text-[10px] uppercase tracking-wider px-2 py-0.5">
              {status}
            </span>
          )}
        </div>
      </div>
      <div className="pt-3 px-0.5 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[19px] leading-tight">
            <Link to={venueHref(v)} className="after:absolute after:inset-0 focus-visible:outline-none">
              {v.fields.name}
            </Link>
          </h3>
          {v.mine?.rating ? (
            <span
              className="inline-flex items-center gap-0.5 text-sm shrink-0"
              aria-label={`Your rating ${v.mine.rating} of 5`}
            >
              <Star size={14} className="fill-gold text-gold" /> {v.mine.rating}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted">
          <MapPin size={14} aria-hidden />
          <span className="truncate">
            {[v.fields.area, v.fields.region].filter(Boolean).join(', ') || 'Location unknown'}
            {distance != null && ` · ${Math.round(distance)} mi`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full text-[11px] px-2 h-6 font-medium border',
              f.fits === true
                ? 'border-ok/30 text-ok bg-ok/10'
                : f.fits === false
                  ? 'border-bad/30 text-bad bg-bad/10'
                  : 'border-line text-muted',
            )}
          >
            <Users size={12} aria-hidden /> {f.label}
          </span>
          <ConfidenceBadge c={e.confidence} small />
          {e.stale && <span className="text-[11px] text-warn">May be outdated</span>}
        </div>
        <div className="relative z-10 pt-0.5">
          <PriceSummary e={e} name={v.fields.name} pricingAsOf={v.pricingAsOf} />
        </div>
        {!!v.fields.styleTags?.length && (
          <p className="text-xs text-muted truncate">{v.fields.styleTags.slice(0, 3).join(' · ')}</p>
        )}
      </div>
    </>
  );
}

export const VenueCard = memo(function VenueCard({
  v,
  profile,
  distance,
}: {
  v: VenueView;
  profile: WeddingProfile;
  distance?: number | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${v.ref}`,
    data: { ref: v.ref, name: v.fields.name },
  });
  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="article"
      aria-roledescription="Draggable venue card. Press space to pick up and drop on the compare tray."
      tabIndex={-1}
      className={cx('group relative animate-rise touch-manipulation', isDragging && 'opacity-40')}
      data-testid="venue-card"
      data-venue-ref={v.ref}
    >
      <CardInner v={v} profile={profile} distance={distance} />
    </article>
  );
});

export function CardSkeleton() {
  return (
    <div aria-hidden>
      <div className="skeleton aspect-[4/3]" />
      <div className="skeleton h-5 w-2/3 mt-3" />
      <div className="skeleton h-4 w-1/2 mt-2" />
      <div className="skeleton h-4 w-1/3 mt-2" />
    </div>
  );
}
