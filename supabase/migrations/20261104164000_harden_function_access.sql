-- Security Advisor: interne Helper aus dem exponierten API-Schema entfernen
-- und anonyme Direkt-Grants auf SECURITY DEFINER RPCs ausdrücklich widerrufen.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter function public.is_household_member(uuid) set schema private;
alter function public.is_household_member_path(text) set schema private;

revoke all on function private.is_household_member(uuid), private.is_household_member_path(text)
  from public, anon, authenticated;
grant execute on function private.is_household_member(uuid), private.is_household_member_path(text)
  to authenticated;

revoke execute on function public.create_household(text), public.create_household_invite(), public.join_household(text)
  from public, anon;
grant execute on function public.create_household(text), public.create_household_invite(), public.join_household(text)
  to authenticated;
