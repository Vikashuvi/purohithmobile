-- Accept-then-pay booking flow: a Purohit accepts the request first, then the customer pays.
-- 'accepted' = Purohit agreed, customer payment pending. Payment moves it to 'confirmed'.
alter type public.booking_status add value if not exists 'accepted' after 'pending';

alter table public.bookings add column if not exists accepted_at timestamptz;
alter table public.bookings add column if not exists rejected_at timestamptz;

-- In-app notification inbox shared by customers and Purohits.
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (char_length(type) <= 64),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 1000),
  data jsonb not null default '{}'::jsonb,
  booking_id uuid references public.bookings(id) on delete cascade,
  request_id uuid references public.ceremony_requests(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created_idx on public.app_notifications (user_id, created_at desc);
create index if not exists app_notifications_user_unread_idx on public.app_notifications (user_id) where read_at is null;
create index if not exists app_notifications_booking_idx on public.app_notifications (booking_id);
create index if not exists app_notifications_request_idx on public.app_notifications (request_id);

alter table public.app_notifications enable row level security;

drop policy if exists "users read own notifications" on public.app_notifications;
create policy "users read own notifications" on public.app_notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "users mark own notifications read" on public.app_notifications;
create policy "users mark own notifications read" on public.app_notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "users delete own notifications" on public.app_notifications;
create policy "users delete own notifications" on public.app_notifications
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.app_notifications from anon;
grant select, update, delete on public.app_notifications to authenticated;
-- Inserts only come from edge functions using the service role.
revoke insert on public.app_notifications from authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_notifications'
     ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end $$;
