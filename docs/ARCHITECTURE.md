# Architecture

```
            ┌──────────────── React UI (pages/, components/) ────────────────┐
            │ Discover · My Venues · Detail · Shortlist · Compare · Import    │
            └───────────────┬───────────────────────────────┬────────────────┘
                     store/app.ts (zustand)           domain/ (view models,
                            │                          filtering, global diff)
            ┌───────────────┴──────────────┐                │
            │ backend/ Backend interface   │      pure libs: lib/pricing, lib/parsing,
            │  ├─ supabase.ts (cloud)      │      lib/dedupe, lib/geo, lib/export,
            │  └─ local.ts   (demo)        │      supabase/functions/_shared/aiCore.ts
            └───────────────┬──────────────┘
      Supabase: Postgres+RLS · Auth · Storage(documents) · Edge Functions(ai, geocode,
                fetch-document, delete-account, ingest)
```

## Modules

| Module                                 | Responsibility                                                                                                                                                         | Tests                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `lib/pricing`                          | Rule types, `estimate()` engine (scenario evaluation, minimum-spend logic, charges/tax bases, ranges via equivalence-class enumeration, confidence), `sanitizePricing` | 37 scenarios                             |
| `lib/parsing/textHeuristics`           | Regex/keyword extraction of fields + pricing rules with page/snippet/confidence                                                                                        | primitives, free text, 3 PDF booklets    |
| `lib/parsing/spreadsheet`, `columnMap` | Header-row detection, merged cells, blank/section rows; fuzzy mapping (synonyms + Dice + content hints); row → venue                                                   | 2 messy XLSX + CSV                       |
| `lib/parsing/documentPipeline`         | pdf.js text → OCR fallback (tesseract.js, lazy) → embedded image extraction → heuristics; DOCX via mammoth                                                             | e2e                                      |
| `lib/dedupe`                           | Name normalization, Jaro-Winkler + token-set, location/website signals                                                                                                 | 8                                        |
| `lib/import/jobs`                      | Background spreadsheet import, progress, geocoding afterwards                                                                                                          | e2e                                      |
| `lib/export`                           | XLSX/CSV, compare-report & one-pager PDFs, JSON/ZIP backup                                                                                                             | e2e                                      |
| `backend/*`                            | Persistence + auth + services behind one interface; offline outbox & read cache (cloud)                                                                                | e2e (demo), RLS SQL tests (cloud schema) |
| `supabase/functions/_shared/aiCore`    | JSON schemas, validator, repair retry, prompts, quotas                                                                                                                 | 8 (mocked model)                         |

## Data flow for a price

`WeddingProfile` + per-venue `PricingOverrides` → `contextFromProfile` → `estimate(rules, ctx)` → `Estimate { total, perGuest, low, high, confidence, lines, assumptions, missing, byCategory }`. Results are memoized per venue/version/profile, so 2,000 cards price in well under a second.

## Security model

- Only the publishable anon key ships to the browser. Service role and AI keys exist only as Edge Function secrets.
- RLS: private tables are `owner_id = auth.uid()` for all operations (notes additionally require the parent venue to be owned by the caller); `global_venues` is public-read for published rows, admin-only writes (`is_admin()` reads `app_admins` with `security definer`); `ai_usage`/`ai_cache`/`geocode_cache` writes are service-role only.
- Storage bucket `documents` is private, 25 MB limit, allowed MIME list, objects scoped to `<uid>/…`.
- `fetch-document` blocks private/loopback hosts (basic SSRF protection) and caps size.
- Notes are sanitized with DOMPurify on save and render.

## Performance

Lazy chunks for every route plus Leaflet, pdf.js (+worker), tesseract.js, mammoth, SheetJS, jsPDF, JSZip. Gallery renders progressively (36 at a time via IntersectionObserver); the table paginates; the map switches to canvas circle markers above 250 points. Measured with `?stress=2000` at 4× CPU throttle: first render ≈2.3 s, search ≈140 ms.
