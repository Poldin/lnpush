-- Apply once in the Supabase SQL editor. Do not run schema.sql again.
-- Run supabase/profile_candidates.sql first if profile_candidates does not exist yet.
-- Manual company queue for /collect. Active team members can read and write it.
-- The same members can insert pending profile_candidates from a Google results paste.
-- The collector service role still bypasses RLS. Paolo's review updates are unchanged.

create table if not exists public.collector_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'pending' check (status in ('pending', 'done')),
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists collector_companies_name_lower_idx
  on public.collector_companies (lower(name));

create index if not exists collector_companies_status_created_idx
  on public.collector_companies (status, created_at);

alter table public.collector_companies enable row level security;

create or replace function public.is_active_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.active is true
      and (
        tm.auth_user_id = auth.uid()
        or (
          tm.email is not null
          and lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

revoke all on function public.is_active_team_member() from public;
grant execute on function public.is_active_team_member() to authenticated;

drop policy if exists collector_companies_select on public.collector_companies;
create policy collector_companies_select
  on public.collector_companies
  for select
  to authenticated
  using (public.is_active_team_member());

drop policy if exists collector_companies_insert on public.collector_companies;
create policy collector_companies_insert
  on public.collector_companies
  for insert
  to authenticated
  with check (public.is_active_team_member());

drop policy if exists collector_companies_update on public.collector_companies;
create policy collector_companies_update
  on public.collector_companies
  for update
  to authenticated
  using (public.is_active_team_member())
  with check (public.is_active_team_member());

drop policy if exists collector_companies_delete on public.collector_companies;
create policy collector_companies_delete
  on public.collector_companies
  for delete
  to authenticated
  using (public.is_active_team_member());

revoke all on table public.collector_companies from public, anon;
grant select, insert, update, delete on table public.collector_companies to authenticated;

-- /collect saves with the signed-in member's session, the same way /review reads candidates.
drop policy if exists profile_candidates_team_select on public.profile_candidates;
create policy profile_candidates_team_select
  on public.profile_candidates
  for select
  to authenticated
  using (public.is_active_team_member());

drop policy if exists profile_candidates_team_insert on public.profile_candidates;
create policy profile_candidates_team_insert
  on public.profile_candidates
  for insert
  to authenticated
  with check (
    public.is_active_team_member()
    and status = 'pending'
  );

grant select, insert on table public.profile_candidates to authenticated;
