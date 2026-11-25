import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Images,
  ListOrdered,
  Paperclip,
  Printer,
  RefreshCcw,
  Star,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { backend, BackendError, type AiFieldValue } from '../backend';
import { DocumentViewer } from '../components/DocumentViewer';
import { FieldRow, ProvenanceDot } from '../components/FieldRow';
import { Icon } from '../components/Icon';
import { NotesPanel } from '../components/Notes';
import { ConfidenceBadge } from '../components/Pricing';
import { PricingEditor } from '../components/PricingEditor';
import { PricingPlayground } from '../components/PricingPlayground';
import { Empty, Modal, Tooltip } from '../components/ui';
import { CompareToggle, HeartButton } from '../components/VenueCard';
import { FIELD_DEFS, formatFieldValue, isEmptyValue, SECTIONS } from '../domain/fields';
import type { DocumentRecord, FieldKey, VenueStatus, VenueView } from '../domain/types';
import { STATUSES } from '../domain/types';
import {
  acceptGlobalChange,
  dismissGlobalChange,
  fit,
  globalChanges,
  globalView,
  isUserEdited,
  mineView,
  viewEstimate,
} from '../domain/venues';
import { cx, money, plural, shortDate } from '../lib/format';
import { venuePhotos } from '../lib/images';
import type { PricingOverrides } from '../lib/pricing';
import { useApp } from '../store/app';

const MapView = lazy(() => import('../components/MapView'));

function Gallery({ v }: { v: VenueView }) {
  const photos = venuePhotos(v.ref.slice(2), v.fields);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="relative grid grid-cols-4 grid-rows-2 gap-2 h-[260px] sm:h-[420px] rounded-3xl overflow-hidden">
        {photos.slice(0, 5).map((p, i) => (
          <button
            key={i}
            className={cx(
              'relative overflow-hidden bg-sunken group',
              i === 0 ? 'col-span-4 row-span-2 sm:col-span-2' : 'hidden sm:block',
            )}
            onClick={() => setOpen(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length}${p.caption ? `: ${p.caption}` : ''}`}
          >
            <img
              src={p.url}
              alt={p.caption ?? ''}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading={i ? 'lazy' : 'eager'}
            />
          </button>
        ))}
        <button
          className="absolute bottom-3 right-3 btn-secondary btn-sm shadow-card"
          onClick={() => setOpen(0)}
        >
          <Images size={15} /> All photos ({photos.length})
        </button>
        {photos[0]?.source === 'generated' && (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/55 text-white text-[11px] px-2.5 py-1 backdrop-blur">
            Illustrations — no real photos on file
          </span>
        )}
      </div>
      {open != null && (
        <div
          className="fixed inset-0 z-[90] bg-black/95 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(null);
            if (e.key === 'ArrowRight') setOpen((open + 1) % photos.length);
            if (e.key === 'ArrowLeft') setOpen((open - 1 + photos.length) % photos.length);
          }}
        >
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm tabular-nums">
              {open + 1} / {photos.length}
              {photos[open].caption ? ` · ${photos[open].caption}` : ''}
            </span>
            <button
              className="icon-btn text-white hover:bg-white/10"
              onClick={() => setOpen(null)}
              aria-label="Close photo viewer"
              autoFocus
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center gap-2 px-2 min-h-0">
            <button
              className="icon-btn text-white hover:bg-white/10"
              onClick={() => setOpen((open - 1 + photos.length) % photos.length)}
              aria-label="Previous photo"
            >
              <ChevronLeft size={26} />
            </button>
            <img
              src={photos[open].url}
              alt={photos[open].caption ?? ''}
              className="max-h-full max-w-[calc(100%-120px)] object-contain rounded-lg"
            />
            <button
              className="icon-btn text-white hover:bg-white/10"
              onClick={() => setOpen((open + 1) % photos.length)}
              aria-label="Next photo"
            >
              <ChevronRight size={26} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Stars({ value, onChange }: { value?: number; onChange: (n: number) => void }) {
  return (
    <div className="flex" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className="h-10 w-9 inline-flex items-center justify-center"
          onClick={() => onChange(value === n ? 0 : n)}
        >
          <Star size={20} className={cx((value ?? 0) >= n ? 'fill-gold text-gold' : 'text-line')} />
        </button>
      ))}
    </div>
  );
}

function MagicFill({ v, onClose }: { v: VenueView; onClose: () => void }) {
  const updateFields = useApp((s) => s.updateFields);
  const missing = FIELD_DEFS.filter(
    (f) => f.type !== 'photos' && f.type !== 'spaces' && isEmptyValue(v.fields[f.key]),
  ).map((f) => f.key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [props, setProps] = useState<AiFieldValue[] | null>(null);
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      setProps(
        await backend.aiEnrich(
          { name: v.fields.name, area: v.fields.area, website: v.fields.website },
          missing,
        ),
      );
    } catch (e) {
      setErr(e instanceof BackendError ? e.message : 'Magic Fill failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Magic Fill" wide>
      <p className="text-sm text-muted mb-4">
        Searches public web pages for <strong>{plural(missing.length, 'missing field')}</strong>. Every
        suggestion shows its source and date. Nothing changes until you accept it — your own entries and
        document values are never touched.
      </p>
      {!props && (
        <button className="btn-primary" disabled={busy || !missing.length} onClick={() => void run()}>
          <Wand2 size={16} /> {busy ? 'Searching the web…' : 'Search the web'}
        </button>
      )}
      {err && (
        <p className="text-sm text-bad mt-3" role="alert">
          {err}
        </p>
      )}
      {props && (
        <ul className="space-y-3">
          {!props.length && <li className="text-sm text-muted">No sourced values found.</li>}
          {props.map((p, i) => (
            <li key={i} className="card p-4 flex gap-4 items-start">
              <div className="flex-1 text-sm">
                <div className="label">{FIELD_DEFS.find((f) => f.key === p.field)?.label ?? p.field}</div>
                <div className="font-medium my-1">
                  {Array.isArray(p.value) ? p.value.join(', ') : String(p.value)}
                </div>
                {p.snippet && <div className="text-muted italic">“{p.snippet}”</div>}
                <a
                  className="text-xs underline break-all"
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p.sourceUrl}
                </a>{' '}
                {p.sourceDate && <span className="text-xs text-muted">· {p.sourceDate}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  className="btn-primary btn-sm"
                  onClick={() => {
                    void updateFields(v.id, { [p.field]: p.value } as never, {
                      source: 'ai_web',
                      url: p.sourceUrl,
                      snippet: p.snippet,
                      confidence: p.confidence,
                      detail: `Web · ${p.sourceDate ?? 'undated'}`,
                    });
                    setProps(props.filter((_, j) => j !== i));
                  }}
                >
                  Accept
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setProps(props.filter((_, j) => j !== i))}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function DocumentsPanel({ venueId }: { venueId: string }) {
  const docs = useApp((s) => s.documents);
  const remove = useApp((s) => s.removeDocument);
  const handleError = useApp((s) => s.handleError);
  const mine = docs.filter((d) => d.venueId === venueId);
  const [viewing, setViewing] = useState<{ d: DocumentRecord; blob: Blob } | null>(null);
  const navigate = useNavigate();
  return (
    <div className="space-y-3">
      {mine.length === 0 && (
        <p className="text-sm text-muted">
          No documents yet. Drop a brochure or price sheet anywhere on this page to attach it.
        </p>
      )}
      <ul className="grid sm:grid-cols-2 gap-3">
        {mine.map((d) => (
          <li key={d.id} className="card p-3 flex items-center gap-3">
            <FileText size={22} className="text-gold shrink-0" />
            <button
              className="flex-1 text-left min-w-0"
              onClick={async () => {
                try {
                  setViewing({ d, blob: await backend.getDocumentBlob(d) });
                } catch (e) {
                  handleError(e, 'Could not open document');
                }
              }}
            >
              <div className="text-sm font-medium truncate">{d.filename}</div>
              <div className="text-xs text-muted">
                {(d.size / 1024 / 1024).toFixed(1)} MB · {shortDate(d.createdAt)}
              </div>
            </button>
            <button
              className="icon-btn h-9 w-9"
              aria-label={`Re-read ${d.filename} to update fields`}
              title="Update fields from this document"
              onClick={() => navigate(`/import?mode=doc&venue=${venueId}&doc=${d.id}`)}
            >
              <RefreshCcw size={15} />
            </button>
            <button
              className="icon-btn h-9 w-9"
              aria-label={`Delete ${d.filename}`}
              onClick={() => void remove(d)}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <Link to={`/import?mode=doc&venue=${venueId}`} className="btn-secondary btn-sm">
        <Upload size={14} /> Attach a document
      </Link>
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.d.filename} wide="xl">
          <DocumentViewer blob={viewing.blob} mimeType={viewing.d.mimeType} text={viewing.d.extractedText} />
        </Modal>
      )}
    </div>
  );
}

export default function VenueDetail() {
  const { kind, id } = useParams();
  const navigate = useNavigate();
  const globals = useApp((s) => s.globals);
  const mine = useApp((s) => s.mine);
  const profile = useApp((s) => s.profile);
  const ready = useApp((s) => s.ready);
  const flags = useApp((s) => s.flags);
  const notes = useApp((s) => s.notes);
  const s = useApp();
  const [editPricing, setEditPricing] = useState(false);
  const [localOverrides, setLocalOverrides] = useState<PricingOverrides>({});
  const [magic, setMagic] = useState(false);

  const v: VenueView | null = useMemo(() => {
    if (kind === 'g') {
      const g = globals.find((x) => x.id === id);
      return g
        ? globalView(
            g,
            mine.find((m) => m.globalId === g.id),
          )
        : null;
    }
    const m = mine.find((x) => x.id === id);
    return m ? mineView(m, m.globalId ? globals.find((g) => g.id === m.globalId) : undefined) : null;
  }, [kind, id, globals, mine]);

  if (!v) {
    if (!ready || s.globalsLoading)
      return (
        <div className="pt-10">
          <div className="skeleton h-[420px]" />
        </div>
      );
    return (
      <Empty
        title="Venue not found"
        action={
          <Link to="/" className="btn-primary">
            Back to Discover
          </Link>
        }
      >
        {kind === 'u' && !s.user ? 'Sign in to see your private venues.' : 'It may have been removed.'}
      </Empty>
    );
  }

  const isMine = v.kind === 'mine' && !!v.mine;
  const m = v.mine;
  const e = viewEstimate(v, profile);
  const f = fit(v.fields, profile.guestCount);
  const changes = isMine && v.global ? globalChanges(m!, v.global) : [];
  const overrides = isMine ? (m!.overrides ?? {}) : localOverrides;
  const setOverrides = (o: PricingOverrides) =>
    isMine ? void s.patchVenue(m!.id, { overrides: o }) : setLocalOverrides(o);

  const makeEditable = async () => {
    if (isMine) return;
    if (v.mine) return navigate(`/venue/u/${v.mine.id}`);
    const copy = await s.heartGlobal(v.id);
    if (copy) {
      s.toast({ text: 'Saved a private copy so you can edit it. The library version stays unchanged.' });
      navigate(`/venue/u/${copy.id}`);
    }
  };

  const exportOnePager = async () => {
    const { onePagerPdf } = await import('../lib/export');
    await onePagerPdf({ v, e, notes: m ? notes.filter((n) => n.venueId === m.id) : [] }, profile);
  };

  const facts = [
    {
      icon: 'Users',
      label: 'Capacity',
      value: v.fields.capacitySeated ? `${v.fields.capacitySeated} seated` : '—',
      sub: v.fields.capacityStanding ? `${v.fields.capacityStanding} standing` : f.label,
    },
    {
      icon: 'Receipt',
      label: 'Est. total',
      value: money(e.total),
      sub: e.total != null ? 'all-in' : 'no pricing',
    },
    { icon: 'Wallet', label: 'Per guest', value: money(e.perGuest), sub: `${e.scenario.guests} guests` },
    {
      icon: 'Palette',
      label: 'Style',
      value: v.fields.styleTags?.slice(0, 2).join(', ') || '—',
      sub: v.fields.venueType ?? '',
    },
    {
      icon: 'Sun',
      label: 'Setting',
      value: formatFieldValue('setting', v.fields.setting) || '—',
      sub: v.fields.ceremonyOnSite ? 'Ceremony on-site' : '',
    },
  ];

  return (
    <article className="pt-4 sm:pt-6" data-venue-drop={isMine ? m!.id : undefined}>
      <button onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-3 mb-2 no-print">
        <ArrowLeft size={16} /> Back
      </button>
      {v.kind === 'global' && v.mine && (
        <div className="mb-4 rounded-2xl bg-sunken p-3 text-sm flex items-center gap-3 no-print">
          You saved this venue.{' '}
          <Link to={`/venue/u/${v.mine.id}`} className="underline font-medium">
            Open your copy
          </Link>{' '}
          to see your notes and edits.
        </div>
      )}
      <Gallery v={v} />

      <header className="mt-6 flex flex-wrap items-start gap-4 justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {v.isSample && (
              <span className="rounded-full bg-gold/15 text-ink text-[11px] uppercase tracking-wider px-2.5 py-1 border border-gold/40">
                Sample data · fictional venue
              </span>
            )}
            {v.kind === 'global' ? (
              <span className="label">Global library</span>
            ) : (
              <span className="label">{m?.globalId ? 'Your copy (linked to library)' : 'Your venue'}</span>
            )}
          </div>
          <h1 className="text-4xl md:text-5xl leading-tight">{v.fields.name}</h1>
          <p className="text-muted mt-1">{[v.fields.area, v.fields.region].filter(Boolean).join(', ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <HeartButton
            v={v}
            className="border border-line bg-surface [&_svg]:!text-ink [&[aria-pressed=true]_svg]:!text-rose [&_svg]:fill-transparent [&[aria-pressed=true]_svg]:!fill-rose"
          />
          <CompareToggle v={v} variant="button" />
          {isMine && (
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                m!.shortlistRank != null ? void s.removeFromShortlist(m!.id) : void s.addToShortlist(m!.id)
              }
              aria-pressed={m!.shortlistRank != null}
            >
              <ListOrdered size={16} />{' '}
              {m!.shortlistRank != null ? `Shortlist #${m!.shortlistRank}` : 'Add to shortlist'}
            </button>
          )}
          {flags.aiEnrich ? (
            <button
              className="btn-secondary btn-sm"
              onClick={() => (isMine ? setMagic(true) : void makeEditable())}
            >
              <Wand2 size={16} /> Magic Fill
            </button>
          ) : (
            <Tooltip text="AI features aren't enabled on this site yet">
              <button
                className="btn-secondary btn-sm"
                disabled
                aria-disabled="true"
                aria-label="Magic Fill (AI features aren't enabled on this site yet)"
              >
                <Wand2 size={16} /> Magic Fill
              </button>
            </Tooltip>
          )}
          <button className="btn-ghost btn-sm" onClick={() => void exportOnePager()}>
            <Download size={16} /> One-pager
          </button>
          <button className="btn-ghost btn-sm" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
        </div>
      </header>

      {changes.length > 0 && (
        <section
          className="mt-5 rounded-2xl border border-gold/50 bg-gold/10 p-4 no-print"
          aria-label="Library updates"
        >
          <p className="text-sm font-medium flex items-center gap-2">
            <RefreshCcw size={15} /> The library version of this venue changed. Review each update — your own
            edits and notes are never overwritten.
          </p>
          <ul className="mt-3 space-y-2">
            {changes.map((c) => (
              <li key={c.key} className="bg-surface rounded-xl p-3 text-sm flex flex-wrap items-center gap-3">
                <span className="font-medium w-40">{c.label}</span>
                <span className="flex-1 min-w-[200px]">
                  <span className="line-through text-muted mr-2">
                    {c.key === 'pricing' ? 'your pricing' : formatFieldValue(c.key, c.from as never) || '—'}
                  </span>
                  →{' '}
                  <span>
                    {c.key === 'pricing'
                      ? 'updated pricing rules'
                      : formatFieldValue(c.key, c.to as never) || '—'}
                  </span>
                  {c.userEdited && <span className="ml-2 text-xs text-warn">(you edited this)</span>}
                </span>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => void s.saveVenue(acceptGlobalChange(m!, v.global!, c.key))}
                >
                  Accept
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => void s.saveVenue(dismissGlobalChange(m!, v.global!, c.key))}
                >
                  Keep mine
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-px rounded-2xl overflow-hidden border border-line bg-line"
        aria-label="Key facts"
      >
        {facts.map((x) => (
          <div key={x.label} className="bg-surface p-4">
            <div className="label flex items-center gap-1.5">
              <Icon name={x.icon} size={13} /> {x.label}
            </div>
            <div className="mt-1 font-serif text-xl tabular-nums truncate">{x.value}</div>
            <div className="text-xs text-muted truncate">{x.sub}</div>
          </div>
        ))}
        <div className="bg-surface p-4 col-span-2 sm:col-span-5 flex flex-wrap items-center gap-3 text-sm">
          <ConfidenceBadge c={e.confidence} />
          <span className="text-muted">
            Pricing as of {shortDate(v.pricingAsOf) || 'unknown'}
            {e.stale ? ' — may be outdated' : ''}
          </span>
          <span
            className={cx('inline-flex items-center gap-1', f.fits === false ? 'text-bad' : 'text-muted')}
          >
            <Users size={14} /> {f.label}
          </span>
          {isMine && <ProvenanceDot p={m!.provenance.pricing} />}
        </div>
      </section>

      {isMine && (
        <section
          className="mt-6 card p-4 flex flex-wrap items-center gap-x-6 gap-y-3 no-print"
          aria-label="Your status"
        >
          <label className="text-sm flex items-center gap-2">
            Status
            <select
              className="input h-10 w-40 capitalize"
              value={m!.status}
              onChange={(ev) => void s.setStatus(m!.id, ev.target.value as VenueStatus)}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st[0].toUpperCase() + st.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-sm">
            Rating{' '}
            <Stars value={m!.rating} onChange={(n) => void s.patchVenue(m!.id, { rating: n || undefined })} />
          </div>
          <label className="text-sm flex items-center gap-2 flex-1 min-w-[220px]">
            Tags
            <input
              className="input h-10"
              defaultValue={m!.tags.join(', ')}
              placeholder="e.g. top 3, Mom’s pick"
              onBlur={(ev) =>
                void s.patchVenue(m!.id, {
                  tags: ev.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <button
            className="btn-ghost btn-sm text-bad"
            onClick={() => {
              void s.unsave(m!.id);
              navigate('/mine');
            }}
          >
            <Trash2 size={15} /> Remove
          </button>
        </section>
      )}

      {v.fields.description && (
        <p className="mt-8 text-lg leading-relaxed max-w-3xl font-serif">{v.fields.description}</p>
      )}

      <section className="mt-10" aria-labelledby="pricing-h">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 id="pricing-h" className="text-3xl">
              Pricing
            </h2>
            <p className="text-sm text-muted">
              Adjust the scenario to see the all-in estimate update live
              {isMine ? ' — your choices are saved for this venue' : ''}.
            </p>
          </div>
          <button
            className="btn-secondary btn-sm no-print"
            onClick={() => (isMine ? setEditPricing(!editPricing) : void makeEditable())}
          >
            {editPricing ? 'Done editing rules' : 'Edit pricing rules'}
          </button>
        </div>
        <PricingPlayground
          pricing={v.pricing}
          profile={profile}
          overrides={overrides}
          onOverrides={setOverrides}
          name={v.fields.name}
          pricingAsOf={v.pricingAsOf}
        />
        {editPricing && isMine && (
          <div className="mt-6">
            <h3 className="text-xl mb-3">Pricing rules</h3>
            <PricingEditor value={m!.pricing} onChange={(p) => void s.updatePricing(m!.id, p)} />
          </div>
        )}
        {v.pricing.notes && <p className="mt-4 text-sm text-muted">Venue note: {v.pricing.notes}</p>}
      </section>

      <div className="mt-12 grid lg:grid-cols-2 gap-x-10 gap-y-8">
        {SECTIONS.map((sec) => {
          const defs = FIELD_DEFS.filter(
            (d) => d.section === sec.key && d.key !== 'name' && d.key !== 'description',
          );
          if (!defs.length) return null;
          return (
            <section key={sec.key} aria-labelledby={`sec-${sec.key}`}>
              <h2 id={`sec-${sec.key}`} className="text-2xl mb-2 flex items-center gap-2">
                <Icon name={sec.icon} size={20} className="text-gold" /> {sec.title}
              </h2>
              <div className="card px-4">
                {defs.map((d) => (
                  <FieldRow
                    key={d.key}
                    def={d}
                    value={v.fields[d.key]}
                    provenance={
                      m?.provenance[d.key] ??
                      (v.kind === 'global' && !isEmptyValue(v.fields[d.key])
                        ? {
                            source: 'global',
                            detail: v.isSample ? 'Sample data (fictional)' : v.global?.provenance.source,
                            at: v.global?.updatedAt ?? '',
                          }
                        : undefined)
                    }
                    userEdited={isUserEdited(m, d.key as FieldKey)}
                    editable={isMine}
                    onRequestEdit={() => void makeEditable()}
                    onSave={(val) => void s.updateFields(m!.id, { [d.key]: val } as never)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {v.fields.lat != null && v.fields.lng != null && (
        <section className="mt-12" aria-labelledby="loc-h">
          <h2 id="loc-h" className="text-2xl mb-3">
            Location
          </h2>
          <Suspense fallback={<div className="skeleton h-80" />}>
            <MapView
              single
              height="320px"
              items={[
                {
                  ref: v.ref,
                  name: v.fields.name,
                  lat: v.fields.lat,
                  lng: v.fields.lng,
                  total: e.total,
                  href: '#',
                  area: v.fields.area,
                },
              ]}
              focus={{ lat: v.fields.lat, lng: v.fields.lng }}
            />
          </Suspense>
          {v.fields.address && (
            <a
              className="text-sm underline mt-2 inline-flex items-center gap-1"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(v.fields.address)}`}
            >
              {v.fields.address} <ExternalLink size={12} />
            </a>
          )}
        </section>
      )}

      {isMine ? (
        <div className="mt-12 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-10">
          <section aria-labelledby="notes-h">
            <h2 id="notes-h" className="text-2xl mb-3">
              Notes
            </h2>
            <NotesPanel venueId={m!.id} />
          </section>
          <section aria-labelledby="docs-h">
            <h2 id="docs-h" className="text-2xl mb-3 flex items-center gap-2">
              <Paperclip size={20} className="text-gold" /> Documents
            </h2>
            <DocumentsPanel venueId={m!.id} />
          </section>
        </div>
      ) : (
        <section className="mt-12 rounded-3xl bg-sunken p-6 sm:p-8 text-center no-print">
          <h2 className="text-2xl mb-2">Make it yours</h2>
          <p className="text-muted mb-4 max-w-lg mx-auto">
            Save this venue to add notes, pros & cons, attach brochures, edit details and rank it on your
            shortlist.
          </p>
          <button className="btn-primary" onClick={() => void makeEditable()}>
            Save to My Venues
          </button>
          <p className="text-xs text-muted mt-6">
            Source: {v.global?.provenance.source} · {v.global?.provenance.license}
          </p>
        </section>
      )}
      {magic && <MagicFill v={v} onClose={() => setMagic(false)} />}
    </article>
  );
}
