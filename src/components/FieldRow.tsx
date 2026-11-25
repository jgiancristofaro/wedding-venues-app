import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import type { FieldDef } from '../domain/fields';
import { formatFieldValue, isEmptyValue } from '../domain/fields';
import type { FieldProvenance, Space, VenueFields } from '../domain/types';
import { cx, shortDate } from '../lib/format';
import { Icon } from './Icon';

const SOURCE_LABEL: Record<FieldProvenance['source'], string> = {
  manual: 'You entered',
  spreadsheet: 'Spreadsheet',
  document: 'Document',
  global: 'Global library',
  ai_web: 'Magic Fill (web)',
  ai_document: 'AI document read',
  geocoder: 'Geocoder',
};

export function ProvenanceDot({ p, userEdited }: { p?: FieldProvenance; userEdited?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!p) return null;
  const label = userEdited ? 'You edited' : SOURCE_LABEL[p.source];
  const text = `${label}${p.detail && p.detail !== label ? ` · ${p.detail}` : ''}${p.confidence != null ? ` · ${Math.round(p.confidence * 100)}% confidence` : ''} · ${shortDate(p.at)}`;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={cx('inline-flex items-center gap-1 rounded-full text-[10px] uppercase tracking-wider px-1.5 h-5 border', userEdited || p.source === 'manual' ? 'border-accent/40 text-accent' : p.source === 'global' ? 'border-line text-muted' : 'border-gold/50 text-gold')}
        aria-label={`Source: ${text}`}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
      >
        {userEdited || p.source === 'manual' ? 'yours' : p.source === 'global' ? 'library' : p.source === 'ai_web' ? 'web' : 'doc'}
      </button>
      {open && (
        <span role="tooltip" className="absolute z-30 left-0 top-6 w-64 rounded-lg bg-ink text-bg text-xs p-2.5 shadow-lift">
          {text}
          {p.snippet && <span className="block mt-1 italic opacity-80">“{p.snippet}”</span>}
          {p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="block mt-1 underline break-all">
              {p.url}
            </a>
          )}
        </span>
      )}
    </span>
  );
}

function SpacesEditor({ value, onChange }: { value: Space[]; onChange: (s: Space[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input className="input" aria-label="Space name" value={s.name} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className="input w-24" aria-label="Seated" placeholder="Seated" inputMode="numeric" value={s.seated ?? ''} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, seated: +e.target.value || undefined } : x)))} />
          <input className="input w-24" aria-label="Standing" placeholder="Standing" inputMode="numeric" value={s.standing ?? ''} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, standing: +e.target.value || undefined } : x)))} />
          <button className="icon-btn" aria-label="Remove space" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X size={15} />
          </button>
        </div>
      ))}
      <button className="btn-ghost btn-sm" onClick={() => onChange([...value, { name: 'New space' }])}>
        + Add space
      </button>
    </div>
  );
}

export function FieldRow({
  def,
  value,
  provenance,
  userEdited,
  editable,
  onSave,
  onRequestEdit,
}: {
  def: FieldDef;
  value: VenueFields[keyof VenueFields];
  provenance?: FieldProvenance;
  userEdited?: boolean;
  editable: boolean;
  onSave: (v: unknown) => void;
  onRequestEdit?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);
  const start = () => {
    if (!editable) return onRequestEdit?.();
    setDraft(value ?? (def.type === 'tags' ? [] : def.type === 'spaces' ? [] : ''));
    setEditing(true);
  };
  const commit = () => {
    let v: unknown = draft;
    if (def.type === 'number') v = draft === '' || draft == null ? undefined : Number(String(draft).replace(/[^\d.]/g, ''));
    if (def.type === 'text' || def.type === 'longtext' || def.type === 'url' || def.type === 'email' || def.type === 'phone') v = String(draft ?? '').trim() || undefined;
    onSave(v);
    setEditing(false);
  };
  const id = `f-${def.key}`;
  const empty = isEmptyValue(value);

  let editor: React.ReactNode = null;
  if (editing) {
    if (def.type === 'bool')
      editor = (
        <select id={id} className="input" value={draft == null ? '' : String(draft)} onChange={(e) => setDraft(e.target.value === '' ? undefined : e.target.value === 'true')}>
          <option value="">Unknown</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    else if (def.type === 'select')
      editor = (
        <select id={id} className="input" value={(draft as string) ?? ''} onChange={(e) => setDraft(e.target.value || undefined)}>
          <option value="">Unknown</option>
          {def.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    else if (def.type === 'tags')
      editor = <input id={id} className="input" value={((draft as string[]) ?? []).join(', ')} onChange={(e) => setDraft(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Comma-separated" />;
    else if (def.type === 'longtext') editor = <textarea id={id} className="input" rows={3} value={(draft as string) ?? ''} onChange={(e) => setDraft(e.target.value)} />;
    else if (def.type === 'spaces') editor = <SpacesEditor value={(draft as Space[]) ?? []} onChange={setDraft} />;
    else
      editor = (
        <input
          id={id}
          className="input"
          type={def.type === 'number' ? 'text' : def.type === 'email' ? 'email' : def.type === 'url' ? 'url' : 'text'}
          inputMode={def.type === 'number' ? 'numeric' : undefined}
          value={(draft as string | number) ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
        />
      );
  }

  return (
    <div className="flex gap-3 py-3 border-b border-line/60 last:border-0 group" data-field={def.key}>
      <Icon name={def.icon} className="text-muted mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <label htmlFor={id} className="text-xs text-muted">
            {def.label}
          </label>
          <ProvenanceDot p={provenance} userEdited={userEdited} />
        </div>
        {editing ? (
          <div className="space-y-2">
            {editor}
            <div className="flex gap-2">
              <button className="btn-primary btn-sm" onClick={commit}>
                <Check size={14} /> Save
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : def.key === 'website' && value ? (
          <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-sm underline break-all">
            {String(value)}
          </a>
        ) : (
          <p className={cx('text-sm whitespace-pre-wrap', empty && 'text-muted italic')}>{empty ? 'Not known yet' : formatFieldValue(def.key, value)}</p>
        )}
      </div>
      {!editing && (
        <button className="icon-btn h-9 w-9 opacity-60 group-hover:opacity-100 focus:opacity-100" aria-label={`Edit ${def.label}`} onClick={start}>
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}
