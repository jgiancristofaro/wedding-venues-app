import { Heart, Plus, Upload } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { VenueBrowser } from '../components/VenueBrowser';
import { Empty } from '../components/ui';
import { mineView } from '../domain/venues';
import { useApp } from '../store/app';

export default function MyVenues() {
  const user = useApp((s) => s.user);
  const ready = useApp((s) => s.ready);
  const mine = useApp((s) => s.mine);
  const globals = useApp((s) => s.globals);
  const requireAuth = useApp((s) => s.requireAuth);
  const views = useMemo(() => {
    const g = new Map(globals.map((x) => [x.id, x]));
    return mine.map((m) => mineView(m, m.globalId ? g.get(m.globalId) : undefined));
  }, [mine, globals]);

  if (ready && !user) {
    return (
      <Empty
        icon={<Heart size={40} />}
        title="Your private venue library"
        action={
          <button
            className="btn-primary"
            onClick={() =>
              requireAuth('Sign in to start your private venue library.', { type: 'navigate', to: '/mine' })
            }
          >
            Sign in to get started
          </button>
        }
      >
        Save venues from Discover, import your spreadsheet, or drop in a brochure. Everything stays private to
        you and syncs across devices.
      </Empty>
    );
  }
  return (
    <VenueBrowser
      scope="mine"
      views={views}
      loading={!ready}
      header={
        <section className="pt-8 pb-6 flex flex-wrap items-end gap-4 justify-between">
          <div>
            <p className="label mb-2">Private library</p>
            <h1 className="text-4xl">My Venues</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/import?mode=manual" className="btn-secondary">
              <Plus size={16} /> Add venue
            </Link>
            <Link to="/import" className="btn-primary">
              <Upload size={16} /> Import
            </Link>
          </div>
        </section>
      }
      emptyState={
        <Empty
          icon={<Heart size={40} />}
          title="Nothing saved yet"
          action={
            <>
              <Link to="/" className="btn-primary">
                Browse Discover
              </Link>
              <Link to="/import" className="btn-secondary">
                Import a spreadsheet or brochure
              </Link>
            </>
          }
        >
          Tap the heart on any venue to copy it here. Your edits and notes are yours — the library never
          overwrites them.
        </Empty>
      }
    />
  );
}
