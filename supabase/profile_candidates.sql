-- Applica una volta nell'editor SQL di Supabase. Non rieseguire schema.sql.
-- Il collector (service role) inserisce i candidati. Paolo li approva da /review.
-- reviewed_by è auth.uid() di chi approva o rifiuta. Nessuna foreign key verso auth.users.

create table if not exists public.profile_candidates (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  full_name text,
  headline text,
  linkedin_url text unique not null,
  snippet text,
  source_query text,
  rank int,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create table if not exists public.collector_runs (
  company text primary key,
  last_run_at timestamptz,
  found int
);

create index if not exists profile_candidates_pending_company
  on public.profile_candidates (company, rank)
  where status = 'pending';

alter table public.profile_candidates enable row level security;
alter table public.collector_runs enable row level security;

create or replace function public.is_collector_admin()
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
        lower(tm.email) = 'oloapiccoli@gmail.com'
        or lower(tm.name) = 'paolo'
      )
      and (
        tm.auth_user_id = auth.uid()
        or (
          tm.email is not null
          and lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

revoke all on function public.is_collector_admin() from public;
grant execute on function public.is_collector_admin() to authenticated;

drop policy if exists profile_candidates_admin_select on public.profile_candidates;
create policy profile_candidates_admin_select
  on public.profile_candidates
  for select
  to authenticated
  using (public.is_collector_admin());

drop policy if exists profile_candidates_admin_update on public.profile_candidates;
create policy profile_candidates_admin_update
  on public.profile_candidates
  for update
  to authenticated
  using (public.is_collector_admin())
  with check (public.is_collector_admin());

drop policy if exists collector_runs_admin_select on public.collector_runs;
create policy collector_runs_admin_select
  on public.collector_runs
  for select
  to authenticated
  using (public.is_collector_admin());

drop policy if exists contacts_insert_collector_admin on public.contacts;
create policy contacts_insert_collector_admin
  on public.contacts
  for insert
  to authenticated
  with check (public.is_collector_admin());

revoke all on table public.profile_candidates from public, anon;
revoke all on table public.collector_runs from public, anon;
grant select, update on table public.profile_candidates to authenticated;
grant select on table public.collector_runs to authenticated;
grant insert on table public.contacts to authenticated;

create or replace function public.profile_candidates_review_only()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.company is distinct from old.company
     or new.full_name is distinct from old.full_name
     or new.headline is distinct from old.headline
     or new.linkedin_url is distinct from old.linkedin_url
     or new.snippet is distinct from old.snippet
     or new.source_query is distinct from old.source_query
     or new.rank is distinct from old.rank
     or new.created_at is distinct from old.created_at
  then
    raise exception 'si possono aggiornare solo status, reviewed_at e reviewed_by';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_candidates_review_only on public.profile_candidates;
create trigger profile_candidates_review_only
  before update on public.profile_candidates
  for each row
  execute function public.profile_candidates_review_only();
