-- Haus Dassow Shopping Center
-- Frische Supabase-Projekte: diese versionierte Migration über CLI oder SQL Editor anwenden.
-- Private Daten sind ausschließlich für authentifizierte Mitglieder desselben Haushalts sichtbar.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.households (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null default 'Haus Dassow' check (char_length(name) between 1 and 100),
  owner_id uuid not null references auth.users(id) on delete cascade,
  budget_cents bigint not null default 1200000 check (budget_cents between 0 and 999999999999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members(user_id);

create table public.shopping_items (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 170),
  description text not null default '' check (char_length(description) <= 500),
  price_cents bigint not null default 0 check (price_cents between 0 and 999999999999),
  quantity integer not null default 1 check (quantity between 1 and 9999),
  room text not null default 'Sonstiges' check (char_length(room) between 1 and 100),
  retailer text not null default '' check (char_length(retailer) <= 100),
  priority text not null default 'Einzug' check (priority in ('Einzug', 'Später', 'Prüfen', 'Projekt')),
  status text not null default 'Wunschliste' check (status in ('Wunschliste', 'Bestellt', 'Gekauft')),
  url text not null default '' check (char_length(url) <= 3000 and (url = '' or url ~* '^https?://')),
  image_path text check (image_path is null or char_length(image_path) <= 1000),
  note text not null default '' check (char_length(note) <= 3000),
  source text not null default '' check (char_length(source) <= 100),
  origin text not null default '' check (char_length(origin) <= 100),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (household_id, id)
);
create index shopping_items_household_position_idx on public.shopping_items(household_id, position);

create table public.household_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at)
);
create index household_invites_household_idx on public.household_invites(household_id);

-- SECURITY DEFINER verhindert zirkuläre RLS-Prüfungen. search_path ist absichtlich leer.
create or replace function public.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_member_path(p_household_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id::text = p_household_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.create_household(p_name text default 'Haus Dassow')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_household uuid;
begin
  if v_uid is null then raise exception 'Bitte anmelden.'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'Dieses Konto gehört bereits zu einem Haushalt.';
  end if;
  insert into public.households(name, owner_id)
  values (left(coalesce(nullif(trim(p_name), ''), 'Haus Dassow'), 100), v_uid)
  returning id into v_household;
  insert into public.household_members(household_id, user_id, role) values (v_household, v_uid, 'owner');
  return v_household;
end;
$$;

create or replace function public.create_household_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_household uuid; v_code text;
begin
  if v_uid is null then raise exception 'Bitte anmelden.'; end if;
  select household_id into v_household from public.household_members where user_id = v_uid and role = 'owner';
  if v_household is null then raise exception 'Nur die Haushaltsverwaltung kann einladen.'; end if;
  delete from public.household_invites where household_id = v_household and created_by = v_uid;
  v_code := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.household_invites(household_id, token_hash, created_by, expires_at)
  values (v_household, extensions.digest(v_code, 'sha256'), v_uid, now() + interval '48 hours');
  return v_code;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_invite public.household_invites%rowtype;
begin
  if v_uid is null then raise exception 'Bitte anmelden.'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'Dieses Konto gehört bereits zu einem Haushalt.';
  end if;
  if p_code is null or p_code !~ '^[0-9a-fA-F]{48}$' then
    raise exception 'Ungültiger oder abgelaufener Einladungscode.';
  end if;
  select * into v_invite from public.household_invites
  where token_hash = extensions.digest(lower(p_code), 'sha256') and expires_at > now() for update;
  if v_invite.id is null then raise exception 'Ungültiger oder abgelaufener Einladungscode.'; end if;
  insert into public.household_members(household_id, user_id, role) values (v_invite.household_id, v_uid, 'member');
  delete from public.household_invites where id = v_invite.id;
  return v_invite.household_id;
end;
$$;

create or replace function public.set_updated_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'shopping_items' then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;
create trigger households_set_updated before update on public.households for each row execute function public.set_updated_fields();
create trigger shopping_items_set_updated before insert or update on public.shopping_items for each row execute function public.set_updated_fields();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_items enable row level security;
alter table public.household_invites enable row level security;
revoke all on table public.households, public.household_members, public.shopping_items, public.household_invites from anon, authenticated;
grant select on table public.households, public.household_members, public.shopping_items to authenticated;
grant insert, update, delete on table public.shopping_items to authenticated;
grant update(name, budget_cents) on table public.households to authenticated;

create policy households_select on public.households for select to authenticated using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));
create policy members_select on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy items_select on public.shopping_items for select to authenticated using (public.is_household_member(household_id));
create policy items_insert on public.shopping_items for insert to authenticated with check (public.is_household_member(household_id));
create policy items_update on public.shopping_items for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy items_delete on public.shopping_items for delete to authenticated using (public.is_household_member(household_id));
-- household_invites hat absichtlich keine direkten Policies/Grants: Zugriff nur über RPCs.

revoke all on function public.is_household_member(uuid), public.is_household_member_path(text),
  public.create_household(text), public.create_household_invite(), public.join_household(text) from public;
grant execute on function public.is_household_member(uuid), public.is_household_member_path(text),
  public.create_household(text), public.create_household_invite(), public.join_household(text) to authenticated;

-- Privater Storage-Bucket. Der erste Pfadteil ist stets die Haushalt-ID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy product_images_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_household_member_path((storage.foldername(name))[1]));
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_household_member_path((storage.foldername(name))[1]));
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_household_member_path((storage.foldername(name))[1]))
  with check (bucket_id = 'product-images' and public.is_household_member_path((storage.foldername(name))[1]));
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_household_member_path((storage.foldername(name))[1]));

-- Realtime respektiert RLS; Änderungen bleiben auf den Haushalt beschränkt.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items') then
      alter publication supabase_realtime add table public.shopping_items;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households') then
      alter publication supabase_realtime add table public.households;
    end if;
  end if;
end $$;
