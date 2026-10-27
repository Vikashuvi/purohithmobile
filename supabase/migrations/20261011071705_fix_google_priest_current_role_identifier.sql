-- CURRENT_ROLE is a PostgreSQL identifier of type name. The previous
-- function's current_role variable was resolved as that identifier in SQL
-- expressions, causing "name = public.app_role" during priest setup.
create or replace function public.claim_google_priest_role()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := (select auth.uid());
  account_role public.app_role;
begin
  if account_id is null then return false; end if;
  if not exists (
    select 1 from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'google'
    where u.id = account_id and u.created_at > now() - interval '30 minutes'
  ) then return false; end if;

  select role into account_role
    from public.app_users where id = account_id for update;
  if account_role = 'priest'::public.app_role then return true; end if;
  if account_role is distinct from 'customer'::public.app_role then return false; end if;

  update public.app_users
    set role = 'priest'::public.app_role, updated_at = now()
    where id = account_id and role = 'customer'::public.app_role;
  return found;
end;
$$;

revoke all on function public.claim_google_priest_role() from public, anon;
grant execute on function public.claim_google_priest_role() to authenticated;
