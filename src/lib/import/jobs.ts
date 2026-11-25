/**
 * Background spreadsheet import. Runs outside React so the user can keep browsing;
 * progress is mirrored to the store (banner) and persisted as an import_jobs row.
 */
import { backend } from '../../backend';
import type { GlobalVenue, ImportJob, SourceInfo, UserVenue, VenueFields } from '../../domain/types';
import { blankUserVenue, copyGlobalToMine } from '../../domain/venues';
import type { PricingRules } from '../pricing/types';
import { useApp } from '../../store/app';

export interface PlannedRow {
  rowNumber: number;
  action: 'create' | 'link' | 'merge' | 'skip';
  targetRef?: string; // g:<id> for link, u:<id> for merge
  fields: VenueFields;
  pricing: PricingRules;
  notes: string[];
  status?: UserVenue['status'];
  rating?: number;
  tags: string[];
  confidence: number;
}

const iso = () => new Date().toISOString();

export function runSpreadsheetImport(opts: {
  label: string;
  sheet: string;
  rows: PlannedRow[];
  target: 'mine' | 'global';
  provenance?: SourceInfo;
}): string {
  const store = useApp.getState();
  const user = store.user!;
  const job: ImportJob = {
    id: crypto.randomUUID(),
    ownerId: user.id,
    kind: 'spreadsheet',
    label: opts.label,
    status: 'running',
    progress: 0,
    total: opts.rows.filter((r) => r.action !== 'skip').length,
    processed: 0,
    errors: [],
    results: {
      created: 0,
      linked: 0,
      updated: 0,
      skipped: opts.rows.filter((r) => r.action === 'skip').length,
      venueIds: [],
    },
    createdAt: iso(),
    updatedAt: iso(),
  };
  const update = (patch: Partial<ImportJob>) => {
    Object.assign(job, patch, { updatedAt: iso() });
    useApp.getState().upsertJob({ ...job });
  };
  update({});
  void backend.saveJob(job).catch(() => undefined);

  void (async () => {
    const toGeocode: UserVenue[] = [];
    for (const r of opts.rows) {
      if (r.action === 'skip') continue;
      try {
        const prov = {
          source: 'spreadsheet' as const,
          detail: `${opts.label} · ${opts.sheet} row ${r.rowNumber}`,
          confidence: r.confidence,
          at: iso(),
        };
        if (opts.target === 'global') {
          const g: GlobalVenue = {
            id: '',
            fields: r.fields,
            pricing: r.pricing,
            provenance: opts.provenance!,
            isSample: false,
            published: false,
            createdAt: iso(),
            updatedAt: iso(),
          };
          await backend.saveGlobal({ ...g, id: crypto.randomUUID() });
          job.results.created++;
        } else if (r.action === 'link' && r.targetRef?.startsWith('g:')) {
          const s = useApp.getState();
          const g = s.globals.find((x) => `g:${x.id}` === r.targetRef);
          const existing = s.mine.find((m) => m.globalId === g?.id);
          if (g && !existing) {
            const v = copyGlobalToMine(g, user.id);
            v.status = r.status ?? v.status;
            v.rating = r.rating;
            v.tags = r.tags;
            await s.saveVenue(v);
            await addNotes(v.id, r.notes);
            job.results.linked++;
            job.results.venueIds.push(v.id);
          } else job.results.skipped++;
        } else if (r.action === 'merge' && r.targetRef?.startsWith('u:')) {
          const s = useApp.getState();
          const m = s.mine.find((x) => `u:${x.id}` === r.targetRef);
          if (m) {
            const fields = { ...m.fields };
            const provenance = { ...m.provenance };
            for (const [k, val] of Object.entries(r.fields)) {
              const cur = (fields as Record<string, unknown>)[k];
              if (val != null && val !== '' && (cur == null || cur === '')) {
                (fields as Record<string, unknown>)[k] = val;
                (provenance as Record<string, unknown>)[k] = prov;
              }
            }
            const pricing = m.pricing.components.length ? m.pricing : r.pricing;
            await s.saveVenue({
              ...m,
              fields,
              pricing,
              provenance,
              tags: [...new Set([...m.tags, ...r.tags])],
            });
            await addNotes(m.id, r.notes);
            job.results.updated++;
            job.results.venueIds.push(m.id);
          }
        } else {
          const v = blankUserVenue(user.id, r.fields);
          v.pricing = r.pricing;
          for (const k of Object.keys(r.fields)) (v.provenance as Record<string, unknown>)[k] = prov;
          if (r.pricing.components.length) v.provenance.pricing = prov;
          v.status = r.status ?? 'researching';
          if (v.status === 'shortlisted')
            v.shortlistRank = Math.max(0, ...useApp.getState().mine.map((x) => x.shortlistRank ?? 0)) + 1;
          v.rating = r.rating;
          v.tags = r.tags;
          await useApp.getState().saveVenue(v);
          await addNotes(v.id, r.notes);
          job.results.created++;
          job.results.venueIds.push(v.id);
          if (v.fields.lat == null && (v.fields.address || v.fields.area)) toGeocode.push(v);
        }
      } catch (e) {
        job.errors.push(`Row ${r.rowNumber}: ${(e as Error).message}`);
      }
      job.processed++;
      update({ progress: job.processed / Math.max(1, job.total) });
      await new Promise((res) => setTimeout(res, 0));
    }
    update({
      status:
        job.errors.length && !job.results.venueIds.length && opts.target !== 'global' ? 'error' : 'done',
      progress: 1,
    });
    void backend.saveJob(job).catch(() => undefined);
    const st = useApp.getState();
    st.toast(
      {
        text: `Import finished: ${job.results.created} created, ${job.results.linked} linked to the library, ${job.results.updated} updated${job.errors.length ? `, ${job.errors.length} errors` : ''}.`,
        tone: job.errors.length ? 'error' : 'success',
        action:
          opts.target === 'mine'
            ? {
                label: 'View',
                run: () => window.dispatchEvent(new CustomEvent('vellum:navigate', { detail: '/mine' })),
              }
            : undefined,
      },
      9000,
    );
    if (opts.target === 'global') void st.reloadGlobals();
    // Geocode afterwards (≤1 request/second, cached)
    let failed = 0;
    for (const v of toGeocode) {
      const q = [v.fields.address, v.fields.area, v.fields.region].filter(Boolean).join(', ');
      try {
        const r = await backend.geocode(q);
        const cur = useApp.getState().mine.find((m) => m.id === v.id);
        if (r && cur && cur.fields.lat == null) {
          await useApp
            .getState()
            .saveVenue({
              ...cur,
              fields: { ...cur.fields, lat: r.lat, lng: r.lng },
              provenance: {
                ...cur.provenance,
                lat: { source: 'geocoder', detail: `Located from “${q}”`, at: iso() },
                lng: { source: 'geocoder', detail: `Located from “${q}”`, at: iso() },
              },
            });
        } else if (!r) failed++;
      } catch {
        failed++;
      }
    }
    if (failed)
      st.toast(
        {
          text: `${failed} venue${failed > 1 ? 's' : ''} couldn’t be placed on the map. Add an address to fix it.`,
        },
        7000,
      );
  })();
  return job.id;

  async function addNotes(venueId: string, notes: string[]) {
    for (const n of notes) {
      await useApp.getState().saveNote({
        id: crypto.randomUUID(),
        ownerId: user.id,
        venueId,
        kind: 'note',
        html: `<p>${n.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p><p><em>Imported from ${opts.label.replace(/</g, '&lt;')}</em></p>`,
        pinned: false,
        createdAt: iso(),
        updatedAt: iso(),
      });
    }
  }
}
