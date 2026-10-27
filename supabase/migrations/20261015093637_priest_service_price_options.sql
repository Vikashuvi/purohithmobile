-- Optional, provider-set prices for samagri and extra services.
alter table public.priest_services add column if not exists with_samagri_price_paise bigint check (with_samagri_price_paise is null or with_samagri_price_paise >= 100);
alter table public.priest_services add column if not exists additional_priest_price_paise bigint check (additional_priest_price_paise is null or additional_priest_price_paise >= 0);
alter table public.priest_services add column if not exists extra_service_label text check (extra_service_label is null or char_length(extra_service_label) <= 80);
alter table public.priest_services add column if not exists extra_service_price_paise bigint check (extra_service_price_paise is null or extra_service_price_paise >= 0);
alter table public.bookings add column if not exists pricing_options jsonb not null default '{}'::jsonb;

-- Atomically replace the calling priest's rate card. Runs as the caller so RLS still applies.
create or replace function public.save_priest_rate_card(p_items jsonb)
returns setof public.priest_services
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_priest_id uuid;
  v_slugs text[];
  v_min integer;
  v_max integer;
  v_item jsonb;
  v_price numeric;
  v_duration integer;
  v_optional numeric;
begin
  select id into v_priest_id from public.priest_profiles where user_id = auth.uid();
  if v_priest_id is null then
    raise exception 'Priest profile not found for this account' using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one pooja to your rate card' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'pooja_slug', '') = '' then
      raise exception 'Each rate card item needs a pooja' using errcode = '22023';
    end if;
    if not exists (select 1 from public.poojas p where p.slug = v_item->>'pooja_slug' and p.is_active) then
      raise exception 'Unknown pooja: %', v_item->>'pooja_slug' using errcode = '22023';
    end if;
    v_price := nullif(v_item->>'price_inr', '')::numeric;
    if v_price is null or v_price < 100 or v_price > 500000 or v_price <> trunc(v_price) then
      raise exception 'Price for % must be a whole amount between ₹100 and ₹5,00,000', v_item->>'pooja_slug' using errcode = '22023';
    end if;
    for v_optional in select x from (values
      (nullif(v_item->>'with_samagri_price_inr', '')::numeric),
      (nullif(v_item->>'additional_priest_price_inr', '')::numeric),
      (nullif(v_item->>'extra_service_price_inr', '')::numeric)
    ) as values_to_check(x) where x is not null loop
      if v_optional < 0 or v_optional > 500000 or v_optional <> trunc(v_optional) then
        raise exception 'Additional prices for % must be whole amounts up to ₹5,00,000', v_item->>'pooja_slug' using errcode = '22023';
      end if;
    end loop;
    if nullif(v_item->>'with_samagri_price_inr', '')::numeric < v_price then
      raise exception 'With-samagri price for % cannot be lower than the base price', v_item->>'pooja_slug' using errcode = '22023';
    end if;
    if length(coalesce(v_item->>'extra_service_label', '')) > 80 then
      raise exception 'Extra service label must be 80 characters or fewer' using errcode = '22023';
    end if;
    if (nullif(v_item->>'extra_service_price_inr', '') is not null) and nullif(btrim(coalesce(v_item->>'extra_service_label', '')), '') is null then
      raise exception 'Name the extra service for %', v_item->>'pooja_slug' using errcode = '22023';
    end if;
    v_duration := nullif(v_item->>'duration_minutes', '')::integer;
    if v_duration is not null and (v_duration < 15 or v_duration > 1440) then
      raise exception 'Duration for % must be between 15 and 1440 minutes', v_item->>'pooja_slug' using errcode = '22023';
    end if;
    if length(coalesce(v_item->>'description', '')) > 280 then
      raise exception 'Note for % must be 280 characters or fewer', v_item->>'pooja_slug' using errcode = '22023';
    end if;
  end loop;

  select array_agg(distinct x->>'pooja_slug') into v_slugs from jsonb_array_elements(p_items) x;

  insert into public.priest_services as s
    (priest_id, pooja_slug, price_paise, with_samagri_price_paise, additional_priest_price_paise, extra_service_label, extra_service_price_paise, duration_minutes, includes_samagri, description, is_active, updated_at)
  select
    v_priest_id,
    x->>'pooja_slug',
    ((x->>'price_inr')::numeric * 100)::bigint,
    (nullif(x->>'with_samagri_price_inr', '')::numeric * 100)::bigint,
    (nullif(x->>'additional_priest_price_inr', '')::numeric * 100)::bigint,
    nullif(btrim(coalesce(x->>'extra_service_label', '')), ''),
    (nullif(x->>'extra_service_price_inr', '')::numeric * 100)::bigint,
    nullif(x->>'duration_minutes', '')::integer,
    coalesce((x->>'includes_samagri')::boolean, false),
    nullif(btrim(coalesce(x->>'description', '')), ''),
    true,
    now()
  from (select distinct on (e->>'pooja_slug') e as x from jsonb_array_elements(p_items) e) items
  on conflict (priest_id, pooja_slug) do update set
    price_paise = excluded.price_paise,
    with_samagri_price_paise = excluded.with_samagri_price_paise,
    additional_priest_price_paise = excluded.additional_priest_price_paise,
    extra_service_label = excluded.extra_service_label,
    extra_service_price_paise = excluded.extra_service_price_paise,
    duration_minutes = excluded.duration_minutes,
    includes_samagri = excluded.includes_samagri,
    description = excluded.description,
    is_active = true,
    updated_at = now();

  update public.priest_services
     set is_active = false, updated_at = now()
   where priest_id = v_priest_id and is_active and not (pooja_slug = any (v_slugs));

  select min(price_paise / 100)::integer, max(price_paise / 100)::integer
    into v_min, v_max
    from public.priest_services
   where priest_id = v_priest_id and is_active;

  update public.priest_profiles
     set pooja_slugs = v_slugs,
         starting_price_inr = v_min,
         max_price_inr = v_max,
         updated_at = now()
   where id = v_priest_id;

  return query
    select * from public.priest_services
     where priest_id = v_priest_id
     order by is_active desc, price_paise asc;
end;
$$;

revoke all on function public.save_priest_rate_card(jsonb) from public, anon;
grant execute on function public.save_priest_rate_card(jsonb) to authenticated;
