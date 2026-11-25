-- Apply once in the Supabase SQL editor. Do not run schema.sql again.
-- Authenticated members can read forced weeks. They cannot insert or update.
-- Paolo edits rows from the SQL editor or the table editor (those bypass RLS).

create table if not exists public.hot_weeks (
  week_start date primary key,
  company text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.hot_weeks enable row level security;

drop policy if exists hot_weeks_select_authenticated on public.hot_weeks;
create policy hot_weeks_select_authenticated
  on public.hot_weeks
  for select
  to authenticated
  using (true);

revoke all on table public.hot_weeks from public;
revoke all on table public.hot_weeks from anon;
grant select on table public.hot_weeks to authenticated;
