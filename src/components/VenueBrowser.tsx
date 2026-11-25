import { BookmarkPlus, LayoutGrid, Map as MapIcon, Search, SlidersHorizontal, Table2, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { applyFilters, buildRows, type Row } from '../domain/filtering';
import { EMPTY_FILTERS, type FilterState, type VenueView } from '../domain/types';
import { cx, money } from '../lib/format';
import { useApp } from '../store/app';
import { activeFilterCount, FiltersDialog } from './Filters';
import { ConfidenceBadge } from './Pricing';
import { Empty, Modal, Segmented } from './ui';
import { CardSkeleton, CompareToggle, HeartButton, VenueCard, venueHref } from './VenueCard';

const MapView = lazy(() => import('./MapView'));

type ViewMode = 'gallery' | 'split' | 'table';

const SORTS: { value: FilterState['sort']; label: string; mine?: boolean }[] = [
  { value: 'total', label: 'Estimated total' },
  { value: 'perGuest', label: 'Per guest' },
  { value: 'distance', label: 'Distance' },
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Your rating', mine: true },
  { value: 'recent', label: 'Recently added' },
  { value: 'rank', label: 'Shortlist rank', mine: true },
];

function useStoredFilters(scope: string): [FilterState, (f: FilterState) => void] {
  const key = `vellum:filters:${scope}`;
  const [f, setF] = useState<FilterState>(() => {
    try {
      return { ...EMPTY_FILTERS, ...JSON.parse(sessionStorage.getItem(key) || '{}') };
    } catch {
      return EMPTY_FILTERS;
    }
  });
  const set = (n: FilterState) => {
    setF(n);
    try {
      sessionStorage.setItem(key, JSON.stringify(n));
    } catch {
      /* ignore */
    }
  };
  return [f, set];
}

function Progressive({ rows, render }: { rows: Row[]; render: (r: Row) => ReactNode }) {
  const [n, setN] = useState(36);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setN(36);
  }, [rows]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setN((x) => x + 36), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rows]);
  return (
    <>
      {rows.slice(0, n).map(render)}
      {n < rows.length && <div ref={ref} className="col-span-full h-8" aria-hidden />}
    </>
  );
}

export function VenueBrowser({ scope, views, loading, header, emptyState }: { scope: 'discover' | 'mine'; views: VenueView[]; loading?: boolean; header?: ReactNode; emptyState?: ReactNode }) {
  const profile = useApp((s) => s.profile);
  const allPresets = useApp((s) => s.presets);
  const presets = useMemo(() => allPresets.filter((p) => p.scope === scope), [allPresets, scope]);
  const savePreset = useApp((s) => s.savePreset);
  const deletePreset = useApp((s) => s.deletePreset);
  const user = useApp((s) => s.user);
  const requireAuth = useApp((s) => s.requireAuth);
  const [params, setParams] = useSearchParams();
  const mode = (params.get('view') as ViewMode) || 'gallery';
  const setMode = (m: ViewMode) => {
    const p = new URLSearchParams(params);
    p.set('view', m);
    setParams(p, { replace: true });
  };
  const [filters, setFilters] = useStoredFilters(scope);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [mobileMap, setMobileMap] = useState(false);
  const q = useDeferredValue(filters.q);

  const rows = useMemo(() => buildRows(views, profile), [views, profile]);
  const filtered = useMemo(() => applyFilters(rows, { ...filters, q }, profile), [rows, filters, q, profile]);
  const allTags = useMemo(() => [...new Set(views.flatMap((v) => v.mine?.tags ?? []))].sort(), [views]);
  const mapItems = useMemo(
    () =>
      filtered
        .filter((r) => r.v.fields.lat != null && r.v.fields.lng != null)
        .map((r) => ({ ref: r.v.ref, name: r.v.fields.name, lat: r.v.fields.lat!, lng: r.v.fields.lng!, total: r.e.total, href: venueHref(r.v), area: r.v.fields.area })),
    [filtered],
  );
  const nActive = activeFilterCount(filters);
  const quick = (k: 'fitsGuests' | 'ceremonyOnSite' | 'accommodations', label: string) => (
    <button className={cx('chip', filters[k] && 'chip-on')} aria-pressed={filters[k]} onClick={() => setFilters({ ...filters, [k]: !filters[k] })}>
      {label}
    </button>
  );

  const toolbar = (
    <div className="sticky top-[64px] md:top-[72px] z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-bg/90 backdrop-blur border-b border-line/60 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[200px] max-w-md">
          <span className="sr-only">Search venues</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9 rounded-full"
            placeholder="Search by name, town, style…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            type="search"
          />
        </label>
        <button className={cx('chip', nActive > 0 && 'chip-on')} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal size={15} /> Filters{nActive ? ` · ${nActive}` : ''}
        </button>
        <label className="sr-only" htmlFor={`sort-${scope}`}>
          Sort by
        </label>
        <select id={`sort-${scope}`} className="chip pr-2 appearance-none cursor-pointer" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as FilterState['sort'] })}>
          {SORTS.filter((s) => scope === 'mine' || !s.mine).map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <Segmented<ViewMode>
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'gallery', label: 'Gallery', icon: <LayoutGrid size={15} /> },
              { value: 'split', label: 'Map', icon: <MapIcon size={15} /> },
              { value: 'table', label: 'Table', icon: <Table2 size={15} /> },
            ]}
          />
        </div>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-none">
        {quick('fitsGuests', `Fits ${profile.guestCount}`)}
        {quick('ceremonyOnSite', 'Ceremony on-site')}
        {quick('accommodations', 'Accommodations')}
        {profile.budget ? (
          <button
            className={cx('chip', filters.totalMax === profile.budget && 'chip-on')}
            aria-pressed={filters.totalMax === profile.budget}
            onClick={() => setFilters({ ...filters, totalMax: filters.totalMax === profile.budget ? undefined : profile.budget })}
          >
            Within budget ({money(profile.budget, { compact: true })})
          </button>
        ) : null}
        {presets.map((p) => (
          <span key={p.id} className="chip pr-1">
            <button onClick={() => setFilters({ ...p.filters })} className="hover:underline">
              {p.name}
            </button>
            <button className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-sunken" aria-label={`Delete preset ${p.name}`} onClick={() => void deletePreset(p.id)}>
              <Trash2 size={13} />
            </button>
          </span>
        ))}
        <button
          className="chip text-muted"
          onClick={() => {
            if (requireAuth('Sign in to save filter presets.')) setPresetOpen(true);
          }}
        >
          <BookmarkPlus size={15} /> Save filters
        </button>
        {nActive > 0 && (
          <button className="chip text-muted" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
            <X size={14} /> Clear
          </button>
        )}
      </div>
    </div>
  );

  const count = (
    <p className="text-sm text-muted my-4" aria-live="polite">
      {loading ? 'Loading venues…' : `${filtered.length} of ${views.length} venues · priced for ${profile.guestCount} guests`}
    </p>
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (!views.length) {
    body = emptyState;
  } else if (!filtered.length) {
    body = (
      <Empty title="No venues match these filters" action={<button className="btn-secondary" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>Clear filters</button>}>
        Try widening your price range or removing a style.
      </Empty>
    );
  } else if (mode === 'table') {
    body = <VenueTable rows={filtered} scope={scope} />;
  } else if (mode === 'split') {
    body = (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6">
        <div className={cx('grid gap-x-5 gap-y-8 sm:grid-cols-2 content-start', mobileMap && 'hidden lg:grid')}>
          <Progressive
            rows={filtered}
            render={(r) => (
              <div key={r.v.ref} onMouseEnter={() => setHover(r.v.ref)} onMouseLeave={() => setHover(null)}>
                <VenueCard v={r.v} profile={profile} distance={r.dist} />
              </div>
            )}
          />
        </div>
        <div className={cx('lg:block', mobileMap ? 'block' : 'hidden')}>
          <div className="sticky top-[180px] h-[calc(100vh-220px)] min-h-[360px]">
            <Suspense fallback={<div className="skeleton h-full" />}>
              <MapView items={mapItems} activeRef={hover} onHover={setHover} />
            </Suspense>
          </div>
        </div>
        <button className="lg:hidden fixed bottom-[148px] left-1/2 -translate-x-1/2 z-40 btn-primary shadow-lift" onClick={() => setMobileMap(!mobileMap)}>
          {mobileMap ? <LayoutGrid size={16} /> : <MapIcon size={16} />} {mobileMap ? 'Show list' : 'Show map'}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Progressive rows={filtered} render={(r) => <VenueCard key={r.v.ref} v={r.v} profile={profile} distance={r.dist} />} />
      </div>
    );
  }

  return (
    <div>
      {header}
      {toolbar}
      {count}
      {body}
      <FiltersDialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onChange={setFilters}
        scope={scope}
        allTags={allTags}
        guestCount={profile.guestCount}
        resultCount={filtered.length}
      />
      <Modal
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        title="Save these filters"
        footer={
          <button
            className="btn-primary"
            disabled={!presetName.trim()}
            onClick={() => {
              void savePreset({ id: crypto.randomUUID(), ownerId: user?.id ?? '', name: presetName.trim(), scope, filters, createdAt: new Date().toISOString() });
              setPresetName('');
              setPresetOpen(false);
            }}
          >
            Save preset
          </button>
        }
      >
        <label className="text-sm font-medium" htmlFor="preset-name">
          Preset name
        </label>
        <input id="preset-name" className="input mt-1" autoFocus value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Hudson Valley barns under $60k" />
      </Modal>
    </div>
  );
}

function VenueTable({ rows, scope }: { rows: Row[]; scope: 'discover' | 'mine' }) {
  const [n, setN] = useState(150);
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-sm min-w-[880px]">
        <thead className="text-left text-xs uppercase tracking-wider text-muted bg-sunken/60">
          <tr>
            <th className="p-3 w-10">
              <span className="sr-only">Save</span>
            </th>
            <th className="p-3">Venue</th>
            <th className="p-3">Area</th>
            <th className="p-3 text-right">Seated</th>
            <th className="p-3 text-right">Est. total</th>
            <th className="p-3 text-right">Per guest</th>
            <th className="p-3">Confidence</th>
            <th className="p-3">Setting</th>
            {scope === 'mine' && <th className="p-3">Status</th>}
            <th className="p-3">
              <span className="sr-only">Compare</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, n).map((r) => (
            <tr key={r.v.ref} className="border-t border-line/70 hover:bg-sunken/40">
              <td className="px-1">
                <HeartButton v={r.v} className="[&_svg]:!text-muted [&_svg]:fill-transparent [&[aria-pressed=true]_svg]:!text-rose [&[aria-pressed=true]_svg]:!fill-rose" size={18} />
              </td>
              <td className="p-3 font-medium">
                <Link to={venueHref(r.v)} className="hover:underline">
                  {r.v.fields.name}
                </Link>
                {r.v.isSample && <span className="ml-2 text-[10px] uppercase tracking-wider text-muted">sample</span>}
              </td>
              <td className="p-3 text-muted">{[r.v.fields.area, r.v.fields.region].filter(Boolean).join(', ')}</td>
              <td className="p-3 text-right tabular-nums">{r.v.fields.capacitySeated ?? '—'}</td>
              <td className="p-3 text-right tabular-nums font-medium">{money(r.e.total)}</td>
              <td className="p-3 text-right tabular-nums">{money(r.e.perGuest)}</td>
              <td className="p-3">
                <ConfidenceBadge c={r.e.confidence} small />
              </td>
              <td className="p-3 capitalize text-muted">{r.v.fields.setting ?? '—'}</td>
              {scope === 'mine' && <td className="p-3 capitalize">{r.v.mine?.status}</td>}
              <td className="p-2">
                <CompareToggle v={r.v} className="!bg-sunken !text-ink aria-pressed:!bg-ink aria-pressed:!text-bg" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {n < rows.length && (
        <div className="p-3 text-center border-t border-line">
          <button className="btn-secondary btn-sm" onClick={() => setN(n + 300)}>
            Show more ({rows.length - n} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
