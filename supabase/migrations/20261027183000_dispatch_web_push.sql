create extension if not exists pg_net;

create or replace function private.dispatch_web_push()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  hook_secret text;
begin
  if new.type = 'marketing' then
    return new;
  end if;
  select decrypted_secret into hook_secret
  from vault.decrypted_secrets
  where name = 'WEB_PUSH_HOOK_SECRET'
  order by created_at desc
  limit 1;
  if hook_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://fvvmfrbfqwdypkagtdce.supabase.co/functions/v1/deliver-web-push',
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', new.title,
      'body', coalesce(new.body, ''),
      'data', coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'type', new.type,
        'bookingId', new.booking_id,
        'requestId', new.request_id
      ))
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-web-push-hook', hook_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'web push dispatch failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function private.dispatch_web_push() from public, anon, authenticated;

drop trigger if exists app_notifications_web_push on public.app_notifications;
create trigger app_notifications_web_push
after insert on public.app_notifications
for each row execute function private.dispatch_web_push();
