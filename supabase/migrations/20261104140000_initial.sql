-- Haus Dassow Shopping Center · gemeinsame Einkaufsliste
-- In Supabase > SQL Editor einmal ausfuehren.
-- Sicherheitsmodell: eingeloggte Haushaltsmitglieder sehen/bearbeiten nur ihren Haushalt.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Unser Haus' check (char_length(name) between 1 and 100),
  owner_id uuid not null references auth.users(id) on delete cascade,
  budget numeric(12,2) not null default 12000 check (budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_idx on public.household_members(user_id);

create table if not exists public.shopping_items (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 170),
  description text not null default '' check (char_length(description) <= 300),
  price numeric(12,2) not null default 0 check (price >= 0),
  quantity integer not null default 1 check (quantity between 1 and 9999),
  room text not null default 'Wohnzimmer' check (char_length(room) <= 100),
  retailer text not null default '' check (char_length(retailer) <= 100),
  phase text not null default 'Einzug' check(phase in ('Einzug','Später','Prüfen','Projekt')),
  status text not null default 'Wunschliste' check(status in ('Wunschliste','Bestellt','Gekauft')),
  url text not null default '' check (char_length(url) <= 3000),
  image text not null default '' check (char_length(image) <= 400000),
  note text not null default '' check (char_length(note) <= 3000),
  direct_link boolean not null default true,
  source text not null default '',
  origin text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(household_id,id)
);
create index if not exists shopping_items_household_position_idx on public.shopping_items(household_id,position);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  uses integer not null default 0,
  max_uses integer not null default 1 check(max_uses between 1 and 10)
);
create index if not exists household_invites_household_idx on public.household_invites(household_id);

-- Helper muss die Membership lesen koennen, ohne zirkulaere RLS-Auswertung.
create or replace function public.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.create_household(p_name text default 'Haus Dassow')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_house uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Bitte anmelden.'; end if;
  if exists (select 1 from public.household_members where user_id=v_uid) then
    raise exception 'Du bist bereits einem Haushalt zugeordnet.';
  end if;
  insert into public.households(name,owner_id) values (left(coalesce(nullif(trim(p_name),''),'Haus Dassow'),100),v_uid)
    returning id into v_house;
  insert into public.household_members(household_id,user_id,role) values (v_house,v_uid,'owner');
  return v_house;
end;
$$;

create or replace function public.create_household_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_house uuid; v_code text;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Bitte anmelden.'; end if;
  select household_id into v_house from public.household_members
   where user_id=v_uid and role='owner';
  if v_house is null then raise exception 'Nur die Haushaltsverwaltung kann einladen.'; end if;
  v_code := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.household_invites(household_id,token_hash,created_by,expires_at,max_uses)
  values (v_house,encode(extensions.digest(v_code,'sha256'),'hex'),v_uid,now()+interval '7 days',1);
  return v_code;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_invite public.household_invites%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Bitte anmelden.'; end if;
  if exists(select 1 from public.household_members where user_id=v_uid) then
    raise exception 'Dieses Konto gehoert bereits zu einem Haushalt.';
  end if;
  if p_code is null or p_code !~ '^[0-9a-f]{48}$' then
    raise exception 'Ungueltiger oder abgelaufener Einladungscode.';
  end if;
  select * into v_invite from public.household_invites
   where token_hash=encode(extensions.digest(p_code,'sha256'),'hex')
     and expires_at>now() and uses<max_uses
   for update;
  if v_invite.id is null then raise exception 'Ungueltiger oder abgelaufener Einladungscode.'; end if;
  insert into public.household_members(household_id,user_id,role)
    values (v_invite.household_id,v_uid,'member');
  update public.household_invites set uses=uses+1 where id=v_invite.id;
  return v_invite.household_id;
end;
$$;

-- RLS + minimale Grants. Keine Anon-Rechte; Service-role nie in den Browser.
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_items enable row level security;
alter table public.household_invites enable row level security;
revoke all on table public.households,public.household_members,public.shopping_items,public.household_invites from anon,authenticated;
grant select on public.households,public.household_members,public.shopping_items to authenticated;
grant insert,update,delete on public.shopping_items to authenticated;
grant update(name,budget) on public.households to authenticated;
-- Keine direkten Schreibrechte auf Mitgliedschaften oder Einladungen.

create policy households_read on public.households for select to authenticated
  using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));
create policy members_read on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
create policy items_read on public.shopping_items for select to authenticated
  using (public.is_household_member(household_id));
create policy items_insert on public.shopping_items for insert to authenticated
  with check (public.is_household_member(household_id));
create policy items_update on public.shopping_items for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy items_delete on public.shopping_items for delete to authenticated
  using (public.is_household_member(household_id));

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.create_household(text) from public;
revoke all on function public.create_household_invite() from public;
revoke all on function public.join_household(text) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- Optional: live-Updates zwischen euren Geraeten via Postgres Changes.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shopping_items') then
      alter publication supabase_realtime add table public.shopping_items;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='households') then
      alter publication supabase_realtime add table public.households;
    end if;
  end if;
end $$;
-- WICHTIG: Nach dem Schema die RLS-Deny-Tests in der Anleitung abarbeiten.