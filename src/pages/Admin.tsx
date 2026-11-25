import { Eye, EyeOff, Pencil, Plus, Search, Shield, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '../backend';
import { FieldRow } from '../components/FieldRow';
import { PricingEditor } from '../components/PricingEditor';
import { Empty, Modal } from '../components/ui';
import { FIELD_DEFS } from '../domain/fields';
import type { GlobalVenue } from '../domain/types';
import { isStale } from '../lib/pricing';
import { shortDate } from '../lib/format';
import { useApp } from '../store/app';

function Editor({ g, onClose }: { g: GlobalVenue; onClose: () => void }) {
  const s = useApp();
  const [v, setV] = useState<GlobalVenue>(structuredClone(g));
  const [busy, setBusy] = useState(false);
  const valid =
    v.fields.name &&
    v.provenance.source.trim() &&
    v.provenance.license.trim() &&
    (v.provenance.pricingAsOf || v.pricing.asOf);
  return (
    <Modal
      open
      onClose={onClose}
      title={g.id ? `Edit ${g.fields.name}` : 'New library venue'}
      wide="xl"
      footer={
        <>
          {!valid && (
            <span className="text-xs text-bad mr-auto">
              Name, source, license note and pricing-as-of date are required.
            </span>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await backend.saveGlobal({
                  ...v,
                  id: v.id || crypto.randomUUID(),
                  pricing: { ...v.pricing, asOf: v.pricing.asOf || v.provenance.pricingAsOf },
                });
                await s.reloadGlobals();
                s.toast({ text: 'Saved to the global library', tone: 'success' });
                onClose();
              } catch (e) {
                s.handleError(e, 'Could not save');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </button>
        </>
      }
    >
      <fieldset className="grid sm:grid-cols-4 gap-3 mb-6 rounded-2xl bg-sunken p-4">
        <legend className="label px-1">Provenance (required)</legend>
        <label className="text-sm">
          Source
          <input
            className="input mt-1"
            value={v.provenance.source}
            onChange={(e) => setV({ ...v, provenance: { ...v.provenance, source: e.target.value } })}
          />
        </label>
        <label className="text-sm">
          Source URL
          <input
            className="input mt-1"
            value={v.provenance.sourceUrl ?? ''}
            onChange={(e) =>
              setV({ ...v, provenance: { ...v.provenance, sourceUrl: e.target.value || undefined } })
            }
          />
        </label>
        <label className="text-sm">
          License / permission
          <input
            className="input mt-1"
            value={v.provenance.license}
            onChange={(e) => setV({ ...v, provenance: { ...v.provenance, license: e.target.value } })}
          />
        </label>
        <label className="text-sm">
          Pricing as of
          <input
            type="date"
            className="input mt-1"
            value={v.provenance.pricingAsOf ?? ''}
            onChange={(e) => setV({ ...v, provenance: { ...v.provenance, pricingAsOf: e.target.value } })}
          />
        </label>
        <label className="text-sm inline-flex items-center gap-2 min-h-[44px]">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={v.published}
            onChange={(e) => setV({ ...v, published: e.target.checked })}
          />{' '}
          Published
        </label>
        <label className="text-sm inline-flex items-center gap-2 min-h-[44px]">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={v.isSample}
            onChange={(e) => setV({ ...v, isSample: e.target.checked })}
          />{' '}
          Sample / fictional data
        </label>
      </fieldset>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card px-4">
          {FIELD_DEFS.map((d) => (
            <FieldRow
              key={d.key}
              def={d}
              value={v.fields[d.key]}
              editable
              onSave={(val) => setV({ ...v, fields: { ...v.fields, [d.key]: val } })}
            />
          ))}
        </div>
        <PricingEditor value={v.pricing} onChange={(p) => setV({ ...v, pricing: p })} />
      </div>
    </Modal>
  );
}

export default function Admin() {
  const isAdmin = useApp((s) => s.isAdmin);
  const globals = useApp((s) => s.globals);
  const flags = useApp((s) => s.flags);
  const reload = useApp((s) => s.reloadGlobals);
  const handleError = useApp((s) => s.handleError);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<GlobalVenue | null>(null);
  const list = useMemo(
    () =>
      globals
        .filter((g) => g.fields.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.fields.name.localeCompare(b.fields.name)),
    [globals, q],
  );

  if (!isAdmin)
    return (
      <Empty icon={<Shield size={40} />} title="Admins only">
        This area is for managing the global venue library.
      </Empty>
    );

  const blank: GlobalVenue = {
    id: '',
    fields: { name: '' },
    pricing: { currency: 'USD', components: [] },
    provenance: { source: '', license: '', pricingAsOf: '' },
    isSample: false,
    published: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="pt-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label mb-2 flex items-center gap-1.5">
            <Shield size={13} /> Admin
          </p>
          <h1 className="text-4xl">Global library</h1>
          <p className="text-sm text-muted mt-1">
            {globals.length} venues · {globals.filter((g) => !g.published).length} unpublished
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setEditing(blank)}>
            <Plus size={16} /> New venue
          </button>
          <Link to="/import?target=global&mode=sheet" className="btn-secondary">
            <Upload size={16} /> Import spreadsheet
          </Link>
          <Link to="/import?target=global&mode=doc" className="btn-primary">
            <Upload size={16} /> Import brochure
          </Link>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="card p-4">
          <div className="label mb-1">Future hook: suggest to library</div>
          <p className="text-muted">
            Lets users propose private venues for the library. Status:{' '}
            <strong>{flags.suggestToGlobal ? 'enabled' : 'off'}</strong> (flag SUGGEST_TO_GLOBAL_ENABLED).
          </p>
        </div>
        <div className="card p-4">
          <div className="label mb-1">Future hook: batch ingestion</div>
          <p className="text-muted">
            Edge Function <code>ingest</code> accepts structured JSON with source & permission metadata.
            Status: <strong>{flags.batchIngest ? 'enabled' : 'off'}</strong> (flag BATCH_INGEST_ENABLED).
          </p>
        </div>
      </div>
      <label className="relative block max-w-md">
        <span className="sr-only">Search library</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="input pl-9 rounded-full"
          placeholder="Search library"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-left text-xs uppercase tracking-wider text-muted bg-sunken/60">
            <tr>
              <th className="p-3">Venue</th>
              <th className="p-3">Source</th>
              <th className="p-3">Pricing as of</th>
              <th className="p-3">Status</th>
              <th className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.id} className="border-t border-line/70">
                <td className="p-3">
                  <Link to={`/venue/g/${g.id}`} className="font-medium hover:underline">
                    {g.fields.name}
                  </Link>
                  <div className="text-xs text-muted">{g.fields.area}</div>
                </td>
                <td className="p-3 text-muted">{g.provenance.source}</td>
                <td className="p-3">
                  {shortDate(g.pricing.asOf ?? g.provenance.pricingAsOf)}
                  {isStale(g.pricing.asOf) && <span className="ml-2 text-xs text-warn">may be outdated</span>}
                </td>
                <td className="p-3">
                  {g.published ? (
                    <span className="text-ok">Published</span>
                  ) : (
                    <span className="text-muted">Draft</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <button
                      className="icon-btn h-9 w-9"
                      aria-label={g.published ? `Unpublish ${g.fields.name}` : `Publish ${g.fields.name}`}
                      title={g.published ? 'Unpublish' : 'Publish'}
                      onClick={async () => {
                        try {
                          await backend.saveGlobal({ ...g, published: !g.published });
                          await reload();
                        } catch (e) {
                          handleError(e);
                        }
                      }}
                    >
                      {g.published ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      className="icon-btn h-9 w-9"
                      aria-label={`Edit ${g.fields.name}`}
                      onClick={() => setEditing(g)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn h-9 w-9"
                      aria-label={`Delete ${g.fields.name}`}
                      onClick={async () => {
                        if (
                          confirm(`Delete ${g.fields.name} from the library? Users' saved copies are kept.`)
                        ) {
                          try {
                            await backend.deleteGlobal(g.id);
                            await reload();
                          } catch (e) {
                            handleError(e);
                          }
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <Editor g={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
