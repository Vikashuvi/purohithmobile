-- A priest can start a paid, confirmed ceremony and then complete it.
alter type public.booking_status add value if not exists 'in_progress' after 'confirmed';
alter table public.bookings add column if not exists started_at timestamptz;
alter table public.bookings add column if not exists started_by uuid references auth.users(id);

create table if not exists public.booking_job_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('start', 'complete')),
  from_status text not null,
  to_status text not null,
  created_at timestamptz not null default now(),
  unique (booking_id, action)
);
create index if not exists booking_job_events_booking_created_idx on public.booking_job_events (booking_id, created_at desc);
alter table public.booking_job_events enable row level security;
revoke all on public.booking_job_events from anon, authenticated;
grant select on public.booking_job_events to authenticated;
create policy "booking participants read job events" on public.booking_job_events
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
      left join public.priest_profiles p on p.id = b.priest_id
      where b.id = booking_id and (b.customer_id = (select auth.uid()) or p.user_id = (select auth.uid()))
    )
  );
