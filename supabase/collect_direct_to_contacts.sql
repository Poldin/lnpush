-- Apply in the Supabase SQL editor. Safe to run more than once.
-- /collect inserts and deletes public.contacts with the signed-in member's session.
-- Requires public.is_active_team_member() from supabase/collector_companies.sql.
-- Does not write profile_candidates. The local collector script is unchanged.
-- Active team members can already SELECT active contacts (contacts_select_active).
-- They cannot INSERT or DELETE: the only insert policy is contacts_insert_collector_admin.

drop policy if exists contacts_insert_active_team on public.contacts;
create policy contacts_insert_active_team
  on public.contacts
  for insert
  to authenticated
  with check (public.is_active_team_member());

drop policy if exists contacts_delete_active_team on public.contacts;
create policy contacts_delete_active_team
  on public.contacts
  for delete
  to authenticated
  using (public.is_active_team_member());

grant insert, delete on table public.contacts to authenticated;
