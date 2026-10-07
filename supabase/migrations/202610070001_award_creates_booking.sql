-- Selecting a quote must create the pending booking the purohit dashboard lists.
-- The live award action used to mark the request awarded without a booking_id,
-- so the purohit work queue never showed the request.

create or replace function public.ensure_booking_for_awarded_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.ceremony_proposals%rowtype;
  priest public.priest_profiles%rowtype;
  pooja public.poojas%rowtype;
  customer public.app_users%rowtype;
  new_booking_id uuid;
  total integer;
  subtotal integer;
begin
  if new.booking_id is not null
     or new.awarded_proposal_id is null
     or new.status is distinct from 'awarded'
     or new.payment_status = 'paid' then
    return new;
  end if;

  select * into proposal from public.ceremony_proposals where id = new.awarded_proposal_id;
  if not found then
    raise exception 'Awarded proposal % was not found', new.awarded_proposal_id;
  end if;

  select * into priest from public.priest_profiles where id = proposal.priest_id;
  select * into pooja from public.poojas where slug = new.pooja_slug;
  select * into customer from public.app_users where id = new.customer_id;
  if priest.id is null or pooja.slug is null then
    raise exception 'Purohit or ceremony not found for awarded request %', new.id;
  end if;
  if new.ceremony_date is null or new.ceremony_time is null or coalesce(new.address, '') = '' then
    raise exception 'Date, time, and address are required before a purohit can receive request %', new.id;
  end if;

  total := proposal.amount_inr;
  subtotal := round(total::numeric / 1.18)::integer;

  insert into public.bookings (
    customer_id, priest_id, pooja_slug, booking_date, booking_time,
    address, landmark, latitude, longitude, notes,
    subtotal_inr, gst_inr, total_inr, status, payment_status,
    customer_name, customer_phone, customer_email,
    priest_name, pooja_name, pooja_price_inr, service_fee_inr, addons_total_inr,
    payment_provider
  ) values (
    new.customer_id, proposal.priest_id, new.pooja_slug, new.ceremony_date, new.ceremony_time,
    new.address, coalesce(new.landmark, ''), new.latitude, new.longitude, coalesce(new.notes, ''),
    subtotal, total - subtotal, total, 'pending', 'unpaid',
    coalesce(customer.full_name, 'Customer'), coalesce(customer.phone, ''), coalesce(customer.email, ''),
    priest.display_name, pooja.name, total, 0, 0,
    'cashfree'
  )
  returning id into new_booking_id;

  new.booking_id := new_booking_id;

  if priest.user_id is not null then
    insert into public.app_notifications (user_id, type, title, body, data, booking_id, request_id)
    values (
      priest.user_id,
      'proposal_selected',
      'A customer chose your quote',
      pooja.name || ' · ₹' || total || '. Accept to let them pay, or decline.',
      jsonb_build_object('type', 'proposal_selected', 'bookingId', new_booking_id, 'requestId', new.id),
      new_booking_id,
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists ceremony_requests_award_booking on public.ceremony_requests;
create trigger ceremony_requests_award_booking
  before update on public.ceremony_requests
  for each row
  execute function public.ensure_booking_for_awarded_request();
