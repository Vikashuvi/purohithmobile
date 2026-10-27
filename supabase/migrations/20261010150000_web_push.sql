create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id);
alter table public.web_push_subscriptions enable row level security;

drop policy if exists "users manage own web push subscriptions" on public.web_push_subscriptions;
create policy "users manage own web push subscriptions"
on public.web_push_subscriptions for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "super admins read web push subscriptions" on public.web_push_subscriptions;
create policy "super admins read web push subscriptions"
on public.web_push_subscriptions for select to authenticated
using ((select private.current_app_role()) = 'super_admin'::public.app_role);

revoke all on public.web_push_subscriptions from anon;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
grant all on public.web_push_subscriptions to service_role;

alter table public.notification_campaigns
  add column if not exists channel text not null default 'all'
  check (channel in ('all', 'mobile', 'web'));
alter table public.notification_campaigns
  add column if not exists web_push_success_count integer not null default 0;
alter table public.notification_campaigns
  add column if not exists web_push_failure_count integer not null default 0;
