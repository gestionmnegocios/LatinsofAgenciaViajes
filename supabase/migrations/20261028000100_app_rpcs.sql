-- =============================================================================
-- RPC de aplicación: onboarding de agencia, Apertura Flash y autoguardado.
-- =============================================================================

-- Mientras el asesor escribe, un servicio USD puede quedar sin TRM (costo 0,
-- igual que en el Termómetro). La conversión a expediente sí la exige.
alter table public.dossier_services drop constraint dossier_services_exchange_rate_check;
alter table public.dossier_services add constraint dossier_services_exchange_rate_check check (exchange_rate >= 0);

-- ─── Onboarding: el primer usuario crea su agencia y queda como ADMIN ────────
create function public.register_agency(p_agency_name text, p_nit text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_agency uuid;
begin
  if v_uid is null then
    raise exception 'Debe iniciar sesión' using errcode = '42501';
  end if;
  if exists (select 1 from public.agency_users where id = v_uid) then
    raise exception 'El usuario ya pertenece a una agencia' using errcode = '22023';
  end if;
  if coalesce(trim(p_agency_name), '') = '' or coalesce(trim(p_nit), '') = '' or coalesce(trim(p_full_name), '') = '' then
    raise exception 'Nombre de agencia, NIT y nombre completo son obligatorios' using errcode = '22023';
  end if;

  insert into public.agencies (name, nit) values (trim(p_agency_name), trim(p_nit))
  returning id into v_agency;
  insert into public.agency_users (id, agency_id, full_name, role)
  values (v_uid, v_agency, trim(p_full_name), 'ADMIN');
  return v_agency;
end;
$$;

-- ─── FR-1.2 Apertura Flash: cliente (upsert por documento) + expediente + Opción 1 ─
create function public.create_dossier(
  p_client_document text,
  p_client_name     text,
  p_client_whatsapp text,
  p_title           text,
  p_departure       date,
  p_return          date,
  p_adults          int default 1,
  p_children        int default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_agency  uuid := public.current_agency_id();
  v_client  uuid;
  v_dossier uuid;
  v_next    int;
begin
  if v_agency is null then
    raise exception 'Sesión sin agencia' using errcode = '42501';
  end if;

  insert into public.clients (agency_id, document_number, full_name, whatsapp)
  values (v_agency, trim(p_client_document), trim(p_client_name), trim(p_client_whatsapp))
  on conflict (agency_id, document_number) do update
    set full_name = excluded.full_name, whatsapp = excluded.whatsapp
  returning id into v_client;

  -- Consecutivo EXP-#### por agencia, serializado con un lock de transacción.
  perform pg_advisory_xact_lock(hashtext(v_agency::text));
  select coalesce(max(substring(dossier_code from '^EXP-(\d+)$')::int), 1000) + 1
  into v_next
  from public.travel_dossiers
  where agency_id = v_agency;

  insert into public.travel_dossiers
    (agency_id, agent_id, client_id, dossier_code, destination_title,
     departure_date, return_date, adults_count, children_count)
  values
    (v_agency, auth.uid(), v_client, 'EXP-' || v_next, trim(p_title),
     p_departure, p_return, greatest(p_adults, 0), greatest(p_children, 0))
  returning id into v_dossier;

  insert into public.quote_options (agency_id, dossier_id, option_title)
  values (v_agency, v_dossier, 'Opción 1');

  return v_dossier;
end;
$$;

-- ─── Autoguardado del Workspace ──────────────────────────────────────────────
-- Recibe el estado completo de opciones/servicios y lo sincroniza en una sola
-- transacción. SECURITY INVOKER: la RLS y las FK compuestas siguen aplicando.
-- No toca is_selected / is_archived: eso solo lo cambia convert_quote_to_file.
create function public.sync_dossier_options(p_dossier_id uuid, p_options jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_agency uuid := public.current_agency_id();
  v_status public.dossier_status;
begin
  select status into v_status
  from public.travel_dossiers
  where id = p_dossier_id and agency_id = v_agency;

  if not found then
    raise exception 'Expediente no encontrado' using errcode = 'P0002';
  end if;

  -- 1. Servicios eliminados en el cliente.
  delete from public.dossier_services s
  using public.quote_options q
  where s.quote_option_id = q.id
    and q.dossier_id = p_dossier_id
    and s.id not in (
      select (svc ->> 'id')::uuid
      from jsonb_array_elements(p_options) opt,
           jsonb_array_elements(opt -> 'services') svc
    );

  -- 2. Opciones eliminadas (solo en cotización).
  if v_status = 'DRAFT' then
    delete from public.quote_options
    where dossier_id = p_dossier_id
      and id not in (select (opt ->> 'id')::uuid from jsonb_array_elements(p_options) opt);
  end if;

  -- 3. Opciones nuevas / renombradas.
  insert into public.quote_options (id, agency_id, dossier_id, option_title)
  select (opt ->> 'id')::uuid, v_agency, p_dossier_id, coalesce(nullif(trim(opt ->> 'title'), ''), 'Opción')
  from jsonb_array_elements(p_options) opt
  on conflict (id) do update
    set option_title = excluded.option_title
    where public.quote_options.dossier_id = excluded.dossier_id;

  -- 4. Servicios nuevos / editados.
  insert into public.dossier_services (
    id, agency_id, quote_option_id, provider_id, provider_name, service_type, description,
    booking_reference, currency, exchange_rate, net_cost_original, sale_price,
    payment_deadline, is_provider_paid
  )
  select
    (svc ->> 'id')::uuid,
    v_agency,
    (opt ->> 'id')::uuid,
    nullif(svc ->> 'providerId', '')::uuid,
    coalesce(svc ->> 'providerName', ''),
    (svc ->> 'serviceType')::public.service_type,
    coalesce(svc ->> 'description', ''),
    nullif(svc ->> 'bookingReference', ''),
    svc ->> 'currency',
    case when svc ->> 'currency' = 'COP' then 1 else greatest(coalesce((svc ->> 'exchangeRate')::numeric, 0), 0) end,
    greatest(coalesce((svc ->> 'netCostOriginal')::numeric, 0), 0),
    greatest(coalesce((svc ->> 'salePrice')::numeric, 0), 0),
    nullif(svc ->> 'paymentDeadline', '')::timestamptz,
    coalesce((svc ->> 'isProviderPaid')::boolean, false)
  from jsonb_array_elements(p_options) opt,
       jsonb_array_elements(opt -> 'services') svc
  where exists (
    select 1 from public.quote_options q
    where q.id = (opt ->> 'id')::uuid and q.dossier_id = p_dossier_id
  )
  on conflict (id) do update set
    provider_id       = excluded.provider_id,
    provider_name     = excluded.provider_name,
    service_type      = excluded.service_type,
    description       = excluded.description,
    booking_reference = excluded.booking_reference,
    currency          = excluded.currency,
    exchange_rate     = excluded.exchange_rate,
    net_cost_original = excluded.net_cost_original,
    sale_price        = excluded.sale_price,
    payment_deadline  = excluded.payment_deadline,
    is_provider_paid  = excluded.is_provider_paid
  -- Un servicio no se puede "mover" a otra opción/expediente reutilizando su ID.
  where public.dossier_services.quote_option_id = excluded.quote_option_id;
end;
$$;

-- La conversión exige TRM en todos los servicios USD de la opción aprobada.
create function public.assert_option_has_trm()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'CONFIRMED' and old.status = 'DRAFT' and exists (
    select 1
    from public.dossier_services s
    join public.quote_options q on q.id = s.quote_option_id
    where q.dossier_id = new.id and q.is_selected and s.currency <> 'COP' and s.exchange_rate <= 0
  ) then
    raise exception 'Hay servicios en USD sin TRM' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger travel_dossiers_trm_guard
  before update of status on public.travel_dossiers
  for each row execute function public.assert_option_has_trm();

revoke execute on function public.register_agency(text, text, text)                              from public, anon;
revoke execute on function public.create_dossier(text, text, text, text, date, date, int, int)   from public, anon;
revoke execute on function public.sync_dossier_options(uuid, jsonb)                              from public, anon;
grant  execute on function public.register_agency(text, text, text)                              to authenticated;
grant  execute on function public.create_dossier(text, text, text, text, date, date, int, int)   to authenticated;
grant  execute on function public.sync_dossier_options(uuid, jsonb)                              to authenticated;
