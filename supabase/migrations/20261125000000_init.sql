-- Vellum: initial schema, row-level security, storage.
-- Safe to run on a fresh Supabase project (supabase db push, or paste into the SQL editor).

create extension if not exists pgcrypto;

-- ─────────────────────────── Admins ───────────────────────────
create table if not exists public.app_admins (
  email text primary key check (email = lower(email))
);
alter table public.app_admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

create policy "admins can see admin list" on public.app_admins
  for select to authenticated using (public.is_admin());

-- ─────────────────────────── Helpers ───────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;

-- ─────────────────────────── Global library ───────────────────────────
create table if not exists public.global_venues (
  id text primary key default gen_random_uuid()::text,
  slug text unique,
  name text generated always as (data ->> 'name') stored,
  data jsonb not null,                       -- VenueFields
  pricing jsonb not null default '{"components":[]}'::jsonb,  -- PricingRules
  source text not null,                      -- provenance: where this came from
  source_url text,
  license_note text not null,                -- permission / license note
  pricing_as_of date,
  is_sample boolean not null default false,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint global_name_present check (coalesce(data ->> 'name', '') <> '')
);
create index if not exists global_venues_published_idx on public.global_venues (published);
create trigger global_venues_touch before update on public.global_venues
  for each row execute function public.touch_updated_at();
alter table public.global_venues enable row level security;

create policy "anyone reads published global venues" on public.global_venues
  for select to anon, authenticated using (published or public.is_admin());
create policy "admins insert global venues" on public.global_venues
  for insert to authenticated with check (public.is_admin());
create policy "admins update global venues" on public.global_venues
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete global venues" on public.global_venues
  for delete to authenticated using (public.is_admin());

-- ─────────────────────────── Private library ───────────────────────────
create table if not exists public.user_venues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  global_id text references public.global_venues(id) on delete set null,
  global_snapshot jsonb,                     -- global values as last accepted (for field diffs)
  data jsonb not null,                       -- VenueFields (user's values)
  pricing jsonb not null default '{"components":[]}'::jsonb,
  field_provenance jsonb not null default '{}'::jsonb, -- { field: {source, detail, url, confidence, at} }
  rating smallint check (rating between 0 and 5),
  tags text[] not null default '{}',
  status text not null default 'researching'
    check (status in ('researching','contacted','toured','shortlisted','passed','booked')),
  shortlist_rank integer,
  overrides jsonb,                           -- per-venue pricing assumptions
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_venues_owner_idx on public.user_venues (owner_id);
create unique index if not exists user_venues_owner_global_uidx on public.user_venues (owner_id, global_id) where global_id is not null;
create trigger user_venues_touch before update on public.user_venues
  for each row execute function public.touch_updated_at();
alter table public.user_venues enable row level security;

create policy "owner reads own venues" on public.user_venues
  for select to authenticated using (owner_id = auth.uid());
create policy "owner inserts own venues" on public.user_venues
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owner updates own venues" on public.user_venues
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner deletes own venues" on public.user_venues
  for delete to authenticated using (owner_id = auth.uid());

-- ─────────────────────────── Notes ───────────────────────────
create table if not exists public.venue_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  venue_id uuid not null references public.user_venues(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','pro','con')),
  html text not null default '' check (length(html) <= 50000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venue_notes_owner_idx on public.venue_notes (owner_id, venue_id);
create trigger venue_notes_touch before update on public.venue_notes
  for each row execute function public.touch_updated_at();
alter table public.venue_notes enable row level security;
create policy "owner manages notes" on public.venue_notes
  for all to authenticated using (owner_id = auth.uid()) with check (
    owner_id = auth.uid()
    and exists (select 1 from public.user_venues v where v.id = venue_id and v.owner_id = auth.uid())
  );

-- ─────────────────────────── Wedding profile ───────────────────────────
create table if not exists public.wedding_profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger wedding_profiles_touch before update on public.wedding_profiles
  for each row execute function public.touch_updated_at();
alter table public.wedding_profiles enable row level security;
create policy "owner manages profile" on public.wedding_profiles
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─────────────────────────── Documents ───────────────────────────
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  venue_id uuid references public.user_venues(id) on delete set null,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes <= 26214400),
  sha256 text not null,
  storage_path text not null,
  page_count integer,
  extracted_text jsonb,                      -- string[] per page
  page_images_path text,                     -- storage prefix of cached page renders
  created_at timestamptz not null default now()
);
create index if not exists documents_owner_idx on public.documents (owner_id, venue_id);
alter table public.documents enable row level security;
create policy "owner manages documents" on public.documents
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─────────────────────────── Import jobs ───────────────────────────
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('spreadsheet','document')),
  label text not null default '',
  status text not null default 'queued' check (status in ('queued','running','done','error','cancelled')),
  progress real not null default 0,
  total integer not null default 0,
  processed integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger import_jobs_touch before update on public.import_jobs
  for each row execute function public.touch_updated_at();
alter table public.import_jobs enable row level security;
create policy "owner manages import jobs" on public.import_jobs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─────────────────────────── Saved compare sets & filter presets ───────────────────────────
create table if not exists public.compare_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  venue_refs text[] not null check (array_length(venue_refs, 1) between 1 and 4),
  created_at timestamptz not null default now()
);
alter table public.compare_sets enable row level security;
create policy "owner manages compare sets" on public.compare_sets
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.filter_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  scope text not null check (scope in ('discover','mine')),
  filters jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.filter_presets enable row level security;
create policy "owner manages presets" on public.filter_presets
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─────────────────────────── Geocode cache ───────────────────────────
create table if not exists public.geocode_cache (
  query text primary key,
  lat double precision,
  lng double precision,
  display_name text,
  provider text not null default 'nominatim',
  created_at timestamptz not null default now()
);
alter table public.geocode_cache enable row level security;
create policy "anyone reads geocode cache" on public.geocode_cache for select to anon, authenticated using (true);
-- writes only via the geocode Edge Function (service role bypasses RLS)

-- ─────────────────────────── AI usage & cache (service role only) ───────────────────────────
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  feature text not null check (feature in ('parse','enrich')),
  model text,
  input_tokens integer,
  output_tokens integer,
  cached boolean not null default false,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_day_idx on public.ai_usage (user_id, feature, created_at);
alter table public.ai_usage enable row level security;
create policy "users read own ai usage" on public.ai_usage for select to authenticated using (user_id = auth.uid());

create table if not exists public.ai_cache (
  cache_key text primary key,                -- sha256 of document + schema version
  feature text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.ai_cache enable row level security;
-- no policies: only the service role (Edge Functions) can read/write.

-- ─────────────────────────── Storage ───────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 26214400,
  array[
    'application/pdf','image/png','image/jpeg','image/webp','image/heic','image/gif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel','text/csv','text/plain'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users read own documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users upload own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update own documents" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────── Account deletion helper ───────────────────────────
-- Deleting the auth user cascades to every owned row above. Storage objects are removed by the
-- delete-account Edge Function before it deletes the user.
