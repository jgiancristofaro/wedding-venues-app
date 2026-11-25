import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  CloudOff,
  Compass,
  FileUp,
  GitCompareArrows,
  Heart,
  ListOrdered,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Shield,
  Sun,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { globalView, mineView } from '../domain/venues';
import { classifyFile, setHandoff } from '../lib/fileHandoff';
import { cx } from '../lib/format';
import { venuePhotos } from '../lib/images';
import { useApp } from '../store/app';
import { OnboardingDialog, ProfileDialog, profileSummary } from './Profile';
import { SignInDialog } from './SignIn';

const NAV = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/mine', label: 'My Venues', icon: Heart },
  { to: '/shortlist', label: 'Shortlist', icon: ListOrdered },
  { to: '/compare', label: 'Compare', icon: GitCompareArrows },
  { to: '/import', label: 'Import', icon: Upload },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Vellum home">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-ink font-serif text-lg">V</span>
      <span className="font-serif text-2xl tracking-tight hidden sm:block">Vellum</span>
    </Link>
  );
}

function UserMenu() {
  const user = useApp((s) => s.user);
  const isAdmin = useApp((s) => s.isAdmin);
  const signOut = useApp((s) => s.signOut);
  const requireAuth = useApp((s) => s.requireAuth);
  const [open, setOpen] = useState(false);
  if (!user)
    return (
      <button className="btn-secondary btn-sm" onClick={() => requireAuth('Sign in to save venues, notes and rankings across your devices.')}>
        Sign in
      </button>
    );
  return (
    <div className="relative">
      <button className="icon-btn border border-line" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen(!open)}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full" /> : <UserRound size={18} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 mt-2 w-60 card p-2 z-50 animate-rise" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            <div className="px-3 py-2 text-sm">
              <div className="font-medium truncate">{user.name ?? user.email}</div>
              <div className="text-muted text-xs truncate">{user.email}</div>
            </div>
            <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 h-11 text-sm hover:bg-sunken">
              <SettingsIcon size={16} /> Settings & export
            </Link>
            {isAdmin && (
              <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 h-11 text-sm hover:bg-sunken">
                <Shield size={16} /> Admin
              </Link>
            )}
            <button role="menuitem" onClick={() => { setOpen(false); void signOut(); }} className="w-full flex items-center gap-2 rounded-lg px-3 h-11 text-sm hover:bg-sunken">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ThemeToggle() {
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const dark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && document.documentElement.classList.contains('dark'));
  return (
    <button className="icon-btn" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function Header() {
  const profile = useApp((s) => s.profile);
  const compareN = useApp((s) => s.compare.length);
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-line/60">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 h-16 md:h-[72px] flex items-center gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden md:flex items-center gap-1 ml-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('px-3 h-10 inline-flex items-center rounded-full text-sm transition', isActive ? 'bg-ink text-bg' : 'text-muted hover:text-ink hover:bg-sunken')}
            >
              {n.label}
              {n.to === '/compare' && compareN > 0 && <span className="ml-1.5 text-[11px] rounded-full bg-gold/30 px-1.5">{compareN}</span>}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => setProfileOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-full border border-line bg-surface pl-3 pr-4 h-10 text-sm hover:shadow-card transition max-w-[56vw]"
          aria-label={`Wedding profile: ${profileSummary(profile)}. Edit`}
        >
          <span className="h-2 w-2 rounded-full bg-gold shrink-0" aria-hidden />
          <span className="truncate">{profileSummary(profile)}</span>
        </button>
        <ThemeToggle />
        <UserMenu />
      </div>
      <ProfileDialog key={profileOpen ? 'o' : 'c'} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}

function BottomNav() {
  const compareN = useApp((s) => s.compare.length);
  return (
    <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center justify-center gap-0.5 h-16 text-[11px]', isActive ? 'text-ink font-medium' : 'text-muted')}>
              <span className="relative">
                <n.icon size={21} aria-hidden />
                {n.to === '/compare' && compareN > 0 && <span className="absolute -top-1 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose text-white text-[10px] leading-4 text-center">{compareN}</span>}
              </span>
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function useViewByRef() {
  const globals = useApp((s) => s.globals);
  const mine = useApp((s) => s.mine);
  return useMemo(() => {
    const m = new Map<string, ReturnType<typeof globalView>>();
    const byGlobal = new Map(mine.filter((x) => x.globalId).map((x) => [x.globalId!, x]));
    const gById = new Map(globals.map((g) => [g.id, g]));
    for (const g of globals) m.set(`g:${g.id}`, globalView(g, byGlobal.get(g.id)));
    for (const u of mine) m.set(`u:${u.id}`, mineView(u, u.globalId ? gById.get(u.globalId) : undefined));
    return m;
  }, [globals, mine]);
}
export { useViewByRef };

function CompareTray({ dragging }: { dragging: boolean }) {
  const compare = useApp((s) => s.compare);
  const toggle = useApp((s) => s.toggleCompare);
  const clear = useApp((s) => s.setCompare);
  const views = useViewByRef();
  const { setNodeRef, isOver } = useDroppable({ id: 'compare-tray' });
  const loc = useLocation();
  if (!compare.length && !dragging) return null;
  if (loc.pathname.startsWith('/compare') && !dragging) return null;
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'fixed z-40 left-1/2 -translate-x-1/2 bottom-[76px] md:bottom-5 w-[calc(100%-1.5rem)] max-w-3xl card px-3 py-2.5 flex items-center gap-3 transition no-print',
        isOver && 'ring-4 ring-gold/60 scale-[1.02]',
        dragging && !isOver && 'ring-2 ring-dashed ring-accent/40',
      )}
      aria-label="Compare tray"
      role="region"
      data-testid="compare-tray"
    >
      <GitCompareArrows size={18} className="text-muted shrink-0 hidden sm:block" aria-hidden />
      <ul className="flex gap-2 flex-1 min-w-0 overflow-x-auto">
        {[0, 1, 2, 3].map((i) => {
          const ref = compare[i];
          const v = ref ? views.get(ref) : undefined;
          return (
            <li key={i} className="shrink-0">
              {v ? (
                <div className="relative group">
                  <img src={venuePhotos(v.ref.slice(2), v.fields)[0].url} alt="" className="h-11 w-14 rounded-lg object-cover" />
                  <button className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-ink text-bg inline-flex items-center justify-center" aria-label={`Remove ${v.fields.name} from compare`} onClick={() => toggle(ref)}>
                    <X size={12} />
                  </button>
                  <span className="sr-only">{v.fields.name}</span>
                </div>
              ) : (
                <div className={cx('h-11 w-14 rounded-lg border-2 border-dashed', isOver ? 'border-gold' : 'border-line')} aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
      <span className="text-xs text-muted hidden sm:block">{dragging ? 'Drop to compare' : `${compare.length}/4`}</span>
      {compare.length > 0 && (
        <button className="btn-ghost btn-sm hidden sm:inline-flex" onClick={() => clear([])}>
          Clear
        </button>
      )}
      <Link to="/compare" className={cx('btn-primary btn-sm', compare.length < 2 && 'pointer-events-none opacity-50')} aria-disabled={compare.length < 2}>
        Compare{compare.length ? ` (${compare.length})` : ''}
      </Link>
    </div>
  );
}

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="fixed z-[70] bottom-[150px] md:bottom-24 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={cx('flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lift animate-rise text-sm', t.tone === 'error' ? 'bg-bad text-white' : 'bg-ink text-bg')}>
          <span className="flex-1">{t.text}</span>
          {t.progress != null && <span className="tabular-nums text-xs opacity-80">{Math.round(t.progress * 100)}%</span>}
          {t.action && (
            <button className="font-semibold underline underline-offset-2" onClick={() => { t.action!.run(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100 h-8 w-8 inline-flex items-center justify-center">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function FileDropOverlay() {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const toast = useApp((s) => s.toast);
  const requireAuth = useApp((s) => s.requireAuth);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setActive(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      if (!requireAuth('Sign in to import files into your private library.', { type: 'navigate', to: '/import' })) return;
      const target = (e.target as HTMLElement | null)?.closest?.('[data-venue-drop]') as HTMLElement | null;
      const venueId = target?.dataset.venueDrop;
      const kinds = files.map(classifyFile);
      if (kinds.every((k) => k === 'unsupported')) {
        toast({ text: 'That file type isn’t supported. Try XLSX, CSV, PDF, DOCX or an image.', tone: 'error' });
        return;
      }
      setHandoff({ files, venueId });
      const mode = venueId ? 'doc' : kinds.includes('sheet') ? 'sheet' : 'doc';
      navigate(`/import?mode=${mode}${venueId ? `&venue=${venueId}` : ''}`);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [navigate, toast, requireAuth]);
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[80] pointer-events-none bg-accent/15 backdrop-blur-[2px] flex items-center justify-center p-6 animate-rise" data-testid="drop-overlay">
      <div className="rounded-3xl border-2 border-dashed border-accent bg-surface/95 px-10 py-12 text-center shadow-lift max-w-md">
        <FileUp size={40} className="mx-auto text-accent mb-4" aria-hidden />
        <p className="font-serif text-2xl mb-2">Drop to import</p>
        <p className="text-sm text-muted">Spreadsheets become a bulk import. PDFs, brochures, screenshots and Word docs go to the document reader. Drop on a venue page to attach it there.</p>
      </div>
    </div>
  );
}

function StatusBanners() {
  const online = useApp((s) => s.online);
  const jobs = useApp((s) => s.jobs);
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  return (
    <>
      {!online && (
        <div className="bg-warn/15 text-ink text-sm text-center py-2 px-4 flex items-center justify-center gap-2" role="status">
          <CloudOff size={16} aria-hidden /> You’re offline. You can keep browsing; changes will sync when you reconnect.
        </div>
      )}
      {running.map((j) => (
        <div key={j.id} className="bg-sunken text-sm px-4 py-2 flex items-center gap-3 justify-center" role="status" aria-live="polite">
          <span>Importing “{j.label}” — {j.processed}/{j.total}</span>
          <span className="h-1.5 w-40 rounded-full bg-line overflow-hidden" aria-hidden>
            <span className="block h-full bg-accent transition-all" style={{ width: `${Math.round(j.progress * 100)}%` }} />
          </span>
        </div>
      ))}
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const toggleCompare = useApp((s) => s.toggleCompare);
  const compare = useApp((s) => s.compare);
  const [drag, setDrag] = useState<{ ref: string; name: string } | null>(null);
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  useEffect(() => {
    const go = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener('vellum:navigate', go);
    return () => window.removeEventListener('vellum:navigate', go);
  }, [navigate]);

  const onStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { ref?: string; name?: string } | undefined;
    if (d?.ref) setDrag({ ref: d.ref, name: d.name ?? '' });
  };
  const onEnd = (e: DragEndEvent) => {
    const d = e.active.data.current as { ref?: string } | undefined;
    if (e.over?.id === 'compare-tray' && d?.ref && !compare.includes(d.ref)) toggleCompare(d.ref);
    setDrag(null);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDrag(null)} accessibility={{ announcements: {
      onDragStart: () => `Picked up venue. Move to the compare tray and press space to drop.`,
      onDragOver: ({ over }) => (over ? 'Over the compare tray.' : 'Not over a drop target.'),
      onDragEnd: ({ over }) => (over ? 'Added to compare.' : 'Dropped.'),
      onDragCancel: () => 'Cancelled.',
    } }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] btn-primary">
        Skip to content
      </a>
      <Header />
      <StatusBanners />
      <main id="main" className="mx-auto max-w-[1440px] px-4 sm:px-6 pb-40 md:pb-28">
        {children}
      </main>
      <BottomNav />
      <CompareTray dragging={!!drag} />
      <DragOverlay dropAnimation={null}>
        {drag ? (
          <div className="card px-4 py-3 text-sm font-medium shadow-lift rotate-2 flex items-center gap-2">
            <GitCompareArrows size={16} className="text-gold" /> {drag.name}
          </div>
        ) : null}
      </DragOverlay>
      <Toasts />
      <FileDropOverlay />
      <SignInDialog />
      <OnboardingDialog />
    </DndContext>
  );
}
