import {
  ClipboardPaste,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Link as LinkIcon,
  Shield,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty } from '../components/ui';
import type { SourceInfo } from '../domain/types';
import { classifyFile, takeHandoff, type Handoff } from '../lib/fileHandoff';
import { cx } from '../lib/format';
import { useApp } from '../store/app';
import { DocumentImport } from './import/DocumentImport';
import { ManualAdd } from './import/ManualAdd';
import { SpreadsheetImport } from './import/SpreadsheetImport';

type Mode = 'sheet' | 'doc' | 'paste' | 'link' | 'manual';
const TABS: { key: Mode; label: string; icon: typeof Upload; hint: string }[] = [
  { key: 'sheet', label: 'Spreadsheet', icon: FileSpreadsheet, hint: 'XLSX, XLS, CSV' },
  { key: 'doc', label: 'Brochure / PDF', icon: FileText, hint: 'PDF, images, DOCX' },
  { key: 'paste', label: 'Paste text', icon: ClipboardPaste, hint: 'Emails, websites' },
  { key: 'link', label: 'Link', icon: LinkIcon, hint: 'Online PDFs' },
  { key: 'manual', label: 'Add manually', icon: FilePlus2, hint: 'Quick or full form' },
];

export default function Import() {
  const [params, setParams] = useSearchParams();
  const user = useApp((s) => s.user);
  const isAdmin = useApp((s) => s.isAdmin);
  const mine = useApp((s) => s.mine);
  const requireAuth = useApp((s) => s.requireAuth);
  const mode = (params.get('mode') as Mode) || 'sheet';
  const venueId = params.get('venue') ?? undefined;
  const docId = params.get('doc') ?? undefined;
  const target: 'mine' | 'global' = params.get('target') === 'global' && isAdmin ? 'global' : 'mine';
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [nonce, setNonce] = useState(0);
  const [prov, setProv] = useState<SourceInfo>({ source: '', license: '', pricingAsOf: '' });

  useEffect(() => {
    const h = takeHandoff();
    if (h) {
      setHandoff(h);
      setNonce((n) => n + 1);
    }
  }, [params]);

  const setMode = (m: Mode) => {
    const p = new URLSearchParams(params);
    p.set('mode', m);
    p.delete('doc');
    setParams(p);
    setHandoff(null);
  };

  if (!user)
    return (
      <Empty
        icon={<Upload size={40} />}
        title="Import your research"
        action={
          <button
            className="btn-primary"
            onClick={() =>
              requireAuth('Sign in to import into your private library.', {
                type: 'navigate',
                to: `/import?mode=${mode}`,
              })
            }
          >
            Sign in to import
          </button>
        }
      >
        Bring in someone’s messy spreadsheet, a PDF booklet, screenshots or a pasted email. We’ll pull out
        capacities and pricing for you to review.
      </Empty>
    );

  const provOk = target === 'mine' || (prov.source.trim() && prov.license.trim() && prov.pricingAsOf);
  const sheetFile = handoff?.files.find((f) => classifyFile(f) === 'sheet');
  const docFiles = handoff?.files.filter((f) => classifyFile(f) === 'doc');
  const forVenue = venueId ? mine.find((m) => m.id === venueId) : undefined;

  return (
    <div className="pt-8">
      <p className="label mb-2">
        {target === 'global' ? 'Admin · global library' : 'Bring in your research'}
      </p>
      <h1 className="text-4xl mb-2">{forVenue ? `Add a document to ${forVenue.fields.name}` : 'Import'}</h1>
      <p className="text-muted mb-6 max-w-2xl">
        Tip: you can drop a file anywhere in the app. Spreadsheets become a bulk import; brochures open the
        review screen. Everything is reviewed before it’s saved.
      </p>

      {target === 'global' && (
        <fieldset className="card p-5 mb-6 grid sm:grid-cols-3 gap-3 border-gold/50">
          <legend className="label px-1 flex items-center gap-1.5">
            <Shield size={13} /> Required provenance for the global library
          </legend>
          <label className="text-sm">
            Source
            <input
              className="input mt-1"
              value={prov.source}
              onChange={(e) => setProv({ ...prov, source: e.target.value })}
              placeholder="e.g. Venue’s 2027 brochure"
            />
          </label>
          <label className="text-sm">
            Permission / license note
            <input
              className="input mt-1"
              value={prov.license}
              onChange={(e) => setProv({ ...prov, license: e.target.value })}
              placeholder="e.g. Shared by venue for publication"
            />
          </label>
          <label className="text-sm">
            Pricing as of
            <input
              type="date"
              className="input mt-1"
              value={prov.pricingAsOf}
              onChange={(e) => setProv({ ...prov, pricingAsOf: e.target.value })}
            />
          </label>
          <label className="text-sm sm:col-span-3">
            Source URL (optional)
            <input
              className="input mt-1"
              value={prov.sourceUrl ?? ''}
              onChange={(e) => setProv({ ...prov, sourceUrl: e.target.value || undefined })}
            />
          </label>
        </fieldset>
      )}

      {!forVenue && (
        <div role="tablist" aria-label="Import type" className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={mode === t.key}
              onClick={() => setMode(t.key)}
              className={cx(
                'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left shrink-0 transition min-h-[56px]',
                mode === t.key ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink/30',
              )}
            >
              <t.icon size={20} aria-hidden />
              <span>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className={cx('block text-xs', mode === t.key ? 'opacity-70' : 'text-muted')}>
                  {t.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!provOk ? (
        <p className="text-sm text-muted">Fill in the provenance fields above to continue.</p>
      ) : mode === 'sheet' && !forVenue ? (
        <SpreadsheetImport
          key={`s${nonce}`}
          initialFile={sheetFile}
          target={target}
          provenance={target === 'global' ? prov : undefined}
          onDone={() => setHandoff(null)}
        />
      ) : mode === 'manual' && !forVenue ? (
        <ManualAdd target={target} provenance={target === 'global' ? prov : undefined} />
      ) : (
        <DocumentImport
          key={`d${nonce}${docId ?? ''}`}
          mode={forVenue ? 'doc' : (mode as 'doc' | 'paste' | 'link')}
          initialFiles={docFiles}
          venueId={venueId}
          docId={docId}
          target={target}
          provenance={target === 'global' ? prov : undefined}
        />
      )}
    </div>
  );
}
