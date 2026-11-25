import { Award, Download, FileSpreadsheet, GitCompareArrows, Printer, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useViewByRef } from '../components/Layout';
import { CAT_COLORS, CAT_PATTERN, ConfidenceBadge, PriceSummary } from '../components/Pricing';
import { Empty, Modal, Toggle } from '../components/ui';
import { FIELD_DEFS, formatFieldValue } from '../domain/fields';
import type { VenueView } from '../domain/types';
import { viewEstimate } from '../domain/venues';
import { cx, money } from '../lib/format';
import { venuePhotos } from '../lib/images';
import { CATEGORY_LABEL, CONFIDENCE_LABEL, type Estimate, type LineCategory } from '../lib/pricing';
import { useApp } from '../store/app';

interface CompareRow {
  key: string;
  label: string;
  values: (string | number | null)[];
  numeric?: (number | null)[];
  better?: 'higher' | 'lower';
  group: string;
}

function TotalsChart({ cols }: { cols: { v: VenueView; e: Estimate }[] }) {
  const max = Math.max(...cols.map((c) => c.e.total ?? 0), 1);
  const cats: LineCategory[] = ['rental', 'fnb', 'addons', 'service', 'tax'];
  return (
    <figure className="card p-5">
      <figcaption className="label mb-4">Estimated total by cost component</figcaption>
      <ul className="space-y-4">
        {cols.map(({ v, e }) => (
          <li key={v.ref}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium truncate">{v.fields.name}</span>
              <span className="tabular-nums">{money(e.total)}</span>
            </div>
            <div className="h-7 rounded-lg bg-sunken overflow-hidden flex" style={{ width: `${((e.total ?? 0) / max) * 100}%`, minWidth: e.total ? 24 : 0 }} role="img" aria-label={`${v.fields.name}: ${cats.filter((c) => e.byCategory[c]).map((c) => `${CATEGORY_LABEL[c]} ${money(e.byCategory[c])}`).join(', ') || 'no pricing'}`}>
              {cats.map((c) =>
                e.byCategory[c] > 0 ? <div key={c} title={`${CATEGORY_LABEL[c]}: ${money(e.byCategory[c])}`} style={{ width: `${(e.byCategory[c] / (e.total || 1)) * 100}%`, background: `${CAT_PATTERN[c] === 'none' ? '' : CAT_PATTERN[c] + ','}${CAT_COLORS[c]}` }} /> : null,
              )}
            </div>
            {e.total == null && <span className="text-xs text-muted">No pricing on file</span>}
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {cats.map((c) => (
          <li key={c} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `${CAT_PATTERN[c] === 'none' ? '' : CAT_PATTERN[c] + ','}${CAT_COLORS[c]}` }} /> {CATEGORY_LABEL[c]}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default function Compare() {
  const compare = useApp((s) => s.compare);
  const toggle = useApp((s) => s.toggleCompare);
  const setCompare = useApp((s) => s.setCompare);
  const profile = useApp((s) => s.profile);
  const notes = useApp((s) => s.notes);
  const sets = useApp((s) => s.compareSets);
  const saveSet = useApp((s) => s.saveCompareSet);
  const deleteSet = useApp((s) => s.deleteCompareSet);
  const views = useViewByRef();
  const [diffOnly, setDiffOnly] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  const cols = useMemo(() => compare.map((r) => views.get(r)).filter((v): v is VenueView => !!v).map((v) => ({ v, e: viewEstimate(v, profile) })), [compare, views, profile]);

  const rows: CompareRow[] = useMemo(() => {
    const r: CompareRow[] = [
      { key: 'total', label: 'Estimated total', group: 'Price', values: cols.map((c) => money(c.e.total)), numeric: cols.map((c) => c.e.total), better: 'lower' },
      { key: 'pg', label: 'Per guest', group: 'Price', values: cols.map((c) => money(c.e.perGuest)), numeric: cols.map((c) => c.e.perGuest), better: 'lower' },
      { key: 'conf', label: 'Pricing confidence', group: 'Price', values: cols.map((c) => CONFIDENCE_LABEL[c.e.confidence]) },
      ...(['rental', 'fnb', 'addons', 'service', 'tax'] as LineCategory[]).map((cat) => ({
        key: cat,
        label: CATEGORY_LABEL[cat],
        group: 'Price',
        values: cols.map((c) => (c.e.byCategory[cat] ? money(c.e.byCategory[cat]) : '—')),
        numeric: cols.map((c) => (c.e.total == null ? null : c.e.byCategory[cat])),
        better: 'lower' as const,
      })),
      { key: 'asof', label: 'Pricing as of', group: 'Price', values: cols.map((c) => c.v.pricingAsOf ?? '—') },
    ];
    for (const f of FIELD_DEFS.filter((d) => d.compare)) {
      r.push({
        key: f.key,
        label: f.label,
        group: 'Venue',
        values: cols.map((c) => formatFieldValue(f.key, c.v.fields[f.key]) || '—'),
        numeric: f.better ? cols.map((c) => (typeof c.v.fields[f.key] === 'number' ? (c.v.fields[f.key] as number) : null)) : undefined,
        better: f.better,
      });
    }
    r.push(
      { key: 'status', label: 'Status', group: 'Yours', values: cols.map((c) => c.v.mine?.status ?? 'Not saved') },
      { key: 'rating', label: 'Your rating', group: 'Yours', values: cols.map((c) => (c.v.mine?.rating ? '★'.repeat(c.v.mine.rating) : '—')), numeric: cols.map((c) => c.v.mine?.rating ?? null), better: 'higher' },
      { key: 'pros', label: 'Pros / cons', group: 'Yours', values: cols.map((c) => { const ns = notes.filter((n) => n.venueId === c.v.mine?.id); return `${ns.filter((n) => n.kind === 'pro').length} pros · ${ns.filter((n) => n.kind === 'con').length} cons`; }) },
    );
    return r;
  }, [cols, notes]);

  const shown = diffOnly ? rows.filter((r) => new Set(r.values.map(String)).size > 1) : rows;

  const best = (r: CompareRow): number[] => {
    if (!r.numeric || !r.better) return [];
    const vals = r.numeric.filter((x): x is number => x != null);
    if (vals.length < 2) return [];
    const target = r.better === 'lower' ? Math.min(...vals) : Math.max(...vals);
    if (vals.every((x) => x === target)) return [];
    return r.numeric.map((x, i) => (x === target ? i : -1)).filter((i) => i >= 0);
  };

  const exportRows = () => cols.map((c) => ({ ...c, notes: notes.filter((n) => n.venueId === c.v.mine?.id) }));

  if (cols.length < 2) {
    return (
      <div className="pt-8">
        <Empty
          icon={<GitCompareArrows size={40} />}
          title={cols.length ? 'Add one more venue to compare' : 'Compare venues side by side'}
          action={<Link to="/" className="btn-primary">Browse venues</Link>}
        >
          Drag venue cards onto the compare tray at the bottom of the screen, or tap “Compare” on any card. Pick 2–4 venues.
        </Empty>
        {sets.length > 0 && <SavedSets sets={sets} onLoad={setCompare} onDelete={deleteSet} />}
      </div>
    );
  }

  return (
    <div className="pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="label mb-2">Side by side</p>
          <h1 className="text-4xl">Compare</h1>
          <p className="text-sm text-muted mt-1">Priced for {profile.guestCount} guests. <Award size={13} className="inline text-gold" aria-hidden /> marks the best value in each row.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center no-print">
          <Toggle checked={diffOnly} onChange={setDiffOnly} label="Show differences only" id="diff-only" />
          <button className="btn-secondary btn-sm" onClick={() => setSaveOpen(true)}><Save size={15} /> Save</button>
          <button className="btn-secondary btn-sm" onClick={async () => (await import('../lib/export')).compareReportPdf(exportRows(), profile)}><Download size={15} /> PDF report</button>
          <button className="btn-secondary btn-sm" onClick={async () => (await import('../lib/export')).exportSheet(exportRows(), 'xlsx', 'vellum-comparison')}><FileSpreadsheet size={15} /> XLSX</button>
          <button className="btn-ghost btn-sm" onClick={() => window.print()}><Printer size={15} /> Print</button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm" data-testid="compare-table">
          <caption className="sr-only">Venue comparison</caption>
          <thead>
            <tr>
              <th className="sticky left-0 bg-bg z-10 w-44" scope="col"><span className="sr-only">Attribute</span></th>
              {cols.map(({ v, e }) => (
                <th key={v.ref} scope="col" className="p-2 align-top text-left font-normal min-w-[180px]">
                  <div className="relative">
                    <img src={venuePhotos(v.ref.slice(2), v.fields)[0].url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
                    <button className="absolute top-2 right-2 h-9 w-9 rounded-full bg-white/90 text-[#1f1b16] inline-flex items-center justify-center no-print" aria-label={`Remove ${v.fields.name} from comparison`} onClick={() => toggle(v.ref)}>
                      <X size={15} />
                    </button>
                  </div>
                  <Link to={v.kind === 'global' ? `/venue/g/${v.id}` : `/venue/u/${v.id}`} className="block font-serif text-lg mt-2 leading-tight hover:underline">{v.fields.name}</Link>
                  <div className="text-xs text-muted">{v.fields.area}{v.isSample ? ' · sample' : ''}</div>
                  <div className="mt-2"><PriceSummary e={e} name={v.fields.name} pricingAsOf={v.pricingAsOf} size="sm" /></div>
                  <div className="mt-1"><ConfidenceBadge c={e.confidence} small /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => {
              const winners = best(r);
              const newGroup = ri === 0 || shown[ri - 1].group !== r.group;
              return (
                <tr key={r.key} className={cx(newGroup && '[&>*]:border-t-2 [&>*]:border-t-line')}>
                  <th scope="row" className="sticky left-0 bg-bg z-10 text-left font-medium text-muted p-3 border-b border-line/60 align-top">
                    {newGroup && <span className="block label text-[10px] mb-1">{r.group}</span>}
                    {r.label}
                  </th>
                  {r.values.map((val, i) => {
                    const win = winners.includes(i);
                    return (
                      <td key={i} className={cx('p-3 border-b border-line/60 align-top tabular-nums', win && 'bg-ok/10 font-medium')}>
                        {win && <Award size={13} className="inline mr-1 text-gold -mt-0.5" aria-hidden />}
                        {String(val ?? '—')}
                        {win && <span className="sr-only"> (best)</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-8 grid lg:grid-cols-2 gap-6">
        <TotalsChart cols={cols} />
        <SavedSets sets={sets} onLoad={setCompare} onDelete={deleteSet} />
      </div>
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this comparison" footer={<button className="btn-primary" disabled={!name.trim()} onClick={() => { void saveSet(name.trim()); setSaveOpen(false); setName(''); }}>Save</button>}>
        <label htmlFor="cmp-name" className="text-sm font-medium">Name</label>
        <input id="cmp-name" className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Final three" autoFocus />
      </Modal>
    </div>
  );
}

function SavedSets({ sets, onLoad, onDelete }: { sets: { id: string; name: string; venueRefs: string[] }[]; onLoad: (r: string[]) => void; onDelete: (id: string) => Promise<void> }) {
  if (!sets.length) return null;
  return (
    <section className="card p-5 no-print">
      <h2 className="label mb-3">Saved comparisons</h2>
      <ul className="space-y-1">
        {sets.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <button className="flex-1 text-left rounded-lg px-2 h-11 hover:bg-sunken text-sm" onClick={() => onLoad(s.venueRefs)}>
              {s.name} <span className="text-muted">· {s.venueRefs.length} venues</span>
            </button>
            <button className="icon-btn h-9 w-9" aria-label={`Delete ${s.name}`} onClick={() => void onDelete(s.id)}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
