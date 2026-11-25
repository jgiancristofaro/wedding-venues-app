import { AlertTriangle, CheckCircle2, FileSpreadsheet, Link2, Merge } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfidenceBadge } from '../../components/Pricing';
import { FIELD_DEFS } from '../../domain/fields';
import type { SourceInfo } from '../../domain/types';
import { contextFromProfile } from '../../domain/venues';
import { DUPLICATE_THRESHOLD, findDuplicates, type DedupeCandidate } from '../../lib/dedupe';
import { cx, money } from '../../lib/format';
import { runSpreadsheetImport, type PlannedRow } from '../../lib/import/jobs';
import {
  autoMapColumns,
  EXTRA_TARGETS,
  rowToVenue,
  type ColumnMapping,
  type MapTarget,
} from '../../lib/parsing/columnMap';
import type { SheetData } from '../../lib/parsing/spreadsheet';
import { estimate } from '../../lib/pricing';
import { useApp } from '../../store/app';
import { DropZone } from './DropZone';

const TARGET_OPTIONS: { value: MapTarget; label: string; group: string }[] = [
  { value: 'skip', label: '— Skip this column —', group: '' },
  ...FIELD_DEFS.filter((f) => f.type !== 'photos').map((f) => ({
    value: f.key as MapTarget,
    label: f.label,
    group: 'Venue field',
  })),
  ...EXTRA_TARGETS.map((t) => ({ value: t.key as MapTarget, label: t.label, group: 'Pricing & tracking' })),
];

export function SpreadsheetImport({
  initialFile,
  target,
  provenance,
  onDone,
}: {
  initialFile?: File;
  target: 'mine' | 'global';
  provenance?: SourceInfo;
  onDone: () => void;
}) {
  const mine = useApp((s) => s.mine);
  const globals = useApp((s) => s.globals);
  const profile = useApp((s) => s.profile);
  const toast = useApp((s) => s.toast);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [plan, setPlan] = useState<
    Record<number, { action: PlannedRow['action']; targetRef?: string; name?: string }>
  >({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (f: File) => {
    setError('');
    if (f.size > 25 * 1024 * 1024)
      return setError('That file is larger than 25 MB. Split it or remove images and try again.');
    setBusy(true);
    try {
      const XLSX = await import('@e965/xlsx');
      const { readWorkbook } = await import('../../lib/parsing/spreadsheet');
      const isCsv = /\.(csv|tsv)$/i.test(f.name);
      const data = isCsv ? await f.text() : await f.arrayBuffer();
      const s = readWorkbook(XLSX, data, { csv: isCsv });
      if (!s.length) throw new Error('No rows found');
      setFile(f);
      setSheets(s);
      setSheetIdx(0);
      setPlan({});
    } catch {
      setError(
        'We couldn’t read that spreadsheet. Make sure it’s an .xlsx, .xls or .csv file that isn’t password-protected.',
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initialFile) void load(initialFile);
  }, [initialFile]);

  const sheet = sheets[sheetIdx];
  useEffect(() => {
    if (sheet) setMapping(autoMapColumns(sheet.headers, sheet.rows.slice(0, 25)));
    setPlan({});
  }, [sheet]);

  const pool: DedupeCandidate[] = useMemo(
    () => [
      ...mine.map((m) => ({
        ref: `u:${m.id}`,
        name: m.fields.name,
        area: m.fields.area,
        lat: m.fields.lat,
        lng: m.fields.lng,
        website: m.fields.website,
      })),
      ...globals
        .filter((g) => !mine.some((m) => m.globalId === g.id))
        .map((g) => ({
          ref: `g:${g.id}`,
          name: g.fields.name,
          area: g.fields.area,
          lat: g.fields.lat,
          lng: g.fields.lng,
          website: g.fields.website,
        })),
    ],
    [mine, globals],
  );

  const parsed = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((row, i) => {
      const r = rowToVenue(row, mapping);
      const dupes = r.fields.name
        ? findDuplicates(
            { ref: 'new', name: r.fields.name, area: r.fields.area, website: r.fields.website },
            pool,
          )
        : [];
      return { i, rowNumber: sheet.rowNumbers[i], r, dupes };
    });
  }, [sheet, mapping, pool]);

  const planFor = (p: (typeof parsed)[number]) => {
    const explicit = plan[p.i];
    if (explicit) return explicit;
    if (!p.r.fields.name) return { action: 'skip' as const };
    const top = p.dupes[0];
    if (top && top.score >= DUPLICATE_THRESHOLD)
      return top.ref.startsWith('g:')
        ? { action: 'link' as const, targetRef: top.ref }
        : { action: 'merge' as const, targetRef: top.ref };
    return { action: 'create' as const };
  };

  const counts = parsed.reduce(
    (a, p) => {
      a[planFor(p).action]++;
      return a;
    },
    { create: 0, link: 0, merge: 0, skip: 0 } as Record<PlannedRow['action'], number>,
  );

  const start = () => {
    const rows: PlannedRow[] = parsed.map((p) => {
      const pl = planFor(p);
      return {
        rowNumber: p.rowNumber,
        action: pl.action,
        targetRef: pl.targetRef,
        fields: { ...p.r.fields, name: pl.name ?? p.r.fields.name },
        pricing: p.r.pricing,
        notes: p.r.notes,
        status: p.r.status,
        rating: p.r.rating,
        tags: p.r.tags,
        confidence: p.r.confidence,
      };
    });
    runSpreadsheetImport({ label: file!.name, sheet: sheet.name, rows, target, provenance });
    toast({ text: 'Import started — keep browsing, we’ll let you know when it’s done.' });
    onDone();
  };

  if (!sheet) {
    return (
      <div className="space-y-3">
        <DropZone
          accept=".xlsx,.xls,.csv,.tsv,.ods"
          onFiles={(f) => void load(f[0])}
          busy={busy}
          icon={<FileSpreadsheet size={32} />}
          title="Drop a spreadsheet"
          subtitle="XLSX, XLS or CSV — even a messy one. We’ll find the header row, skip blank rows and map the columns for you."
        />
        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="text-gold" />
        <span className="font-medium">{file?.name}</span>
        {sheets.length > 1 && (
          <label className="text-sm flex items-center gap-2">
            Sheet
            <select
              className="input h-10 w-auto"
              value={sheetIdx}
              onChange={(e) => setSheetIdx(+e.target.value)}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({s.rows.length} rows)
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="text-sm text-muted">
          Header found on row {sheet.rowNumbers[0] ? sheet.rowNumbers[0] - 1 : sheet.headerRow + 1}
        </span>
        <button className="btn-ghost btn-sm ml-auto" onClick={() => setSheets([])}>
          Choose another file
        </button>
      </div>

      <section aria-labelledby="map-h">
        <h2 id="map-h" className="text-2xl mb-1">
          1. Match your columns
        </h2>
        <p className="text-sm text-muted mb-4">
          We guessed where each column goes. Fix anything that looks off — the preview below updates
          instantly.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {mapping.map((m, idx) => (
            <div key={idx} className="card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate" title={m.header}>
                  {m.header}
                </span>
                {m.target !== 'skip' && (
                  <span
                    className={cx(
                      'text-[11px] rounded-full px-2 py-0.5 border',
                      m.confidence >= 0.85
                        ? 'text-ok border-ok/30'
                        : m.confidence >= 0.6
                          ? 'text-warn border-warn/30'
                          : 'text-muted border-line',
                    )}
                  >
                    {m.confidence >= 0.85 ? 'confident' : m.confidence >= 0.6 ? 'likely' : 'guess'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted truncate my-1">
                e.g.{' '}
                {sheet.rows
                  .map((r) => r[m.index])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(' · ') || '(empty)'}
              </p>
              <label className="sr-only" htmlFor={`map-${idx}`}>
                Map column {m.header} to
              </label>
              <select
                id={`map-${idx}`}
                className="input h-10"
                value={m.target}
                onChange={(e) =>
                  setMapping(
                    mapping.map((x, j) =>
                      j === idx ? { ...x, target: e.target.value as MapTarget, confidence: 1 } : x,
                    ),
                  )
                }
              >
                {TARGET_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.group ? `${o.group}: ` : ''}
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="prev-h">
        <h2 id="prev-h" className="text-2xl mb-1">
          2. Review rows
        </h2>
        <p className="text-sm text-muted mb-4">
          {counts.create} new · {counts.link} linked to the library · {counts.merge} merged into your venues ·{' '}
          {counts.skip} skipped. Prices parsed from text are suggestions — you can edit them later on each
          venue.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm min-w-[860px]" data-testid="import-preview">
            <thead className="text-left text-xs uppercase tracking-wider text-muted bg-sunken/60">
              <tr>
                <th className="p-3">Row</th>
                <th className="p-3">Venue</th>
                <th className="p-3">Parsed</th>
                <th className="p-3 text-right">Est. total</th>
                <th className="p-3">Confidence</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((p) => {
                const pl = planFor(p);
                const e = estimate(p.r.pricing, contextFromProfile(profile));
                return (
                  <tr
                    key={p.i}
                    className={cx('border-t border-line/70 align-top', pl.action === 'skip' && 'opacity-50')}
                  >
                    <td className="p-3 text-muted tabular-nums">{p.rowNumber}</td>
                    <td className="p-3">
                      <input
                        className="input h-9 min-w-[180px]"
                        aria-label={`Name for row ${p.rowNumber}`}
                        value={pl.name ?? p.r.fields.name}
                        onChange={(ev) =>
                          setPlan({
                            ...plan,
                            [p.i]: {
                              ...pl,
                              name: ev.target.value,
                              action: pl.action === 'skip' && ev.target.value ? 'create' : pl.action,
                            },
                          })
                        }
                      />
                      <div className="text-xs text-muted mt-1">
                        {[p.r.fields.area, p.r.fields.capacitySeated && `${p.r.fields.capacitySeated} seated`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {p.r.warnings.map((w) => (
                        <div key={w} className="text-xs text-warn flex gap-1 mt-0.5">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
                        </div>
                      ))}
                    </td>
                    <td className="p-3 text-xs text-muted max-w-[220px]">
                      {p.r.pricing.components
                        .map(
                          (c) =>
                            `${c.kind.replace('_', ' ')} ${c.rates.map((r) => money(r.amount)).join('/')}`,
                        )
                        .join('; ') || 'No pricing'}
                      {p.r.notes.length > 0 && <div className="mt-1">+ {p.r.notes.length} note(s)</div>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{money(e.total)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {p.r.confidence >= 0.75 ? (
                          <CheckCircle2 size={14} className="text-ok" />
                        ) : (
                          <AlertTriangle size={14} className="text-warn" />
                        )}
                        <span className="tabular-nums">{Math.round(p.r.confidence * 100)}%</span>
                      </div>
                      <div className="mt-1">
                        <ConfidenceBadge c={e.confidence} small />
                      </div>
                    </td>
                    <td className="p-3">
                      <select
                        className="input h-9 min-w-[210px]"
                        aria-label={`Action for row ${p.rowNumber}`}
                        value={`${pl.action}|${pl.targetRef ?? ''}`}
                        onChange={(ev) => {
                          const [action, targetRef] = ev.target.value.split('|');
                          setPlan({
                            ...plan,
                            [p.i]: {
                              ...pl,
                              action: action as PlannedRow['action'],
                              targetRef: targetRef || undefined,
                            },
                          });
                        }}
                      >
                        <option value="create|">Create new venue</option>
                        {p.dupes.map((d) => (
                          <option key={d.ref} value={`${d.ref.startsWith('g:') ? 'link' : 'merge'}|${d.ref}`}>
                            {d.ref.startsWith('g:') ? 'Link to library: ' : 'Merge into mine: '}
                            {d.name} ({Math.round(d.score * 100)}%)
                          </option>
                        ))}
                        <option value="skip|">Skip</option>
                      </select>
                      {p.dupes[0] && (
                        <div className="text-xs mt-1 flex items-center gap-1 text-gold">
                          {p.dupes[0].ref.startsWith('g:') ? <Link2 size={12} /> : <Merge size={12} />}{' '}
                          Possible duplicate: {p.dupes[0].name}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sticky bottom-[80px] md:bottom-4 z-30 card p-3 flex flex-wrap items-center gap-3">
        <span className="text-sm">
          Ready to import <strong>{parsed.length - counts.skip}</strong> of {parsed.length} rows
          {target === 'global' ? ' into the global library (unpublished)' : ''}.
        </span>
        <button
          className="btn-primary ml-auto"
          disabled={parsed.length - counts.skip === 0}
          onClick={start}
          data-testid="start-import"
        >
          Import {parsed.length - counts.skip} venues
        </button>
      </div>
    </div>
  );
}
