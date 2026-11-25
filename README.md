# Vellum — wedding venue research, priced for your wedding

A private, photo-forward venue library that normalizes every venue's pricing — site fees, F&B minimums, per-person packages, capacity tiers, buyouts, service charges, seasonal and day-of-week rates — into an apples-to-apples **estimated all-in total** for your guest count and date, with a confidence level and a "How we got this" breakdown everywhere a price appears.

> The site works immediately in **Demo mode** (everything stored in your browser, simulated sign-in). Connect Supabase to get real accounts and cloud sync.

---

## ✅ Manual-action checklist

**Get it live on GitHub Pages (Demo mode — ~2 minutes)**

1. Merge branch `claude/nice-allen-iwgheo` into `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The **Deploy to GitHub Pages** workflow runs on push to `main` (or run it from the Actions tab). Site: `https://jgiancristofaro.github.io/wedding-venues-app/`.

**Turn on cloud accounts and sync (Supabase free tier — ~15 minutes)**

4. Create a project at [supabase.com](https://supabase.com) → note the **Project URL**, **anon (publishable) key** and **project ref** (Settings → API).
5. Apply the schema + sample library: either run the **Deploy Supabase** workflow (step 9 secrets needed), or paste `supabase/migrations/20261125000000_init.sql` then `supabase/seed.sql` into the SQL editor.
6. Make yourself admin (SQL editor): `insert into public.app_admins (email) values ('you@example.com');`
7. **Auth → URL Configuration**: Site URL `https://jgiancristofaro.github.io/wedding-venues-app/`; add Redirect URLs `https://jgiancristofaro.github.io/wedding-venues-app/**` and `http://localhost:5173/**`.
8. **Auth → Providers**: Email (magic link) is on by default. For Google: create an OAuth client in Google Cloud Console (type _Web_, authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`), paste the client ID/secret into the Google provider and enable it.
9. GitHub repo **Settings → Secrets and variables → Actions**:
   - **Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable), optional `VITE_ADMIN_EMAILS` (UI hint only).
   - **Secrets** (only for the Supabase workflow): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
10. Run **Deploy Supabase** (deploys Edge Functions), then re-run **Deploy to GitHub Pages**.
11. Edge Function secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`): `ADMIN_EMAILS=you@example.com`, `ALLOWED_ORIGINS=https://jgiancristofaro.github.io`, optional `GEOCODER_USER_AGENT="Vellum (contact: you@example.com)"`.

**Optional: AI features** — see [Enabling AI](#enabling-ai-parsing-and-magic-fill). Both are **off** by default and the app is fully functional without them.

---

## Local development (one command)

```bash
npm install && npm run dev
```

Opens on http://localhost:5173 in Demo mode. To use your Supabase project locally, copy `.env.example` to `.env.local` and fill in the two `VITE_SUPABASE_*` values.

| Command                           | What it does                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server                                                                  |
| `npm run build`                   | Typecheck + production build (+ `404.html` SPA fallback)                         |
| `npm test`                        | 72 unit tests (pricing engine, parsers, dedupe, AI core with mocked model)       |
| `npm run test:e2e`                | 13 Playwright smoke tests (Demo mode, desktop + 375px)                           |
| `npm run test:rls`                | Applies migrations + seed to a throwaway local Postgres and asserts RLS policies |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                |
| `npm run fixtures`                | Regenerates the synthetic PDF/XLSX fixtures                                      |
| `npm run seed:sql`                | Regenerates `supabase/seed.sql` from `src/data/seedVenues.ts`                    |

Demo-mode tips: any email signs you in; `admin@demo.vellum` gets the Admin page. `?stress=2000` loads 2,000 synthetic library venues for performance testing.

## Enabling AI parsing and Magic Fill

The Anthropic API key lives **only** as an Edge Function secret — never in the repo, the build or Pages.

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
supabase secrets set AI_PARSING_ENABLED=true AI_ENRICH_ENABLED=true --project-ref <ref>
```

Optional: `AI_MODEL` (default `claude-opus-5-5`), `AI_PROVIDER` (default `anthropic`), `AI_DAILY_PARSE_LIMIT` (20), `AI_DAILY_ENRICH_LIMIT` (30), `AI_MAX_PAGES` (30). Reload the site: the "Read with AI" and "Magic Fill" buttons become active. Turn either off by setting its flag to `false`. Usage is logged in `ai_usage`; parse results are cached by document hash in `ai_cache`. Server-side refusal fallback is enabled on AI requests.

## Repository structure

```
src/
  lib/pricing/      pure pricing engine + 37 test scenarios
  lib/parsing/      spreadsheet reader, column mapping, text/PDF heuristics, document pipeline
  lib/import/       background spreadsheet import job
  lib/export/       XLSX/CSV, PDF reports, JSON/ZIP backup
  lib/dedupe.ts     duplicate matching    lib/geo.ts  distance + cached, throttled geocoding
  lib/images.ts     generated (license-free) illustration "photos"
  backend/          Backend interface → supabase.ts (cloud) | local.ts (demo)
  domain/           types, field registry, view models, filtering, global-diff
  store/app.ts      zustand app state      components/ pages/   UI
supabase/
  migrations/       schema + RLS + storage policies      seed.sql  38 fictional sample venues
  functions/        ai, geocode, fetch-document, delete-account, ingest (+ _shared AI core)
  tests/            RLS assertions + stubs for plain Postgres
tests/e2e/          Playwright      tests/fixtures/  synthetic booklets + messy spreadsheets
docs/               PLAN.md, ARCHITECTURE.md, DECISIONS.md
```

## Sample data

All 38 library venues are **fictional** ("Sample data" badges everywhere, including PDFs and exports). Their names, contacts and prices are invented; coordinates are approximate town centers. Photos are procedurally generated illustrations, clearly labeled.
