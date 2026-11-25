import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GitCompareArrows, GripVertical, ListOrdered, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfidenceBadge } from '../components/Pricing';
import { Empty } from '../components/ui';
import type { UserVenue } from '../domain/types';
import { fit, mineView, viewEstimate } from '../domain/venues';
import { cx, money } from '../lib/format';
import { venuePhotos } from '../lib/images';
import { useApp } from '../store/app';

function Row({
  m,
  index,
  count,
  move,
}: {
  m: UserVenue;
  index: number;
  count: number;
  move: (from: number, to: number) => void;
}) {
  const profile = useApp((s) => s.profile);
  const remove = useApp((s) => s.removeFromShortlist);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const v = mineView(m);
  const e = viewEstimate(v, profile);
  const f = fit(m.fields, profile.guestCount);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        'card flex items-center gap-3 p-3 sm:p-4 bg-surface',
        isDragging && 'shadow-lift ring-2 ring-gold/50 z-10 relative',
      )}
      data-testid="shortlist-row"
    >
      <button
        {...attributes}
        {...listeners}
        className="icon-btn cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Reorder ${m.fields.name}. Press space to pick up, arrow keys to move, space to drop. Long-press on touch.`}
      >
        <GripVertical size={18} />
      </button>
      <span
        className="font-serif text-3xl w-8 text-center text-gold tabular-nums"
        aria-label={`Rank ${index + 1}`}
      >
        {index + 1}
      </span>
      <img
        src={venuePhotos(v.ref.slice(2), m.fields)[0].url}
        alt=""
        className="h-16 w-20 rounded-xl object-cover hidden sm:block"
      />
      <div className="flex-1 min-w-0">
        <Link to={`/venue/u/${m.id}`} className="font-serif text-xl hover:underline block truncate">
          {m.fields.name}
        </Link>
        <div className="text-sm text-muted truncate">
          {[m.fields.area, m.fields.region].filter(Boolean).join(', ')} ·{' '}
          <span className={f.fits === false ? 'text-bad' : ''}>{f.label}</span>
        </div>
      </div>
      <div className="text-right hidden sm:block">
        <div className="font-semibold tabular-nums">{money(e.total)}</div>
        <div className="text-xs text-muted tabular-nums">{money(e.perGuest)}/guest</div>
      </div>
      <div className="hidden md:block">
        <ConfidenceBadge c={e.confidence} small />
      </div>
      <div className="flex flex-col sm:flex-row">
        <button
          className="icon-btn h-11 w-11"
          disabled={index === 0}
          onClick={() => move(index, index - 1)}
          aria-label={`Move ${m.fields.name} up`}
        >
          <ArrowUp size={16} />
        </button>
        <button
          className="icon-btn h-11 w-11"
          disabled={index === count - 1}
          onClick={() => move(index, index + 1)}
          aria-label={`Move ${m.fields.name} down`}
        >
          <ArrowDown size={16} />
        </button>
      </div>
      <button
        className="icon-btn h-11 w-11"
        onClick={() => void remove(m.id)}
        aria-label={`Remove ${m.fields.name} from shortlist`}
      >
        <X size={16} />
      </button>
    </li>
  );
}

export default function Shortlist() {
  const mine = useApp((s) => s.mine);
  const user = useApp((s) => s.user);
  const reorder = useApp((s) => s.reorderShortlist);
  const setCompare = useApp((s) => s.setCompare);
  const requireAuth = useApp((s) => s.requireAuth);
  const navigate = useNavigate();
  const list = useMemo(
    () => mine.filter((m) => m.shortlistRank != null).sort((a, b) => a.shortlistRank! - b.shortlistRank!),
    [mine],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = (from: number, to: number) => void reorder(arrayMove(list, from, to).map((m) => m.id));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(
      list.findIndex((m) => m.id === e.active.id),
      list.findIndex((m) => m.id === e.over!.id),
    );
  };

  if (!user)
    return (
      <Empty
        icon={<ListOrdered size={40} />}
        title="Your ranked shortlist"
        action={
          <button
            className="btn-primary"
            onClick={() =>
              requireAuth('Sign in to build your shortlist.', { type: 'navigate', to: '/shortlist' })
            }
          >
            Sign in
          </button>
        }
      >
        Drag your favorites into order. Your ranking syncs to every device.
      </Empty>
    );

  return (
    <div className="pt-8 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="label mb-2">Favorites, in order</p>
          <h1 className="text-4xl">Shortlist</h1>
          <p className="text-muted text-sm mt-1">
            Drag to reorder (long-press on phones), or use the arrows. Saved automatically.
          </p>
        </div>
        {list.length >= 2 && (
          <button
            className="btn-primary"
            onClick={() => {
              setCompare(list.slice(0, 4).map((m) => `u:${m.id}`));
              navigate('/compare');
            }}
          >
            <GitCompareArrows size={16} /> Compare top {Math.min(4, list.length)}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <Empty
          title="No favorites yet"
          action={
            <Link to="/mine" className="btn-primary">
              Go to My Venues
            </Link>
          }
        >
          Open a saved venue and choose “Add to shortlist”, or set its status to Shortlisted.
        </Empty>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onEnd}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => `Picked up ${list.find((m) => m.id === active.id)?.fields.name}.`,
              onDragOver: ({ over }) =>
                over ? `Over position ${list.findIndex((m) => m.id === over.id) + 1}.` : '',
              onDragEnd: ({ over }) =>
                over ? `Dropped at position ${list.findIndex((m) => m.id === over.id) + 1}.` : 'Dropped.',
              onDragCancel: () => 'Reorder cancelled.',
            },
          }}
        >
          <SortableContext items={list.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3" aria-label="Ranked shortlist">
              {list.map((m, i) => (
                <Row key={m.id} m={m} index={i} count={list.length} move={move} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
