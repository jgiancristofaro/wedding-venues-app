-- Signed-out visitors never need is_admin(); split the library read policy per role.
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;
drop policy if exists "anyone reads published global venues" on public.global_venues;
create policy "anon reads published global venues" on public.global_venues
  for select to anon using (published);
create policy "users read published or admin reads all" on public.global_venues
  for select to authenticated using (published or public.is_admin());
