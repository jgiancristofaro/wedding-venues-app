import { AlertTriangle, FileText, Link as LinkIcon, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend, BackendError, MAX_UPLOAD_BYTES } from '../../backend';
import { DocumentViewer } from '../../components/DocumentViewer';
import { Icon } from '../../components/Icon';
import { PricingEditor } from '../../components/PricingEditor';
import { PricingPlayground } from '../../components/PricingPlayground';
import { Tooltip } from '../../components/ui';
import { FIELD_DEFS, formatFieldValue, isEmptyValue } from '../../domain/fields';
import type { FieldKey, FieldProvenance, GlobalVenue, Photo, SourceInfo, UserVenue, VenueFields } from '../../domain/types';
import { blankUserVenue } from '../../domain/venues';
import { DUPLICATE_THRESHOLD, findDuplicates } from '../../lib/dedupe';
import { cx } from '../../lib/format';
import { processDocument, processPastedText, type DocResult } from '../../lib/parsing/documentPipeline';
import type { Suggestion } from '../../lib/parsing/textHeuristics';
import { sanitizePricing, type PricingRules } from '../../lib/pricing';
import { useApp } from '../../store/app';
import { DropZone } from './DropZone';

interface FieldState {
  value: unknown;
  accept: boolean;
  s?: Suggestion & { source?: 'heuristic' | 'ai' };
}

function toInput(key: FieldKey, v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return key === 'spaces' ? JSON.stringify(v) : v.join(', ');
  return String(v);
}
function fromInput(key: FieldKey, s: string): unknown {
  const def = FIELD_DEFS.find((f) => f.key === key)!;
  if (!s.trim()) return undefined;
  if (def.type === 'number') return Number(s.replace(/[^\d.]/g, '')) || undefined;
  if (def.type === 'bool') return /^(y|yes|true)/i.test(s);
  if (def.type === 'tags') return s.split(',').map((x) => x.trim()).filter(Boolean);
  if (def.type === 'spaces') {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  }
  return s;
}

/** Review screen: document on one side, extracted (editable) suggestions on the other. Nothing saves until confirmed. */
function Review({ doc, blob, venueId, target, provenance, onReset }: { doc: DocResult; blob?: Blob; venueId?: string; target: 'mine' | 'global'; provenance?: SourceInfo; onReset: () => void }) {
  const mine = useApp((s) => s.mine);
  const globals = useApp((s) => s.globals);
  const profile = useApp((s) => s.profile);
  const flags = useApp((s) => s.flags);
  const user = useApp((s) => s.user);
  const s = useApp();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pricing, setPricing] = useState<PricingRules>(doc.extraction.pricing);
  const [pricingAccept, setPricingAccept] = useState(true);
  const [photoPick, setPhotoPick] = useState<boolean[]>(doc.photos.map((_, i) => i < 4));

  const existing = venueId ? mine.find((m) => m.id === venueId) : undefined;
  const nameGuess = (doc.extraction.fields.name?.value as string) ?? '';
  const dupes = useMemo(
    () => (nameGuess && !existing ? findDuplicates({ ref: 'new', name: nameGuess }, mine.map((m) => ({ ref: `u:${m.id}`, name: m.fields.name, area: m.fields.area }))) : []),
    [nameGuess, existing, mine],
  );
  const [targetId, setTargetId] = useState<string>(existing?.id ?? (dupes[0] && dupes[0].score >= DUPLICATE_THRESHOLD ? dupes[0].ref.slice(2) : ''));
  const targetVenue = mine.find((m) => m.id === targetId);

  const initFields = (): Record<string, FieldState> => {
    const out: Record<string, FieldState> = {};
    for (const f of FIELD_DEFS) {
      const sug = doc.extraction.fields[f.key];
      const cur = targetVenue?.fields[f.key];
      out[f.key] = { value: sug?.value, s: sug ? { ...sug, source: 'heuristic' } : undefined, accept: !!sug && (isEmptyValue(cur) || !targetVenue) };
    }
    return out;
  };
  const [fields, setFields] = useState<Record<string, FieldState>>(initFields);
  useEffect(() => {
    setFields(initFields());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const runAi = async () => {
    setAiBusy(true);
    try {
      const r = await backend.aiParse(doc.pages.map((p) => p.text), doc.filename);
      setFields((prev) => {
        const next = { ...prev };
        for (const fv of r.fields) {
          if (!next[fv.field]) continue;
          next[fv.field] = { value: fv.value, accept: true, s: { value: fv.value, confidence: fv.confidence, page: fv.page, snippet: fv.snippet, source: 'ai' } };
        }
        return next;
      });
      const p = sanitizePricing(r.pricing);
      if (p.components.length) setPricing(p);
      s.toast({ text: `AI read ${r.fields.length} fields${r.cached ? ' (cached)' : ''}. Review before saving.`, tone: 'success' });
    } catch (e) {
      s.handleError(e, 'AI parsing failed — the suggestions below still work');
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const accepted = Object.entries(fields).filter(([, st]) => st.accept && !isEmptyValue(st.value));
      const patch: Partial<VenueFields> = Object.fromEntries(accepted.map(([k, st]) => [k, st.value]));
      const prov = (st: FieldState): FieldProvenance => ({
        source: st.s?.source === 'ai' ? 'ai_document' : 'document',
        detail: `${doc.filename}${st.s?.page ? ` p.${st.s.page}` : ''}`,
        snippet: st.s?.snippet,
        confidence: st.s?.confidence,
        at: now,
      });
      const photos: Photo[] = doc.photos.filter((_, i) => photoPick[i]).map((url) => ({ url, caption: `From ${doc.filename}`, source: 'document' }));

      if (target === 'global') {
        const g: GlobalVenue = {
          id: crypto.randomUUID(),
          fields: { name: (patch.name as string) || 'Untitled venue', ...patch, photos },
          pricing: pricingAccept ? { ...pricing, currency: 'USD' } : { components: [] },
          provenance: provenance!,
          isSample: false,
          published: false,
          createdAt: now,
          updatedAt: now,
        };
        await backend.saveGlobal(g);
        await s.reloadGlobals();
        s.toast({ text: `Added “${g.fields.name}” to the global library as unpublished.`, tone: 'success' });
        navigate('/admin');
        return;
      }

      let v: UserVenue;
      if (targetVenue) {
        v = { ...targetVenue, fields: { ...targetVenue.fields, ...patch, photos: [...(targetVenue.fields.photos ?? []), ...photos] }, provenance: { ...targetVenue.provenance } };
      } else {
        v = blankUserVenue(user.id, { name: (patch.name as string) || nameGuess || doc.filename.replace(/\.\w+$/, ''), ...patch, photos });
      }
      for (const [k, st] of accepted) (v.provenance as Record<string, FieldProvenance>)[k] = prov(st);
      if (pricingAccept && pricing.components.length) {
        v.pricing = { ...pricing, currency: 'USD' };
        v.provenance.pricing = { source: 'document', detail: `${doc.filename} (pricing suggestions, reviewed)`, at: now };
      }
      // geocode new venues
      if (v.fields.lat == null && (v.fields.address || v.fields.area)) {
        try {
          const r = await backend.geocode([v.fields.address, v.fields.area].filter(Boolean).join(', '));
          if (r) v.fields = { ...v.fields, lat: r.lat, lng: r.lng };
        } catch {
          s.toast({ text: 'Couldn’t place this venue on the map right now — you can add an address later.' });
        }
      }
      await s.saveVenue(v);
      if (blob) {
        if (blob.size > MAX_UPLOAD_BYTES) s.toast({ text: 'The document is over 25 MB, so it wasn’t attached — the extracted details were saved.' });
        else {
          try {
            const rec = await backend.uploadDocument(blob, { venueId: v.id, filename: doc.filename, mimeType: doc.mimeType, size: blob.size, hash: doc.hash, pageCount: doc.pages.length, extractedText: doc.pages.map((p) => p.text) });
            s.addDocument(rec);
          } catch (e) {
            s.handleError(e, 'Saved the venue, but the document upload failed');
          }
        }
      }
      s.toast({ text: targetVenue ? `Updated ${v.fields.name}` : `Created ${v.fields.name}`, tone: 'success' });
      navigate(`/venue/u/${v.id}`);
    } catch (e) {
      s.handleError(e, 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const visible = FIELD_DEFS.filter((f) => f.type !== 'photos' && (showAll || fields[f.key]?.s || (f.key === 'name' && !targetVenue)));
  const nAccepted = Object.values(fields).filter((f) => f.accept && !isEmptyValue(f.value)).length;

  return (
    <div className="space-y-6" data-testid="review-screen">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="text-gold" />
        <h2 className="text-2xl">Review “{doc.filename}”</h2>
        <span className="text-sm text-muted">{doc.pages.length} page(s){doc.pages.some((p) => p.source === 'ocr') ? ' · OCR used' : ''}</span>
        <button className="btn-ghost btn-sm ml-auto" onClick={onReset}>Start over</button>
      </div>
      <div className="rounded-2xl bg-sunken p-4 text-sm flex gap-3">
        <Sparkles size={18} className="text-gold shrink-0" />
        <p>
          These are <strong>suggestions</strong> read automatically from the document. Check each value against the page on the left — tap a source snippet to jump to it. Nothing is saved until you press Save.
        </p>
      </div>
      {doc.warnings.map((w) => (
        <p key={w} className="text-sm text-warn flex gap-2"><AlertTriangle size={16} className="shrink-0" /> {w}</p>
      ))}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="lg:sticky lg:top-24">
          <DocumentViewer blob={doc.kind === 'text' ? undefined : blob} mimeType={doc.kind === 'docx' ? 'text/plain' : doc.mimeType} text={doc.pages.map((p) => p.text)} page={page} onPage={setPage} height="72vh" />
        </div>
        <div className="space-y-6">
          <div className="card p-4 space-y-3">
            {target === 'mine' ? (
              <>
                <label className="text-sm font-medium block" htmlFor="review-target">Save to</label>
                <select id="review-target" className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                  <option value="">A new venue</option>
                  {mine.map((m) => (
                    <option key={m.id} value={m.id}>Update: {m.fields.name}</option>
                  ))}
                </select>
                {!targetId && dupes[0] && <p className="text-xs text-gold">Looks similar to “{dupes[0].name}” in your library — choose it above to update it instead.</p>}
                {!targetId && globals.some((g) => g.fields.name === nameGuess) && <p className="text-xs text-muted">This venue is also in the global library; you can heart it there instead.</p>}
              </>
            ) : (
              <p className="text-sm">Saving into the <strong>global library</strong> (unpublished) with provenance: {provenance?.source}.</p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              {flags.aiParsing ? (
                <button className="btn-secondary btn-sm" onClick={() => void runAi()} disabled={aiBusy}><Wand2 size={15} /> {aiBusy ? 'Reading with AI…' : 'Read with AI'}</button>
              ) : (
                <Tooltip text="AI features aren't enabled on this site yet">
                  <button className="btn-secondary btn-sm" disabled aria-disabled="true"><Wand2 size={15} /> Read with AI</button>
                </Tooltip>
              )}
              <label className="text-sm inline-flex items-center gap-2 ml-auto min-h-[44px]">
                <input type="checkbox" className="h-4 w-4" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all fields
              </label>
            </div>
          </div>

          <ul className="space-y-2" aria-label="Extracted fields">
            {visible.map((f) => {
              const st = fields[f.key] ?? { value: undefined, accept: false };
              const cur = targetVenue?.fields[f.key];
              return (
                <li key={f.key} className={cx('card p-3', st.accept && 'border-accent/40')}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <input type="checkbox" className="h-5 w-5" aria-label={`Use suggested ${f.label}`} checked={st.accept} onChange={(e) => setFields({ ...fields, [f.key]: { ...st, accept: e.target.checked } })} />
                    <Icon name={f.icon} size={15} className="text-muted" />
                    <span className="text-sm font-medium">{f.label}</span>
                    {st.s && (
                      <span className={cx('ml-auto text-[11px] rounded-full px-2 py-0.5 border', st.s.confidence >= 0.7 ? 'text-ok border-ok/30' : 'text-warn border-warn/30')}>
                        {st.s.source === 'ai' ? 'AI · ' : ''}{Math.round(st.s.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  {f.type === 'longtext' ? (
                    <textarea className="input" rows={2} value={toInput(f.key, st.value)} aria-label={f.label} onChange={(e) => setFields({ ...fields, [f.key]: { ...st, value: fromInput(f.key, e.target.value), accept: true } })} />
                  ) : f.type === 'select' ? (
                    <select className="input" value={toInput(f.key, st.value)} aria-label={f.label} onChange={(e) => setFields({ ...fields, [f.key]: { ...st, value: e.target.value || undefined, accept: true } })}>
                      <option value="">—</option>
                      {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input className="input" value={toInput(f.key, st.value)} aria-label={f.label} onChange={(e) => setFields({ ...fields, [f.key]: { ...st, value: fromInput(f.key, e.target.value), accept: true } })} placeholder={f.type === 'bool' ? 'yes / no' : ''} />
                  )}
                  {st.s?.snippet && (
                    <button className="text-xs text-muted mt-1.5 text-left hover:text-ink" onClick={() => st.s?.page && setPage(st.s.page)}>
                      {st.s.page ? <span className="underline">p.{st.s.page}</span> : null} “{st.s.snippet}”
                    </button>
                  )}
                  {targetVenue && !isEmptyValue(cur) && <p className="text-xs text-muted mt-1">Currently: {formatFieldValue(f.key, cur)}</p>}
                </li>
              );
            })}
          </ul>

          {doc.photos.length > 0 && (
            <div className="card p-4">
              <div className="label mb-2">Photos found in the document</div>
              <div className="grid grid-cols-3 gap-2">
                {doc.photos.map((p, i) => (
                  <label key={i} className={cx('relative rounded-lg overflow-hidden border-2 cursor-pointer', photoPick[i] ? 'border-accent' : 'border-transparent opacity-60')}>
                    <img src={p} alt={`Candidate photo ${i + 1}`} className="aspect-[4/3] object-cover w-full" />
                    <input type="checkbox" className="absolute top-1.5 left-1.5 h-5 w-5" checked={!!photoPick[i]} onChange={(e) => setPhotoPick(photoPick.map((x, j) => (j === i ? e.target.checked : x)))} aria-label={`Add photo ${i + 1} to gallery`} />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <input id="accept-pricing" type="checkbox" className="h-5 w-5" checked={pricingAccept} onChange={(e) => setPricingAccept(e.target.checked)} />
              <label htmlFor="accept-pricing" className="font-medium">Use these pricing rules</label>
              <span className="text-xs text-muted ml-auto">{pricing.components.length} component(s) found</span>
            </div>
            {Object.entries(doc.extraction.pricingSources).length > 0 && (
              <ul className="text-xs text-muted space-y-1">
                {Object.entries(doc.extraction.pricingSources).slice(0, 8).map(([k, src]) => (
                  <li key={k}>
                    <button className="text-left hover:text-ink" onClick={() => src.page && setPage(src.page)}>
                      <span className="underline">p.{src.page}</span> “{src.snippet}”
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <PricingEditor value={pricing} onChange={setPricing} />
            <details>
              <summary className="cursor-pointer text-sm font-medium">Preview the estimate</summary>
              <div className="mt-3">
                <PricingPlayground pricing={pricing} profile={profile} overrides={{}} onOverrides={() => undefined} name="Preview" />
              </div>
            </details>
          </div>
        </div>
      </div>
      <div className="sticky bottom-[80px] md:bottom-4 z-30 card p-3 flex flex-wrap items-center gap-3">
        <span className="text-sm">{nAccepted} field(s){pricingAccept && pricing.components.length ? ' + pricing' : ''} will be saved{blob && target === 'mine' ? ', and the document attached' : ''}.</span>
        <button className="btn-primary ml-auto" onClick={() => void save()} disabled={saving} data-testid="review-save">
          {saving ? 'Saving…' : targetVenue ? `Update ${targetVenue.fields.name}` : 'Save venue'}
        </button>
      </div>
    </div>
  );
}

export function DocumentImport({ initialFiles, venueId, docId, target, provenance, mode }: { initialFiles?: File[]; venueId?: string; docId?: string; target: 'mine' | 'global'; provenance?: SourceInfo; mode: 'doc' | 'paste' | 'link' }) {
  const handleError = useApp((s) => s.handleError);
  const documents = useApp((s) => s.documents);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; f: number } | null>(null);
  const [result, setResult] = useState<{ doc: DocResult; blob?: Blob } | null>(null);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const [url, setUrl] = useState('');

  const run = async (file: Blob, name: string) => {
    setError('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That file is larger than 25 MB. Try compressing the PDF or uploading screenshots of the pricing pages.');
      return;
    }
    setBusy(true);
    try {
      const doc = await processDocument(file, name, (label, f) => setProgress({ label, f }));
      setResult({ doc, blob: file });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t read that file.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  useEffect(() => {
    if (initialFiles?.length) void run(initialFiles[0], initialFiles[0].name);
     
  }, [initialFiles]);

  useEffect(() => {
    const d = docId ? documents.find((x) => x.id === docId) : undefined;
    if (!d) return;
    void backend
      .getDocumentBlob(d)
      .then((b) => run(b.type ? b : new Blob([b], { type: d.mimeType }), d.filename))
      .catch((e) => handleError(e, 'Could not open the document'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (result) return <Review doc={result.doc} blob={result.blob} venueId={venueId} target={target} provenance={provenance} onReset={() => setResult(null)} />;

  if (busy)
    return (
      <div className="card p-10 text-center" role="status" aria-live="polite">
        <p className="font-serif text-2xl mb-2">Reading your document…</p>
        <p className="text-sm text-muted mb-5">{progress?.label ?? 'Starting'}</p>
        <div className="h-2 max-w-md mx-auto rounded-full bg-sunken overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((progress?.f ?? 0.02) * 100)}%` }} />
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      {mode === 'doc' && (
        <DropZone
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.docx,.txt,application/pdf,image/*"
          onFiles={(f) => void run(f[0], f[0].name)}
          icon={<FileText size={32} />}
          title={venueId ? 'Drop a document for this venue' : 'Drop a brochure or price sheet'}
          subtitle="PDF booklets, screenshots, photos of printed pages or Word docs. Scanned pages are read with OCR — all in your browser."
          camera
        />
      )}
      {mode === 'paste' && (
        <div className="card p-5 space-y-3">
          <label htmlFor="paste" className="font-medium">Paste text from an email or website</label>
          <textarea id="paste" className="input" rows={10} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'The Juniper Room\nSaturday site fee $9,000\nFood & beverage minimum $35,000\nPackages from $165 per person…'} />
          <button className="btn-primary" disabled={!paste.trim()} onClick={() => setResult({ doc: processPastedText(paste) })}>Find details</button>
        </div>
      )}
      {mode === 'link' && (
        <div className="card p-5 space-y-3">
          <label htmlFor="doc-url" className="font-medium flex items-center gap-2"><LinkIcon size={16} /> Link to a PDF or “digital booklet”</label>
          <div className="flex gap-2">
            <input id="doc-url" className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <button
              className="btn-primary"
              disabled={!url}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const blob = await backend.fetchDocument(url);
                  const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'document.pdf');
                  setBusy(false);
                  await run(blob, /\.\w{2,4}$/.test(name) ? name : `${name}.pdf`);
                } catch (e) {
                  setBusy(false);
                  setError(e instanceof BackendError ? e.message : 'We couldn’t fetch that link.');
                }
              }}
            >
              Fetch
            </button>
          </div>
          <p className="text-xs text-muted">Online flipbook viewers usually can’t be downloaded automatically. If that happens, use the viewer’s download button or take screenshots and upload them.</p>
        </div>
      )}
      {error && <p className="text-sm text-bad flex gap-2" role="alert"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</p>}
    </div>
  );
}
