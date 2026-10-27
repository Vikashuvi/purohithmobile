-- Google ID-token sign-in creates the Supabase user before the role picker can
-- attach its choice. Let only a newly created Google user choose priest once.
create or replace function public.claim_google_priest_role()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := (select auth.uid());
  current_role public.app_role;
begin
  if account_id is null then return false; end if;
  if not exists (
    select 1 from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'google'
    where u.id = account_id and u.created_at > now() - interval '30 minutes'
  ) then return false; end if;

  select role into current_role from public.app_users where id = account_id for update;
  if current_role = 'priest'::public.app_role then return true; end if;
  if current_role <> 'customer'::public.app_role then return false; end if;

  update public.app_users
    set role = 'priest'::public.app_role, updated_at = now()
    where id = account_id and role = 'customer'::public.app_role;
  return found;
end;
$$;

revoke all on function public.claim_google_priest_role() from public, anon;
grant execute on function public.claim_google_priest_role() to authenticated;
