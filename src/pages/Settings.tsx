import { AlertTriangle, Database, Download, FileArchive, FileJson, FileSpreadsheet, Sparkles, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { backend } from '../backend';
import { Empty, Modal, Segmented } from '../components/ui';
import { buildRows } from '../domain/filtering';
import { globalView, mineView } from '../domain/venues';
import { downloadBlob } from '../lib/format';
import { useApp } from '../store/app';

export default function Settings() {
  const s = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  if (!s.user) return <Empty title="Settings">Sign in to manage your data.</Empty>;

  const rows = () => {
    const g = new Map(s.globals.map((x) => [x.id, x]));
    return buildRows(s.mine.map((m) => mineView(m, m.globalId ? g.get(m.globalId) : undefined)), s.profile).map((r) => ({ v: r.v, e: r.e, notes: s.notes.filter((n) => n.venueId === r.v.id) }));
  };
  const backup = async () => (await import('../lib/export')).makeBackup(s.profile, s.mine, s.notes, s.documents);

  return (
    <div className="pt-8 max-w-3xl space-y-8">
      <div>
        <p className="label mb-2">Account</p>
        <h1 className="text-4xl">Settings</h1>
        <p className="text-muted mt-1">{s.user.email}</p>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="text-xl">Appearance</h2>
        <Segmented
          label="Theme"
          value={s.theme}
          onChange={s.setTheme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-xl">Export</h2>
        <p className="text-sm text-muted">Your venues with normalized pricing, estimated totals, per-guest cost, confidence, assumptions, status, rank and notes.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={async () => (await import('../lib/export')).exportSheet(rows(), 'xlsx')} data-testid="export-xlsx"><FileSpreadsheet size={16} /> My Venues (.xlsx)</button>
          <button className="btn-secondary" onClick={async () => (await import('../lib/export')).exportSheet(rows(), 'csv')} data-testid="export-csv"><Download size={16} /> CSV</button>
          <button
            className="btn-secondary"
            onClick={async () => {
              const g = s.globals.map((x) => globalView(x));
              (await import('../lib/export')).exportSheet(buildRows(g, s.profile).map((r) => ({ v: r.v, e: r.e, notes: [] })), 'xlsx', 'vellum-library');
            }}
          >
            <FileSpreadsheet size={16} /> Discover library (.xlsx)
          </button>
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-xl">Backup & restore</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" data-testid="export-json" onClick={async () => downloadBlob(new Blob([JSON.stringify(await backup(), null, 2)], { type: 'application/json' }), `vellum-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
            <FileJson size={16} /> Full backup (.json)
          </button>
          <button className="btn-secondary" onClick={async () => (await import('../lib/export')).backupZip(await backup(), (d) => backend.getDocumentBlob(d), s.documents)}>
            <FileArchive size={16} /> Backup with documents (.zip)
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Restore backup file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const { parseBackup } = await import('../lib/export');
                const b = parseBackup(await f.text());
                const existing = new Set(s.mine.map((m) => m.id));
                const venues = b.venues.filter((v) => !existing.has(v.id)).map((v) => ({ ...v, ownerId: s.user!.id }));
                await s.addVenues(venues);
                const ids = new Set(s.notes.map((n) => n.id));
                for (const n of b.notes.filter((n) => !ids.has(n.id))) await s.saveNote({ ...n, ownerId: s.user!.id });
                if (b.profile) await s.setProfile(b.profile);
                s.toast({ text: `Restored ${venues.length} venues and ${b.notes.length} notes.`, tone: 'success' });
              } catch (err) {
                s.handleError(err, 'Restore failed');
              }
            }}
          />
        </div>
        <p className="text-xs text-muted">Restore adds venues that aren’t already in your library; it never deletes anything. Document files are restored from the ZIP manually by re-attaching them.</p>
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="text-xl flex items-center gap-2"><Sparkles size={18} className="text-gold" /> AI features</h2>
        <p className="text-sm">AI document parsing: <strong>{s.flags.aiParsing ? 'on' : 'off'}</strong> · Magic Fill: <strong>{s.flags.aiEnrich ? 'on' : 'off'}</strong></p>
        <p className="text-xs text-muted">These are controlled by the site owner. Everything works without them — imports use the built-in reader.</p>
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="text-xl flex items-center gap-2"><Database size={18} className="text-gold" /> Storage</h2>
        <p className="text-sm">{backend.mode === 'cloud' ? 'Your library is stored in the cloud and syncs across your devices.' : 'Demo mode: this site isn’t connected to a cloud backend, so your library is saved only in this browser.'}</p>
      </section>

      <section className="rounded-2xl border border-bad/40 p-5 space-y-3">
        <h2 className="text-xl text-bad flex items-center gap-2"><AlertTriangle size={18} /> Delete account</h2>
        <p className="text-sm text-muted">Permanently deletes your venues, notes, rankings, documents and profile. Download a backup first.</p>
        <button className="btn bg-bad text-white" onClick={() => setConfirmDelete(true)}>Delete my account</button>
      </section>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete everything?"
        footer={
          <button
            className="btn bg-bad text-white"
            disabled={typed !== 'DELETE'}
            onClick={async () => {
              try {
                await backend.deleteAccount();
                setConfirmDelete(false);
                location.assign(import.meta.env.BASE_URL);
              } catch (e) {
                s.handleError(e, 'Could not delete account');
              }
            }}
          >
            Permanently delete
          </button>
        }
      >
        <label className="text-sm" htmlFor="del-confirm">Type <strong>DELETE</strong> to confirm.</label>
        <input id="del-confirm" className="input mt-2" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Modal>
    </div>
  );
}
