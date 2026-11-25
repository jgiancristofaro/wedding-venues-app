-- RLS assertions. Run via scripts/test-rls.sh (plain Postgres + stubs) — fails loudly on any violation.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com');
insert into public.app_admins values ('admin@example.com');
insert into public.global_venues (id, data, source, license_note, published)
  values ('pub', '{"name":"Published"}', 'test', 'test', true), ('draft', '{"name":"Draft"}', 'test', 'test', false);

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'RLS TEST FAILED: %', msg; end if; raise notice 'ok - %', msg; end $$;

-- Anonymous visitor
set role anon;
select pg_temp.check((select count(*) from public.global_venues where id in ('pub','draft')) = 1, 'anon sees only published global venues');
select pg_temp.check((select count(*) from public.user_venues) = 0, 'anon sees no private venues');
reset role;

-- Alice creates private data
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'alice@example.com');
insert into public.user_venues (id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', '{"name":"Alice private"}');
insert into public.venue_notes (venue_id, html) values ('aaaaaaaa-0000-0000-0000-000000000001', '<p>secret</p>');
insert into public.wedding_profiles (data) values ('{"guestCount":120}');
insert into storage.objects (bucket_id, name) values ('documents', '11111111-1111-1111-1111-111111111111/doc/a.pdf');
select pg_temp.check((select count(*) from public.user_venues) = 1, 'alice reads her venue');
select pg_temp.check((select count(*) from public.global_venues where id in ('pub','draft')) = 1, 'non-admin cannot see unpublished global');
do $$ begin
  begin insert into public.global_venues (data, source, license_note) values ('{"name":"x"}','x','x');
    raise exception 'RLS TEST FAILED: non-admin inserted a global venue';
  exception when insufficient_privilege then raise notice 'ok - non-admin cannot write global venues'; end;
end $$;
do $$ begin
  begin insert into public.user_venues (owner_id, data) values ('22222222-2222-2222-2222-222222222222', '{"name":"forged"}');
    raise exception 'RLS TEST FAILED: alice inserted a row owned by bob';
  exception when insufficient_privilege then raise notice 'ok - cannot insert rows for another owner'; end;
end $$;
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('documents', '22222222-2222-2222-2222-222222222222/x.pdf');
    raise exception 'RLS TEST FAILED: alice uploaded into bob''s folder';
  exception when insufficient_privilege then raise notice 'ok - cannot upload into another user''s folder'; end;
end $$;
reset role;

-- Bob must see none of Alice's data
select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'bob@example.com');
select pg_temp.check((select count(*) from public.user_venues) = 0, 'bob cannot read alice''s venues');
select pg_temp.check((select count(*) from public.venue_notes) = 0, 'bob cannot read alice''s notes');
select pg_temp.check((select count(*) from public.wedding_profiles) = 0, 'bob cannot read alice''s profile');
select pg_temp.check((select count(*) from storage.objects) = 0, 'bob cannot list alice''s documents');
update public.user_venues set data = '{"name":"hacked"}' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.user_venues where id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  begin insert into public.venue_notes (owner_id, venue_id, html) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'x');
    raise exception 'RLS TEST FAILED: bob attached a note to alice''s venue';
  exception when insufficient_privilege then raise notice 'ok - cannot attach notes to another user''s venue'; end;
end $$;
reset role;
select pg_temp.check((select data->>'name' from public.user_venues where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Alice private', 'bob''s update/delete had no effect');

-- Admin
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'admin@example.com');
select pg_temp.check((select count(*) from public.global_venues where id in ('pub','draft')) = 2, 'admin sees unpublished global venues');
insert into public.global_venues (data, source, license_note) values ('{"name":"New"}', 'admin', 'ok');
update public.global_venues set published = true where id = 'draft';
select pg_temp.check((select count(*) from public.user_venues) = 0, 'admin cannot read users'' private venues');
reset role;
\echo 'ALL RLS TESTS PASSED'
