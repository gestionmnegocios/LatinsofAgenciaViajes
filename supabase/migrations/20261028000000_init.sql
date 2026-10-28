-- =============================================================================
-- TravelSaaS Colombia · Esquema inicial multi-tenant (Supabase / PostgreSQL 15+)
--
-- Aislamiento por agencia en tres capas:
--   1. RLS en TODAS las tablas con `agency_id = public.current_agency_id()`;
--      la agencia sale de la sesión (auth.uid()), nunca de un parámetro.
--   2. Llaves foráneas compuestas (hijo.agency_id, hijo.padre_id) →
--      padre(agency_id, id): es imposible colgar un abono, servicio u opción
--      de un expediente de otra agencia aunque se manipulen los IDs.
--   3. Las comisiones solo se escriben desde funciones SECURITY DEFINER que
--      vuelven a validar la agencia de la sesión.
-- =============================================================================

-- ─── Tipos ───────────────────────────────────────────────────────────────────
create type public.user_role         as enum ('ADMIN', 'AGENT');
create type public.provider_category as enum ('MAYORISTA', 'CONSOLIDADOR', 'HOTEL', 'ASISTENCIA', 'OPERADOR_LOCAL');
create type public.dossier_status    as enum ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'LIQUIDATED', 'CANCELLED');
create type public.service_type      as enum ('HOTEL', 'FLIGHT', 'PACKAGE', 'ASSISTANCE', 'TRANSFER', 'TOUR');
create type public.payment_method    as enum ('TRANSFER_BANCOLOMBIA', 'NEQUI_DAVIPLATA', 'CARD_GATEWAY', 'CASH', 'OTHER');
create type public.commission_status as enum ('HELD', 'RELEASED', 'PAID', 'CANCELLED');

-- ─── 1. Agencias ─────────────────────────────────────────────────────────────
create table public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  nit         text not null unique,
  phone       text,
  city        text default 'Medellín',
  currency    text default 'COP',
  created_at  timestamptz not null default now()
);

-- ─── 2. Usuarios / asesores ──────────────────────────────────────────────────
create table public.agency_users (
  id                      uuid primary key references auth.users (id) on delete cascade,
  agency_id               uuid not null references public.agencies (id) on delete cascade,
  full_name               text not null,
  role                    public.user_role not null default 'AGENT',
  default_commission_rate numeric(5, 2) not null default 15.00
                          check (default_commission_rate between 0 and 100),
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  unique (agency_id, id)
);
create index agency_users_agency_idx on public.agency_users (agency_id);

-- ─── Helpers de sesión (SECURITY DEFINER para no recursar en la RLS de agency_users) ─
create function public.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select agency_id
  from public.agency_users
  where id = auth.uid() and is_active
$$;

create function public.is_agency_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'ADMIN' from public.agency_users where id = auth.uid() and is_active),
    false
  )
$$;

-- ─── 3. Catálogo de proveedores ──────────────────────────────────────────────
create table public.providers_catalog (
  id                     uuid primary key default gen_random_uuid(),
  agency_id              uuid references public.agencies (id) on delete cascade, -- NULL = global del sistema
  name                   text not null,
  category               public.provider_category not null,
  nit                    text,
  default_currency       text not null default 'COP' check (default_currency in ('COP', 'USD')),
  default_puc_account    text not null default '281505',
  payment_deadline_hours int not null default 48 check (payment_deadline_hours >= 0),
  is_system_preload      boolean not null default false,
  created_at             timestamptz not null default now(),
  -- Un proveedor precargado nunca pertenece a una agencia y viceversa.
  check (is_system_preload = (agency_id is null))
);
create index providers_catalog_agency_idx on public.providers_catalog (agency_id);
create unique index providers_catalog_name_uq
  on public.providers_catalog (coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ─── 4. Clientes ─────────────────────────────────────────────────────────────
create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies (id) on delete cascade,
  document_type   text not null default 'CC',
  document_number text not null,
  full_name       text not null,
  whatsapp        text not null,
  email           text,
  created_at      timestamptz not null default now(),
  unique (agency_id, document_number),
  unique (agency_id, id)
);

-- ─── 5. Expedientes / cotizaciones ───────────────────────────────────────────
create table public.travel_dossiers (
  id                     uuid primary key default gen_random_uuid(),
  agency_id              uuid not null references public.agencies (id) on delete cascade,
  agent_id               uuid not null,
  client_id              uuid not null,
  dossier_code           text not null,
  destination_title      text not null,
  departure_date         date not null,
  return_date            date not null,
  adults_count           int not null default 1 check (adults_count >= 0),
  children_count         int not null default 0 check (children_count >= 0),
  has_minors             boolean generated always as (children_count > 0) stored,
  status                 public.dossier_status not null default 'DRAFT',

  -- Snapshots financieros (los escriben las RPC de conversión / liquidación)
  total_sale_price       numeric(14, 2) not null default 0,
  total_net_cost         numeric(14, 2) not null default 0,
  gross_margin           numeric(14, 2) not null default 0,
  net_utility_base       numeric(14, 2) not null default 0,
  iva_margin             numeric(14, 2) not null default 0,

  electronic_invoice_ref text,
  liquidated_at          timestamptz,
  created_at             timestamptz not null default now(),

  check (return_date >= departure_date),
  unique (agency_id, dossier_code),
  unique (agency_id, id),
  foreign key (agency_id, agent_id)  references public.agency_users (agency_id, id),
  foreign key (agency_id, client_id) references public.clients (agency_id, id)
);
create index travel_dossiers_agent_idx  on public.travel_dossiers (agency_id, agent_id);
create index travel_dossiers_status_idx on public.travel_dossiers (agency_id, status);

-- ─── 6. Opciones de propuesta ────────────────────────────────────────────────
create table public.quote_options (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null,
  dossier_id   uuid not null,
  option_title text not null default 'Opción 1',
  is_selected  boolean not null default false,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (agency_id, id),
  foreign key (agency_id, dossier_id) references public.travel_dossiers (agency_id, id) on delete cascade
);
create index quote_options_dossier_idx on public.quote_options (dossier_id);
-- Solo una opción congelada por expediente.
create unique index quote_options_one_selected_uq on public.quote_options (dossier_id) where is_selected;

-- ─── 7. Líneas de servicio ───────────────────────────────────────────────────
create table public.dossier_services (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null,
  quote_option_id   uuid not null,
  provider_id       uuid references public.providers_catalog (id),
  provider_name     text not null,
  service_type      public.service_type not null,
  description       text not null default '',
  booking_reference text,                                   -- Localizador / PNR
  currency          text not null default 'COP' check (currency in ('COP', 'USD')),
  exchange_rate     numeric(10, 2) not null default 1.00 check (exchange_rate > 0), -- TRM convenida
  net_cost_original numeric(14, 2) not null default 0 check (net_cost_original >= 0),
  -- Costo neto en COP: lo calcula la base, el cliente no puede enviarlo.
  net_cost          numeric(14, 2) generated always as (round(net_cost_original * exchange_rate, 2)) stored,
  sale_price        numeric(14, 2) not null default 0 check (sale_price >= 0),
  payment_deadline  timestamptz,
  voucher_url       text,
  is_provider_paid  boolean not null default false,
  created_at        timestamptz not null default now(),
  check (currency <> 'COP' or exchange_rate = 1),
  foreign key (agency_id, quote_option_id) references public.quote_options (agency_id, id) on delete cascade
);
create index dossier_services_option_idx   on public.dossier_services (quote_option_id);
create index dossier_services_deadline_idx on public.dossier_services (agency_id, payment_deadline)
  where not is_provider_paid;

-- ─── 8. Abonos de clientes ───────────────────────────────────────────────────
create table public.client_payments (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null,
  dossier_id     uuid not null,
  amount         numeric(14, 2) not null check (amount > 0),
  payment_method public.payment_method not null,
  receipt_number text,
  receipt_url    text,
  paid_at        timestamptz not null default now(),
  registered_by  uuid default auth.uid(),
  notes          text,
  foreign key (agency_id, dossier_id)    references public.travel_dossiers (agency_id, id) on delete cascade,
  foreign key (agency_id, registered_by) references public.agency_users (agency_id, id)
);
create index client_payments_dossier_idx on public.client_payments (dossier_id);

-- ─── 9. Comisiones a asesores ────────────────────────────────────────────────
create table public.agent_commissions (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null,
  dossier_id            uuid not null unique,
  agent_id              uuid not null,
  commission_percentage numeric(5, 2) not null,
  calculated_amount     numeric(14, 2) not null,
  status                public.commission_status not null default 'HELD',
  settlement_batch_id   uuid,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  foreign key (agency_id, dossier_id) references public.travel_dossiers (agency_id, id) on delete cascade,
  foreign key (agency_id, agent_id)   references public.agency_users (agency_id, id)
);
create index agent_commissions_agent_idx on public.agent_commissions (agency_id, agent_id, status);

-- =============================================================================
-- Integridad: proveedores ajenos y expedientes liquidados
-- =============================================================================

-- Un servicio solo puede referenciar proveedores globales o de su propia agencia.
create function public.assert_provider_visible()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider_id is not null and not exists (
    select 1 from public.providers_catalog p
    where p.id = new.provider_id
      and (p.agency_id is null or p.agency_id = new.agency_id)
  ) then
    raise exception 'Proveedor % no disponible para esta agencia', new.provider_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger dossier_services_provider_check
  before insert or update of provider_id, agency_id on public.dossier_services
  for each row execute function public.assert_provider_visible();

-- Blindaje contable: un expediente LIQUIDATED es inmutable y los cambios de
-- estado (DRAFT → CONFIRMED → LIQUIDATED) solo ocurren vía RPC.
create function public.guard_dossier_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.dossier_rpc', true) = 'on' then
    return new;
  end if;
  if old.status = 'LIQUIDATED' then
    raise exception 'El expediente % ya está liquidado', old.dossier_code using errcode = '42501';
  end if;
  -- Las transiciones de estado pasan por las RPC (salvo cancelar).
  if new.status is distinct from old.status and new.status <> 'CANCELLED' then
    raise exception 'Use convert_quote_to_file() / liquidate_dossier() para cambiar el estado'
      using errcode = '42501';
  end if;
  -- Los snapshots financieros solo los escriben las RPC.
  if (new.total_sale_price, new.total_net_cost, new.gross_margin, new.net_utility_base, new.iva_margin)
     is distinct from
     (old.total_sale_price, old.total_net_cost, old.gross_margin, old.net_utility_base, old.iva_margin) then
    raise exception 'Los totales financieros son calculados por el servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger travel_dossiers_status_guard
  before update on public.travel_dossiers
  for each row execute function public.guard_dossier_status();

-- Servicios, opciones y abonos de un expediente liquidado no se pueden tocar.
create function public.guard_liquidated_children()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dossier_id uuid;
begin
  if current_setting('app.dossier_rpc', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'dossier_services' then
    select q.dossier_id into v_dossier_id
    from public.quote_options q
    where q.id = coalesce(new.quote_option_id, old.quote_option_id);
  else
    v_dossier_id := coalesce(new.dossier_id, old.dossier_id);
  end if;

  if exists (
    select 1 from public.travel_dossiers d
    where d.id = v_dossier_id and d.status = 'LIQUIDATED'
  ) then
    raise exception 'El expediente está liquidado' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger dossier_services_liquidated_guard
  before insert or update or delete on public.dossier_services
  for each row execute function public.guard_liquidated_children();
create trigger quote_options_liquidated_guard
  before insert or update or delete on public.quote_options
  for each row execute function public.guard_liquidated_children();
create trigger client_payments_liquidated_guard
  before insert or update or delete on public.client_payments
  for each row execute function public.guard_liquidated_children();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.agencies          enable row level security;
alter table public.agency_users      enable row level security;
alter table public.providers_catalog enable row level security;
alter table public.clients           enable row level security;
alter table public.travel_dossiers   enable row level security;
alter table public.quote_options     enable row level security;
alter table public.dossier_services  enable row level security;
alter table public.client_payments   enable row level security;
alter table public.agent_commissions enable row level security;

-- Agencias: solo la propia; solo ADMIN edita.
create policy agencies_select on public.agencies
  for select to authenticated using (id = (select public.current_agency_id()));
create policy agencies_update on public.agencies
  for update to authenticated
  using (id = (select public.current_agency_id()) and (select public.is_agency_admin()))
  with check (id = (select public.current_agency_id()));

-- Usuarios: se ven los compañeros de agencia; solo ADMIN gestiona.
create policy agency_users_select on public.agency_users
  for select to authenticated using (agency_id = (select public.current_agency_id()));
create policy agency_users_admin_write on public.agency_users
  for all to authenticated
  using (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()))
  with check (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()));

-- Proveedores: globales (lectura) + propios (lectura/escritura). Los globales no se pueden editar.
create policy providers_select on public.providers_catalog
  for select to authenticated
  using (agency_id is null or agency_id = (select public.current_agency_id()));
create policy providers_insert on public.providers_catalog
  for insert to authenticated
  with check (agency_id = (select public.current_agency_id()) and not is_system_preload);
create policy providers_update on public.providers_catalog
  for update to authenticated
  using (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()) and not is_system_preload);
create policy providers_delete on public.providers_catalog
  for delete to authenticated
  using (agency_id = (select public.current_agency_id()));

-- Tablas operativas: todo dentro de la agencia de la sesión.
create policy clients_tenant on public.clients
  for all to authenticated
  using (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

create policy travel_dossiers_tenant on public.travel_dossiers
  for all to authenticated
  using (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

create policy quote_options_tenant on public.quote_options
  for all to authenticated
  using (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

create policy dossier_services_tenant on public.dossier_services
  for all to authenticated
  using (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

create policy client_payments_tenant on public.client_payments
  for all to authenticated
  using (agency_id = (select public.current_agency_id()))
  with check (agency_id = (select public.current_agency_id()));

-- Comisiones: el ADMIN ve todas las de su agencia; el asesor solo las suyas.
-- Sin políticas de escritura: solo las RPC SECURITY DEFINER las modifican.
create policy agent_commissions_select on public.agent_commissions
  for select to authenticated
  using (
    agency_id = (select public.current_agency_id())
    and ((select public.is_agency_admin()) or agent_id = (select auth.uid()))
  );

-- =============================================================================
-- Motor financiero en el servidor (réplica de lib/finance/calculations.ts)
-- =============================================================================
create function public.compute_dossier_financials(p_dossier_id uuid)
returns table (
  total_sale        numeric,
  total_net_cost    numeric,
  gross_margin      numeric,
  net_taxable_base  numeric,
  iva_generated     numeric,
  total_paid        numeric,
  balance_due       numeric,
  unpaid_providers  int
)
language sql
stable
set search_path = ''
as $$
  with svc as (
    select
      coalesce(sum(s.sale_price), 0) as sale,
      coalesce(sum(s.net_cost), 0)   as cost,
      count(*) filter (where not s.is_provider_paid)::int as unpaid
    from public.dossier_services s
    join public.quote_options q on q.id = s.quote_option_id
    where q.dossier_id = p_dossier_id and q.is_selected and not q.is_archived
  ),
  pay as (
    select coalesce(sum(amount), 0) as paid
    from public.client_payments
    where dossier_id = p_dossier_id
  ),
  m as (
    select svc.sale, svc.cost, svc.unpaid, pay.paid, round(svc.sale - svc.cost, 2) as margin
    from svc, pay
  )
  select
    m.sale,
    m.cost,
    m.margin,
    case when m.margin > 0 then round(m.margin / 1.19, 2) else m.margin end,
    case when m.margin > 0 then m.margin - round(m.margin / 1.19, 2) else 0 end,
    m.paid,
    greatest(m.sale - m.paid, 0),
    m.unpaid
  from m
$$;

-- FR-2.4: congela la opción aprobada, archiva las demás y abre la comisión HELD.
create function public.convert_quote_to_file(p_dossier_id uuid, p_option_id uuid)
returns public.travel_dossiers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency  uuid := public.current_agency_id();
  v_dossier public.travel_dossiers;
  v_fin     record;
  v_rate    numeric(5, 2);
begin
  if v_agency is null then
    raise exception 'Sesión sin agencia' using errcode = '42501';
  end if;

  select * into v_dossier
  from public.travel_dossiers
  where id = p_dossier_id and agency_id = v_agency
  for update;

  if not found then
    raise exception 'Expediente no encontrado' using errcode = 'P0002';
  end if;
  if v_dossier.status <> 'DRAFT' then
    raise exception 'Solo se convierten cotizaciones en DRAFT' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.quote_options
    where id = p_option_id and dossier_id = p_dossier_id and agency_id = v_agency
  ) then
    raise exception 'La opción no pertenece al expediente' using errcode = '22023';
  end if;

  perform set_config('app.dossier_rpc', 'on', true);

  -- Primero desmarcar para respetar el índice único de opción seleccionada.
  update public.quote_options set is_selected = false
  where dossier_id = p_dossier_id and id <> p_option_id;
  update public.quote_options
  set is_selected = (id = p_option_id), is_archived = (id <> p_option_id)
  where dossier_id = p_dossier_id;

  select * into v_fin from public.compute_dossier_financials(p_dossier_id);

  update public.travel_dossiers set
    status           = 'CONFIRMED',
    total_sale_price = v_fin.total_sale,
    total_net_cost   = v_fin.total_net_cost,
    gross_margin     = v_fin.gross_margin,
    net_utility_base = v_fin.net_taxable_base,
    iva_margin       = v_fin.iva_generated
  where id = p_dossier_id
  returning * into v_dossier;

  select default_commission_rate into v_rate
  from public.agency_users where id = v_dossier.agent_id;

  insert into public.agent_commissions
    (agency_id, dossier_id, agent_id, commission_percentage, calculated_amount, status)
  values (
    v_agency, p_dossier_id, v_dossier.agent_id, v_rate,
    greatest(round(v_fin.net_taxable_base * v_rate / 100, 2), 0), 'HELD'
  )
  on conflict (dossier_id) do update set
    commission_percentage = excluded.commission_percentage,
    calculated_amount     = excluded.calculated_amount,
    status                = 'HELD';

  perform set_config('app.dossier_rpc', 'off', true);
  return v_dossier;
end;
$$;

-- FR-4.3: liquida solo con cliente al 100 % y proveedores pagados; libera la comisión.
create function public.liquidate_dossier(p_dossier_id uuid)
returns public.travel_dossiers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency  uuid := public.current_agency_id();
  v_dossier public.travel_dossiers;
  v_fin     record;
  v_rate    numeric(5, 2);
begin
  if v_agency is null then
    raise exception 'Sesión sin agencia' using errcode = '42501';
  end if;

  select * into v_dossier
  from public.travel_dossiers
  where id = p_dossier_id and agency_id = v_agency
  for update;

  if not found then
    raise exception 'Expediente no encontrado' using errcode = 'P0002';
  end if;
  if v_dossier.status not in ('CONFIRMED', 'IN_PROGRESS') then
    raise exception 'El expediente debe estar confirmado' using errcode = '22023';
  end if;

  select * into v_fin from public.compute_dossier_financials(p_dossier_id);

  if v_fin.total_sale <= 0 then
    raise exception 'No hay servicios con valor de venta' using errcode = '22023';
  end if;
  if v_fin.balance_due > 0 then
    raise exception 'El cliente tiene saldo pendiente de %', v_fin.balance_due using errcode = '22023';
  end if;
  if v_fin.unpaid_providers > 0 then
    raise exception 'Hay % servicio(s) sin pago al proveedor', v_fin.unpaid_providers using errcode = '22023';
  end if;

  perform set_config('app.dossier_rpc', 'on', true);

  update public.travel_dossiers set
    status           = 'LIQUIDATED',
    liquidated_at    = now(),
    total_sale_price = v_fin.total_sale,
    total_net_cost   = v_fin.total_net_cost,
    gross_margin     = v_fin.gross_margin,
    net_utility_base = v_fin.net_taxable_base,
    iva_margin       = v_fin.iva_generated
  where id = p_dossier_id
  returning * into v_dossier;

  select default_commission_rate into v_rate
  from public.agency_users where id = v_dossier.agent_id;

  insert into public.agent_commissions
    (agency_id, dossier_id, agent_id, commission_percentage, calculated_amount, status)
  values (
    v_agency, p_dossier_id, v_dossier.agent_id, v_rate,
    greatest(round(v_fin.net_taxable_base * v_rate / 100, 2), 0), 'RELEASED'
  )
  on conflict (dossier_id) do update set
    -- Se respeta el porcentaje pactado al confirmar; el monto se recalcula con la base final.
    calculated_amount = greatest(
      round(v_fin.net_taxable_base * public.agent_commissions.commission_percentage / 100, 2), 0
    ),
    status = 'RELEASED';

  perform set_config('app.dossier_rpc', 'off', true);
  return v_dossier;
end;
$$;

-- Las funciones no se exponen a usuarios anónimos.
revoke execute on function public.current_agency_id()                    from public, anon;
revoke execute on function public.is_agency_admin()                      from public, anon;
revoke execute on function public.compute_dossier_financials(uuid)       from public, anon;
revoke execute on function public.convert_quote_to_file(uuid, uuid)      from public, anon;
revoke execute on function public.liquidate_dossier(uuid)                from public, anon;
grant  execute on function public.current_agency_id()                    to authenticated;
grant  execute on function public.is_agency_admin()                      to authenticated;
grant  execute on function public.compute_dossier_financials(uuid)       to authenticated;
grant  execute on function public.convert_quote_to_file(uuid, uuid)      to authenticated;
grant  execute on function public.liquidate_dossier(uuid)                to authenticated;

-- =============================================================================
-- Seed: mayoristas y operadores (IDs fijos = lib/data/providers.ts)
-- =============================================================================
insert into public.providers_catalog
  (id, name, category, default_currency, default_puc_account, payment_deadline_hours, is_system_preload)
values
  ('00000000-0000-4000-8000-000000000001', 'Mayorplus',                   'MAYORISTA',    'COP', '281505', 48, true),
  ('00000000-0000-4000-8000-000000000002', 'Grupo Bienvenidos',           'MAYORISTA',    'COP', '281505', 48, true),
  ('00000000-0000-4000-8000-000000000003', 'Ciclo Viajes',                'MAYORISTA',    'USD', '281505', 48, true),
  ('00000000-0000-4000-8000-000000000004', 'Turismo al Vuelo',            'MAYORISTA',    'COP', '281505', 48, true),
  ('00000000-0000-4000-8000-000000000005', 'Cielos Abiertos',             'MAYORISTA',    'USD', '281505', 48, true),
  ('00000000-0000-4000-8000-000000000006', 'Mega Travel Colombia',        'MAYORISTA',    'USD', '281505', 72, true),
  ('00000000-0000-4000-8000-000000000007', 'Hoteles Decameron',           'HOTEL',        'COP', '281505', 24, true),
  ('00000000-0000-4000-8000-000000000008', 'Hoteles Estelar',             'HOTEL',        'COP', '281505', 48, true),
  ('00000000-0000-4000-8000-000000000009', 'Travel Depot (Consolidador)', 'CONSOLIDADOR', 'COP', '281505',  6, true),
  ('00000000-0000-4000-8000-000000000010', 'Consolidador.com (Aviatur)',  'CONSOLIDADOR', 'COP', '281505', 12, true),
  ('00000000-0000-4000-8000-000000000011', 'Assist Card',                 'ASISTENCIA',   'USD', '281505', 24, true),
  ('00000000-0000-4000-8000-000000000012', 'Terrawind Global Protection', 'ASISTENCIA',   'USD', '281505', 24, true);
