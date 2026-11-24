-- Documentazione dello schema già presente sul progetto Supabase.
-- Non eseguire questo file per intero su un database già popolato:
-- la prima parte descrive le tabelle esistenti.
-- La sezione "DA APPLICARE" in fondo è SQL nuovo, da lanciare a mano.

-- contacts: 40 righe, di cui quelle con linkedin_url diventano schede.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  full_name text not null,
  role text,
  contact_group text,
  linkedin_url text unique,
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);

-- team_members: Paolo, Andrea, Membro 3.
-- email è obbligatoria per il magic link. auth_user_id si collega al primo accesso.
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text unique,
  auth_user_id uuid unique references auth.users (id),
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.clicks (
  id bigint generated always as identity primary key,
  team_member_id uuid references public.team_members (id),
  contact_id uuid references public.contacts (id),
  clicked_at timestamptz default now()
);

alter table public.contacts enable row level security;
alter table public.team_members enable row level security;
alter table public.clicks enable row level security;

-- Politiche già attive (anon e authenticated).
-- Dopo che il login funziona si possono togliere i grant ad anon.
create policy contacts_select_active
  on public.contacts
  for select
  to anon, authenticated
  using (active is true);

create policy team_members_select_active
  on public.team_members
  for select
  to anon, authenticated
  using (active is true);

create policy clicks_insert_valid_fks
  on public.clicks
  for insert
  to anon, authenticated
  with check (
    exists (select 1 from public.team_members tm where tm.id = team_member_id)
    and exists (select 1 from public.contacts c where c.id = contact_id)
  );

-- DA APPLICARE
-- Senza queste query la lista funziona, ma non vede i click già fatti
-- e non collega auth.users al team. Il passkey è nativo di Supabase Auth:
-- non serve una tabella credenziali.

create policy clicks_select_authenticated
  on public.clicks
  for select
  to authenticated
  using (true);

create policy team_members_link_self
  on public.team_members
  for update
  to authenticated
  using (
    active is true
    and (auth_user_id is null or auth_user_id = auth.uid())
    and lower(email) = lower(auth.jwt() ->> 'email')
  )
  with check (auth_user_id = auth.uid());

create or replace function public.team_members_link_only()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.active is distinct from old.active
     or new.created_at is distinct from old.created_at
  then
    raise exception 'si può aggiornare solo auth_user_id';
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_link_only on public.team_members;
create trigger team_members_link_only
  before update on public.team_members
  for each row
  execute function public.team_members_link_only();

-- Resta eseguibile da anon anche dopo aver tolto la SELECT pubblica sul team,
-- così il controllo "email nel team" avviene prima di inviare il magic link.
create or replace function public.is_team_email(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members
    where active is true
      and email is not null
      and lower(email) = lower(candidate)
  );
$$;

revoke all on function public.is_team_email(text) from public;
grant execute on function public.is_team_email(text) to anon, authenticated;

-- Realtime sulle nuove aperture. Da lanciare una volta, se la tabella non è già nella publication.
alter publication supabase_realtime add table public.clicks;
