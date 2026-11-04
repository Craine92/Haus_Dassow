begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table test_results (line text) on commit drop;
grant select, insert on test_results to anon, authenticated;
insert into test_results select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'partner-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.households (id, name, owner_id)
values
  ('a0000000-0000-0000-0000-000000000001', 'Haushalt A', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', 'Haushalt B', '20000000-0000-0000-0000-000000000001');
insert into public.household_members (household_id, user_id, role)
values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'member'),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner');
insert into public.shopping_items (household_id, id, name, price_cents)
values
  ('a0000000-0000-0000-0000-000000000001', 'a-item', 'Artikel A', 1000),
  ('b0000000-0000-0000-0000-000000000001', 'b-item', 'Artikel B', 2000);

set local role anon;
insert into test_results select throws_ok($$select * from public.shopping_items$$, '42501', 'permission denied for table shopping_items', 'Anonym hat kein SELECT-Recht auf Artikel');
insert into test_results select throws_ok($$select * from public.household_invites$$, '42501', 'permission denied for table household_invites', 'Anonym hat kein SELECT-Recht auf Einladungen');
insert into test_results select throws_ok($$select public.create_household('Angriff')$$, '42501', 'permission denied for function create_household', 'Anonym darf keinen Haushalt erstellen');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into test_results select results_eq($$select count(*)::int from public.households$$, array[1], 'Besitzer sieht nur eigenen Haushalt');
insert into test_results select results_eq($$select count(*)::int from public.shopping_items$$, array[1], 'Besitzer sieht nur eigene Artikel');
insert into test_results select is(length(public.create_household_invite()), 48, 'Besitzer kann einmaligen Einladungscode erzeugen');
insert into test_results select throws_ok($$select * from public.household_invites$$, '42501', 'permission denied for table household_invites', 'Einladungshashes bleiben auch für Besitzer unlesbar');
insert into test_results select lives_ok($$update public.shopping_items set price_cents = 1099 where id = 'a-item'$$, 'Besitzer darf eigenen Artikel ändern');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into test_results select results_eq($$select count(*)::int from public.shopping_items$$, array[1], 'Partner sieht gemeinsamen Artikel');
insert into test_results select lives_ok($$update public.shopping_items set status = 'Bestellt' where id = 'a-item'$$, 'Partner darf gemeinsamen Artikel ändern');
insert into test_results select throws_ok($$select public.create_household_invite()$$, 'P0001', 'Nur die Haushaltsverwaltung kann einladen.', 'Partner ohne Besitzerrolle darf nicht einladen');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into test_results select results_eq($$select count(*)::int from public.shopping_items where id = 'a-item'$$, array[0], 'Fremder Haushalt kann Artikel A nicht lesen');
insert into test_results select throws_ok($$insert into public.shopping_items (household_id, id, name) values ('a0000000-0000-0000-0000-000000000001', 'attack', 'Angriff')$$, '42501', 'new row violates row-level security policy for table "shopping_items"', 'Fremder Haushalt kann nicht in Haushalt A schreiben');
insert into test_results select results_eq($$delete from public.shopping_items where id = 'a-item' returning 1$$, array[]::integer[], 'Fremder Haushalt kann Artikel A nicht löschen');
insert into test_results select throws_ok($$insert into storage.objects (bucket_id, name) values ('product-images', 'a0000000-0000-0000-0000-000000000001/attack/file.png')$$, '42501', 'new row violates row-level security policy for table "objects"', 'Fremder Haushalt kann nicht in Storage-Pfad A schreiben');
reset role;

insert into test_results select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items'), 'Artikel sind für Realtime publiziert');
insert into test_results select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households'), 'Haushalte sind für Realtime publiziert');

insert into test_results select * from finish();
select line from test_results;
rollback;
