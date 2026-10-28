-- =============================================================================
-- FR-4.4 Corte de comisiones: el ADMIN pasa en lote comisiones RELEASED a PAID.
-- Todas las comisiones del lote comparten settlement_batch_id y paid_at, que
-- identifican la cuenta de cobro generada.
-- =============================================================================

create function public.settle_commissions(p_commission_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency  uuid := public.current_agency_id();
  v_batch   uuid := gen_random_uuid();
  v_ids     uuid[];
begin
  if v_agency is null or not public.is_agency_admin() then
    raise exception 'Solo el administrador puede pagar comisiones' using errcode = '42501';
  end if;

  select array_agg(distinct id) into v_ids from unnest(p_commission_ids) as id where id is not null;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'No hay comisiones seleccionadas' using errcode = '22023';
  end if;

  -- Bloqueo + validación: todas deben ser de la agencia y estar liberadas.
  perform 1 from public.agent_commissions
  where id = any (v_ids) and agency_id = v_agency
  for update;

  if (select count(*) from public.agent_commissions
      where id = any (v_ids) and agency_id = v_agency and status = 'RELEASED') <> cardinality(v_ids) then
    raise exception 'Solo se pueden pagar comisiones liberadas de tu agencia' using errcode = '22023';
  end if;

  update public.agent_commissions set
    status              = 'PAID',
    settlement_batch_id = v_batch,
    paid_at             = now()
  where id = any (v_ids) and agency_id = v_agency;

  return v_batch;
end;
$$;

revoke execute on function public.settle_commissions(uuid[]) from public, anon;
grant  execute on function public.settle_commissions(uuid[]) to authenticated;
