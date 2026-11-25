import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Empty, Skeleton } from './components/ui';
import Discover from './pages/Discover';
import { applyTheme, useApp } from './store/app';

const MyVenues = lazy(() => import('./pages/MyVenues'));
const VenueDetail = lazy(() => import('./pages/VenueDetail'));
const Shortlist = lazy(() => import('./pages/Shortlist'));
const Compare = lazy(() => import('./pages/Compare'));
const Import = lazy(() => import('./pages/Import'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function PageFallback() {
  return (
    <div className="pt-10 space-y-4" aria-busy="true">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function App() {
  const init = useApp((s) => s.init);
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => applyTheme(useApp.getState().theme);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [theme]);
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ScrollTop />
      <Layout>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Discover />} />
            <Route path="/mine" element={<MyVenues />} />
            <Route path="/venue/:kind/:id" element={<VenueDetail />} />
            <Route path="/shortlist" element={<Shortlist />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/import" element={<Import />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Empty title="Page not found">That page doesn’t exist. Head back to Discover.</Empty>} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
