-- =============================================================================
-- Gestión del equipo: el ADMIN invita asesores por correo y ajusta su rol,
-- tasa de comisión y estado. Sin service role: el invitado crea su cuenta
-- normal y, con el correo confirmado, acepta la invitación pendiente.
-- =============================================================================

create table public.agency_invitations (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies (id) on delete cascade,
  email           text not null check (email = lower(trim(email)) and email like '%_@_%'),
  full_name       text not null check (trim(full_name) <> ''),
  role            public.user_role not null default 'AGENT',
  commission_rate numeric(5, 2) not null default 15.00 check (commission_rate between 0 and 100),
  invited_by      uuid not null,
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  foreign key (agency_id, invited_by) references public.agency_users (agency_id, id)
);
create unique index agency_invitations_pending_uq
  on public.agency_invitations (agency_id, email) where accepted_at is null;
create index agency_invitations_email_idx on public.agency_invitations (email) where accepted_at is null;
create index agency_invitations_invited_by_idx on public.agency_invitations (agency_id, invited_by);

alter table public.agency_invitations enable row level security;

create policy agency_invitations_admin_select on public.agency_invitations
  for select to authenticated
  using (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()));
create policy agency_invitations_admin_insert on public.agency_invitations
  for insert to authenticated
  with check (
    agency_id = (select public.current_agency_id()) and (select public.is_agency_admin())
    and invited_by = (select auth.uid()) and accepted_at is null
  );
create policy agency_invitations_admin_delete on public.agency_invitations
  for delete to authenticated
  using (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()) and accepted_at is null);

-- ─── Siempre debe quedar al menos un ADMIN activo por agencia ────────────────
-- SECURITY DEFINER: debe ver a todos los usuarios de la agencia aunque el
-- ADMIN que edita se esté desactivando a sí mismo.
create function public.assert_agency_has_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Borrar la agencia completa (cascada) sí está permitido.
  if not exists (select 1 from public.agencies where id = old.agency_id) then
    return null;
  end if;
  if not exists (
    select 1 from public.agency_users
    where agency_id = old.agency_id and role = 'ADMIN' and is_active
  ) then
    raise exception 'La agencia debe conservar al menos un administrador activo' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger agency_users_keep_admin
  after update or delete on public.agency_users
  deferrable initially immediate
  for each row execute function public.assert_agency_has_admin();

-- Un usuario no puede cambiarse de agencia ni de identidad por UPDATE.
create function public.guard_agency_user_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.agency_id <> old.agency_id then
    raise exception 'No se puede mover un usuario de agencia' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger agency_users_identity_guard
  before update on public.agency_users
  for each row execute function public.guard_agency_user_identity();

-- ─── Onboarding del usuario sin agencia ──────────────────────────────────────
-- Devuelve si su cuenta está desactivada o las invitaciones pendientes a su
-- correo confirmado (solo los datos necesarios para decidir).
create function public.my_onboarding()
returns table (
  kind            text,
  invitation_id   uuid,
  agency_name     text,
  role            public.user_role,
  commission_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'INACTIVE', null::uuid, a.name, u.role, u.default_commission_rate
  from public.agency_users u
  join public.agencies a on a.id = u.agency_id
  where u.id = auth.uid() and not u.is_active

  union all

  select 'INVITATION', i.id, a.name, i.role, i.commission_rate
  from public.agency_invitations i
  join public.agencies a on a.id = i.agency_id
  join auth.users au on au.id = auth.uid()
  where i.accepted_at is null
    and au.email_confirmed_at is not null
    and i.email = lower(au.email)
    and not exists (select 1 from public.agency_users where id = auth.uid())
$$;

create function public.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.agency_invitations;
begin
  if v_uid is null then
    raise exception 'Debe iniciar sesión' using errcode = '42501';
  end if;
  if exists (select 1 from public.agency_users where id = v_uid) then
    raise exception 'El usuario ya pertenece a una agencia' using errcode = '22023';
  end if;

  select i.* into v_inv
  from public.agency_invitations i
  join auth.users au on au.id = v_uid
  where i.id = p_invitation_id
    and i.accepted_at is null
    and au.email_confirmed_at is not null
    and i.email = lower(au.email)
  for update of i;

  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;

  insert into public.agency_users (id, agency_id, full_name, role, default_commission_rate)
  values (v_uid, v_inv.agency_id, v_inv.full_name, v_inv.role, v_inv.commission_rate);

  update public.agency_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.agency_id;
end;
$$;

revoke execute on function public.assert_agency_has_admin() from public, anon, authenticated;
revoke execute on function public.my_onboarding()          from public, anon;
revoke execute on function public.accept_invitation(uuid)  from public, anon;
grant  execute on function public.my_onboarding()          to authenticated;
grant  execute on function public.accept_invitation(uuid)  to authenticated;
