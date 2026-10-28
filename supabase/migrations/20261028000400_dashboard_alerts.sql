-- =============================================================================
-- FR-1.1 Semáforo del tablero. SECURITY INVOKER: la RLS limita todo a la
-- agencia de la sesión. Fechas en hora de Colombia.
--
--   PROVIDER_DUE  🔴 servicios de la opción aprobada sin pagar al proveedor con
--                   time-limit vencido o en las próximas 24 h.
--   CLIENT_DUE    🟡 expedientes activos con saldo del cliente cuyo próximo
--                   time-limit de proveedor o fecha de salida cae antes del fin
--                   de la semana en curso (o ya pasó).
--   DEPARTURE     🟢 expedientes activos que salen hoy, mañana o pasado.
-- =============================================================================

create function public.dashboard_alerts()
returns table (
  kind          text,
  dossier_id    uuid,
  dossier_code  text,
  title         text,
  client_name   text,
  due_at        timestamptz,
  amount        numeric,
  detail        text,
  pax           int
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      now() as now_ts,
      (now() at time zone 'America/Bogota')::date as today,
      -- Domingo 23:59:59 de la semana en curso (las semanas empiezan el lunes).
      ((date_trunc('week', now() at time zone 'America/Bogota') + interval '7 days') at time zone 'America/Bogota')
        - interval '1 second' as week_end
  ),
  active as (
    select d.*, c.full_name as client_name
    from public.travel_dossiers d
    join public.clients c on c.id = d.client_id
    where d.status in ('CONFIRMED', 'IN_PROGRESS')
  ),
  pending_services as (
    select a.id as dossier_id, s.id, s.provider_name, s.net_cost, s.payment_deadline
    from active a
    join public.quote_options q on q.dossier_id = a.id and q.is_selected and not q.is_archived
    join public.dossier_services s on s.quote_option_id = q.id
    where not s.is_provider_paid
  )
  -- 🔴 Pagos a mayoristas
  select 'PROVIDER_DUE', a.id, a.dossier_code, a.destination_title, a.client_name,
         ps.payment_deadline, ps.net_cost, ps.provider_name, a.adults_count + a.children_count
  from pending_services ps
  join active a on a.id = ps.dossier_id, params p
  where ps.payment_deadline <= p.now_ts + interval '24 hours'

  union all

  -- 🟡 Abonos de clientes
  select 'CLIENT_DUE', a.id, a.dossier_code, a.destination_title, a.client_name,
         due.due_at, f.balance_due, null, a.adults_count + a.children_count
  from active a
  cross join params p
  cross join lateral public.compute_dossier_financials(a.id) f
  cross join lateral (
    select least(
      (select min(ps.payment_deadline) from pending_services ps where ps.dossier_id = a.id),
      (a.departure_date::timestamp at time zone 'America/Bogota')
    ) as due_at
  ) due
  where f.balance_due > 0 and due.due_at <= p.week_end

  union all

  -- 🟢 Salidas próximas
  select 'DEPARTURE', a.id, a.dossier_code, a.destination_title, a.client_name,
         a.departure_date::timestamp at time zone 'America/Bogota', null, null,
         a.adults_count + a.children_count
  from active a, params p
  where a.departure_date between p.today and p.today + 2

  order by 6 nulls last
$$;

revoke execute on function public.dashboard_alerts() from public, anon;
grant  execute on function public.dashboard_alerts() to authenticated;
