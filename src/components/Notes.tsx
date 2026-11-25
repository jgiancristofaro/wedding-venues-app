import DOMPurify from 'dompurify';
import { Bold, Italic, List, Pin, PinOff, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { NoteKind, VenueNote } from '../domain/types';
import { cx, dateTime } from '../lib/format';
import { useApp } from '../store/app';

export const sanitize = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br', 'a', 'div', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });

export function htmlToText(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = sanitize(html);
  return d.textContent ?? '';
}

function Editor({ onSave }: { onSave: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const cmd = (c: string) => {
    ref.current?.focus();
    document.execCommand(c);
  };
  return (
    <div className="rounded-2xl border border-line bg-surface focus-within:ring-2 focus-within:ring-accent/40">
      <div className="flex gap-1 p-1.5 border-b border-line" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          className="icon-btn h-9 w-9"
          aria-label="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => cmd('bold')}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className="icon-btn h-9 w-9"
          aria-label="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => cmd('italic')}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className="icon-btn h-9 w-9"
          aria-label="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => cmd('insertUnorderedList')}
        >
          <List size={15} />
        </button>
      </div>
      <div className="relative">
        {empty && (
          <div className="absolute left-3 top-2.5 text-sm text-muted pointer-events-none">
            Write a note — impressions from the tour, questions to ask…
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="New note"
          className="prose-note min-h-[88px] px-3 py-2.5 text-sm outline-none"
          onInput={(e) => setEmpty(!(e.currentTarget.textContent ?? '').trim())}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              (
                e.currentTarget.parentElement?.parentElement?.querySelector(
                  '[data-save-note]',
                ) as HTMLButtonElement | null
              )?.click();
            }
          }}
          data-testid="note-editor"
        />
      </div>
      <div className="flex justify-end p-2">
        <button
          type="button"
          data-save-note
          className="btn-primary btn-sm"
          disabled={empty}
          onClick={() => {
            const html = sanitize(ref.current?.innerHTML ?? '');
            if (!htmlToText(html).trim()) return;
            onSave(html);
            if (ref.current) ref.current.innerHTML = '';
            setEmpty(true);
          }}
        >
          Add note
        </button>
      </div>
    </div>
  );
}

function QuickList({
  kind,
  items,
  onAdd,
  onDelete,
}: {
  kind: 'pro' | 'con';
  items: VenueNote[];
  onAdd: (t: string) => void;
  onDelete: (id: string) => void;
}) {
  const [v, setV] = useState('');
  const Icon = kind === 'pro' ? ThumbsUp : ThumbsDown;
  return (
    <div className="card p-4">
      <h4
        className={cx(
          'font-sans text-sm font-semibold flex items-center gap-2 mb-2',
          kind === 'pro' ? 'text-ok' : 'text-bad',
        )}
      >
        <Icon size={15} aria-hidden /> {kind === 'pro' ? 'Pros' : 'Cons'}
      </h4>
      <ul className="space-y-1 text-sm mb-2">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-2 group">
            <span aria-hidden>{kind === 'pro' ? '+' : '–'}</span>
            <span className="flex-1">{htmlToText(n.html)}</span>
            <button
              className="opacity-60 hover:opacity-100 h-7 w-7 inline-flex items-center justify-center"
              aria-label="Delete"
              onClick={() => onDelete(n.id)}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onAdd(v.trim());
          setV('');
        }}
      >
        <input
          className="input h-9"
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={kind === 'pro' ? 'Add a pro' : 'Add a con'}
          aria-label={kind === 'pro' ? 'Add a pro' : 'Add a con'}
        />
        <button className="icon-btn h-9 w-9 border border-line" aria-label="Add">
          <Plus size={15} />
        </button>
      </form>
    </div>
  );
}

export function NotesPanel({ venueId }: { venueId: string }) {
  const all = useApp((s) => s.notes);
  const user = useApp((s) => s.user);
  const saveNote = useApp((s) => s.saveNote);
  const deleteNote = useApp((s) => s.deleteNote);
  const notes = all.filter((n) => n.venueId === venueId);
  const make = (kind: NoteKind, html: string): VenueNote => ({
    id: crypto.randomUUID(),
    ownerId: user?.id ?? '',
    venueId,
    kind,
    html,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const entries = notes
    .filter((n) => n.kind === 'note')
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <QuickList
          kind="pro"
          items={notes.filter((n) => n.kind === 'pro')}
          onAdd={(t) => void saveNote(make('pro', t.replace(/</g, '&lt;')))}
          onDelete={(id) => void deleteNote(id)}
        />
        <QuickList
          kind="con"
          items={notes.filter((n) => n.kind === 'con')}
          onAdd={(t) => void saveNote(make('con', t.replace(/</g, '&lt;')))}
          onDelete={(id) => void deleteNote(id)}
        />
      </div>
      <Editor onSave={(html) => void saveNote(make('note', html))} />
      <ul className="space-y-3" aria-label="Notes">
        {entries.map((n) => (
          <li key={n.id} className={cx('card p-4', n.pinned && 'border-gold/60')}>
            <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
              {n.pinned && <Pin size={12} className="text-gold" aria-label="Pinned" />}
              <time dateTime={n.createdAt}>{dateTime(n.createdAt)}</time>
              <span className="ml-auto flex">
                <button
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-sunken"
                  aria-label={n.pinned ? 'Unpin note' : 'Pin note'}
                  onClick={() =>
                    void saveNote({ ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() })
                  }
                >
                  {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-sunken"
                  aria-label="Delete note"
                  onClick={() => void deleteNote(n.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            <div className="prose-note text-sm" dangerouslySetInnerHTML={{ __html: sanitize(n.html) }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
