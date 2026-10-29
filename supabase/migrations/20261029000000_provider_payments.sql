-- =============================================================================
-- Pagos a proveedores (giros a mayoristas): salidas de caja vinculadas a un
-- servicio de la opción aprobada y su localizador. Se registran en la moneda
-- del servicio; en USD con la TRM real del giro. Con giros registrados,
-- `is_provider_paid` lo calcula la base de datos (pagado ≥ costo neto).
-- =============================================================================

alter table public.dossier_services add constraint dossier_services_agency_id_id_key unique (agency_id, id);

create table public.provider_payments (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null,
  dossier_id        uuid not null,
  service_id        uuid not null,
  currency          text not null check (currency in ('COP', 'USD')),
  amount_original   numeric(14, 2) not null check (amount_original > 0),
  exchange_rate     numeric(10, 2) not null default 1.00 check (exchange_rate > 0), -- TRM del giro
  amount_cop        numeric(14, 2) generated always as (round(amount_original * exchange_rate, 2)) stored,
  payment_method    public.payment_method not null,
  paid_at           timestamptz not null default now(),
  reference         text,          -- N.º de transferencia / comprobante
  booking_reference text,          -- Localizador del servicio al momento del giro
  notes             text,
  registered_by     uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  check (currency <> 'COP' or exchange_rate = 1),
  foreign key (agency_id, dossier_id)    references public.travel_dossiers (agency_id, id) on delete cascade,
  -- Sin cascada: un servicio con giros no se puede borrar.
  foreign key (agency_id, service_id)    references public.dossier_services (agency_id, id),
  foreign key (agency_id, registered_by) references public.agency_users (agency_id, id)
);
create index provider_payments_dossier_idx       on public.provider_payments (agency_id, dossier_id);
create index provider_payments_service_idx       on public.provider_payments (agency_id, service_id);
create index provider_payments_registered_by_idx on public.provider_payments (agency_id, registered_by);

alter table public.provider_payments enable row level security;
create policy provider_payments_tenant on public.provider_payments
  for all to authenticated
  using (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- ¿Los giros cubren el costo neto del servicio? NULL = el servicio no tiene giros.
create function public.service_paid_by_transfers(p_service_id uuid, p_net_cost_original numeric)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case when count(*) = 0 then null
              else coalesce(sum(amount_original), 0) >= p_net_cost_original end
  from public.provider_payments
  where service_id = p_service_id
$$;

-- Validación del giro: servicio de la opción aprobada de un expediente activo,
-- misma moneda y sin pagar de más.
create function public.validate_provider_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_service public.dossier_services;
  v_status  public.dossier_status;
  v_paid    numeric;
begin
  select s.* into v_service
  from public.dossier_services s
  join public.quote_options q on q.id = s.quote_option_id
  where s.id = new.service_id and q.dossier_id = new.dossier_id and q.is_selected and not q.is_archived;
  if not found then
    raise exception 'El servicio no pertenece a la opción aprobada del expediente' using errcode = '22023';
  end if;

  select status into v_status from public.travel_dossiers where id = new.dossier_id;
  if v_status not in ('CONFIRMED', 'IN_PROGRESS') then
    raise exception 'Solo se registran giros en expedientes activos' using errcode = '22023';
  end if;

  if new.currency <> v_service.currency then
    raise exception 'El giro debe hacerse en % como el servicio', v_service.currency using errcode = '22023';
  end if;

  select coalesce(sum(amount_original), 0) into v_paid
  from public.provider_payments
  where service_id = new.service_id and id <> new.id;
  if v_paid + new.amount_original > v_service.net_cost_original then
    raise exception 'El giro supera el saldo con el proveedor (% %)',
      v_service.net_cost_original - v_paid, v_service.currency using errcode = '22023';
  end if;

  new.booking_reference := coalesce(nullif(trim(new.booking_reference), ''), v_service.booking_reference);
  return new;
end;
$$;

create trigger provider_payments_validate
  before insert or update on public.provider_payments
  for each row execute function public.validate_provider_payment();

create trigger provider_payments_liquidated_guard
  before insert or update or delete on public.provider_payments
  for each row execute function public.guard_liquidated_children();

-- Tras cada giro se recalcula el estado del servicio.
create function public.sync_service_paid_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Borrado en cascada del expediente: no hay servicio que actualizar.
  if tg_op = 'DELETE' and not exists (select 1 from public.travel_dossiers where id = old.dossier_id) then
    return null;
  end if;
  update public.dossier_services s
  set is_provider_paid = coalesce(public.service_paid_by_transfers(s.id, s.net_cost_original), false)
  where s.id in (old.service_id, new.service_id);
  return null;
end;
$$;

create trigger provider_payments_sync_paid
  after insert or update or delete on public.provider_payments
  for each row execute function public.sync_service_paid_flag();

-- Con giros, el autoguardado no puede pisar el estado calculado.
create function public.enforce_service_paid_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_by_transfers boolean := public.service_paid_by_transfers(new.id, new.net_cost_original);
begin
  if v_by_transfers is not null then
    new.is_provider_paid := v_by_transfers;
  end if;
  return new;
end;
$$;

create trigger dossier_services_paid_flag
  before update on public.dossier_services
  for each row execute function public.enforce_service_paid_flag();

revoke execute on function public.validate_provider_payment()  from public, anon, authenticated;
revoke execute on function public.sync_service_paid_flag()     from public, anon, authenticated;
revoke execute on function public.enforce_service_paid_flag()  from public, anon, authenticated;
revoke execute on function public.service_paid_by_transfers(uuid, numeric) from public, anon;
grant  execute on function public.service_paid_by_transfers(uuid, numeric) to authenticated;
