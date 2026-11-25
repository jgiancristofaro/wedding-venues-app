import { useMemo } from 'react';
import { VenueBrowser } from '../components/VenueBrowser';
import { Empty } from '../components/ui';
import { globalView } from '../domain/venues';
import { useApp } from '../store/app';

export default function Discover() {
  const globals = useApp((s) => s.globals);
  const mine = useApp((s) => s.mine);
  const loading = useApp((s) => s.globalsLoading);
  const error = useApp((s) => s.globalsError);
  const reload = useApp((s) => s.reloadGlobals);
  const views = useMemo(() => {
    const byGlobal = new Map(mine.filter((m) => m.globalId).map((m) => [m.globalId!, m]));
    return globals.filter((g) => g.published).map((g) => globalView(g, byGlobal.get(g.id)));
  }, [globals, mine]);
  return (
    <VenueBrowser
      scope="discover"
      views={views}
      loading={loading && !globals.length}
      header={
        <section className="pt-8 pb-6 md:pt-12 md:pb-8 max-w-3xl">
          <p className="label mb-3">The library</p>
          <h1 className="text-4xl md:text-5xl leading-[1.05]">
            Every venue, priced for <em className="text-gold not-italic font-serif italic">your</em> wedding.
          </h1>
          <p className="text-muted mt-4 text-[15px] max-w-2xl">
            Site fees, minimums, per-person packages, service and tax — normalized into one all-in estimate
            you can actually compare. Tap any price to see exactly how we got it.
          </p>
          {error && (
            <div
              className="mt-4 rounded-xl bg-bad/10 text-bad text-sm p-3 flex items-center gap-3"
              role="alert"
            >
              We couldn’t reach the venue library ({error}).{' '}
              <button className="underline" onClick={() => void reload()}>
                Try again
              </button>
            </div>
          )}
        </section>
      }
      emptyState={
        <Empty title="The library is empty">
          Ask an admin to publish venues, or add your own in My Venues.
        </Empty>
      }
    />
  );
}
