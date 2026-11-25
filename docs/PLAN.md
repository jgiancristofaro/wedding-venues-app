# Vellum — one-page plan

## Architecture
- **Front end**: Vite + React 18 + TypeScript (strict) + Tailwind. `BrowserRouter` with `basename = import.meta.env.BASE_URL`; `404.html` = `index.html` for GitHub Pages deep links.
- **Backend adapter** (`src/backend`): one `Backend` interface, two implementations.
  - `SupabaseBackend` — Postgres + Auth (Google, magic link) + Storage + Edge Functions. Used when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set at build time.
  - `LocalBackend` — "Demo mode": localStorage + IndexedDB, mock sign-in. Used when no Supabase config exists (so the Pages site works on day one) and by the Playwright suite.
- **Pure modules** (no React, unit-tested): `lib/pricing` (engine), `lib/parsing` (spreadsheet, column mapping, text heuristics), `lib/dedupe`, `lib/geo`, `supabase/functions/_shared/aiCore.ts` (AI schema validation + repair).
- **Lazy chunks**: Leaflet map, pdf.js, tesseract.js, mammoth, SheetJS, jsPDF, JSZip.

## Schema (Postgres, `supabase/migrations`)
| table | purpose | RLS |
|---|---|---|
| `app_admins(email)` | admin allow-list | admins read; no client writes |
| `global_venues` | public library (`data jsonb`, `pricing jsonb`, provenance cols, `published`) | anyone reads published; admins read all + write |
| `user_venues` | private library (`data`, `pricing`, `provenance jsonb`, `global_id`, `global_snapshot`, status, rating, tags, `shortlist_rank`, overrides) | owner only |
| `venue_notes` | rich-text notes, pros/cons, pinned | owner only |
| `wedding_profiles` | 1 row per user | owner only |
| `documents` | file metadata, extracted text, page cache path | owner only |
| `import_jobs` | status/progress/errors/results | owner only |
| `compare_sets`, `filter_presets` | saved compare selections and filters | owner only |
| `geocode_cache` | address → lat/lng | public read; writes via Edge Function (service role) |
| `ai_usage`, `ai_cache` | quotas and per-document-hash cache | service role only |
Storage bucket `documents` (private, 25 MB limit, PDF/image/DOCX/XLSX mime types); object path `<uid>/<doc-id>/<filename>`; policies restrict to `auth.uid()` folder.

## Pricing-rule schema (`src/lib/pricing/types.ts`)
`PricingRules = { currency, asOf, seasons{peakMonths, offPeakMonths}, components[], charges{serviceChargePct, adminFeePct, gratuityPct, taxPct, bases…}, hoursIncluded, overtimePerHour }`.
Components: `site_fee`, `fnb_minimum` (includesServiceCharge/includesTax), `per_person` (package with guest-range rates), `capacity_tier`, `buyout` (required/optional, replaces…), `addon` (flat/per-person/per-hour, required/optional, type).
Every amount is a list of `rates` each with an optional `when` (days, months, season, dates, timeSlot, guestMin/Max); the most specific matching rate wins.
Engine returns total, per guest, low–high range, confidence (Complete/Partial/Rough/Unknown), component lines, assumptions, missing pieces.

## Milestones
1. Schema + RLS + storage policies (+ local RLS test harness against real Postgres).
2. Backend adapters + auth (Google, magic link, demo).
3. Pricing engine + 25+ tests.  4. Seed 36 fictional sample venues (+ SQL seed).
5. Discover (gallery / split map / table, filters, presets).  6. My Venues + heart-to-save + global diff.
7. Detail page, notes, documents, provenance, inline edit.  8. Shortlist (dnd + keyboard) and Compare (tray, grid, chart).
9. Spreadsheet import (mapping, dedupe, background job).  10. Document import (pdf.js → OCR → images → heuristics → Review).
11. File-drop-anywhere.  12. AI adapter + flags (off) + Edge Functions.  13. Admin.  14. Exports.  15. Polish, tests, deploy workflow.
