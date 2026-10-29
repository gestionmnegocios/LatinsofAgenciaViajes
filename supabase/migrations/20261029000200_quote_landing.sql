-- =============================================================================
-- Micro-landing de la cotización
--
--   agency_images  Banco de hasta 10 imágenes por agencia (Storage público).
--   quote_shares   Enlace público de una cotización (token secreto) con las
--                  imágenes elegidas y la opción que el cliente marcó «Lo quiero».
--
-- El público (anon) no lee tablas: solo las RPC get_quote_share y
-- accept_quote_share, que exigen el token y nunca exponen costos ni márgenes.
-- =============================================================================

-- ─── Banco de imágenes ───────────────────────────────────────────────────────
create table public.agency_images (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies (id) on delete cascade,
  storage_path text not null,
  url          text not null,
  caption      text,
  created_at   timestamptz not null default now()
);
create index agency_images_agency_idx on public.agency_images (agency_id, created_at);

alter table public.agency_images enable row level security;
create policy agency_images_select on public.agency_images
  for select to authenticated using (agency_id = (select public.current_agency_id()));
create policy agency_images_admin_insert on public.agency_images
  for insert to authenticated
  with check (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()));
create policy agency_images_admin_update on public.agency_images
  for update to authenticated
  using (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()))
  with check (agency_id = (select public.current_agency_id()));
create policy agency_images_admin_delete on public.agency_images
  for delete to authenticated
  using (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()));

-- Máximo 10 por agencia (con bloqueo para que dos subidas simultáneas no pasen el tope).
create function public.assert_image_bank_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('agency_images:' || new.agency_id::text));
  if (select count(*) from public.agency_images where agency_id = new.agency_id) >= 10 then
    raise exception 'El banco admite máximo 10 imágenes; elimina una para subir otra' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger agency_images_limit
  before insert on public.agency_images
  for each row execute function public.assert_image_bank_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agency-images', 'agency-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy agency_images_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agency-images'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
    and (select public.is_agency_admin())
  );
create policy agency_images_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agency-images'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
    and (select public.is_agency_admin())
  );
create policy agency_images_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'agency-images'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
    and (select public.is_agency_admin())
  );

-- ─── Enlaces públicos de cotización ──────────────────────────────────────────
create table public.quote_shares (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null,
  dossier_id         uuid not null,
  token              uuid not null unique default gen_random_uuid(),
  image_ids          uuid[] not null default '{}' check (cardinality(image_ids) <= 10),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  accepted_option_id uuid,
  accepted_at        timestamptz,
  foreign key (agency_id, dossier_id) references public.travel_dossiers (agency_id, id) on delete cascade,
  foreign key (agency_id, created_by) references public.agency_users (agency_id, id)
);
create index quote_shares_dossier_idx    on public.quote_shares (agency_id, dossier_id);
create index quote_shares_created_by_idx on public.quote_shares (agency_id, created_by);

alter table public.quote_shares enable row level security;
create policy quote_shares_select on public.quote_shares
  for select to authenticated using (agency_id = (select public.current_agency_id()));
create policy quote_shares_insert on public.quote_shares
  for insert to authenticated
  with check (agency_id = (select public.current_agency_id()) and accepted_option_id is null and accepted_at is null);
create policy quote_shares_delete on public.quote_shares
  for delete to authenticated using (agency_id = (select public.current_agency_id()));

-- Lectura pública por token: solo precios de venta, descripciones e imágenes.
create function public.get_quote_share(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code',          d.dossier_code,
    'status',        d.status,
    'title',         d.destination_title,
    'departureDate', d.departure_date,
    'returnDate',    d.return_date,
    'adults',        d.adults_count,
    'children',      d.children_count,
    'clientFirstName', split_part(c.full_name, ' ', 1),
    'agency', jsonb_build_object(
      'name', a.name, 'logoUrl', a.logo_url, 'phone', a.phone, 'address', a.address, 'city', a.city
    ),
    'acceptedOptionId', s.accepted_option_id,
    'acceptedAt',       s.accepted_at,
    'validUntil', (
      select min(sv.payment_deadline)
      from public.quote_options q
      join public.dossier_services sv on sv.quote_option_id = q.id
      where q.dossier_id = d.id and not q.is_archived and sv.payment_deadline > now()
    ),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object('url', i.url, 'caption', i.caption) order by x.ord)
      from unnest(s.image_ids) with ordinality as x(id, ord)
      join public.agency_images i on i.id = x.id and i.agency_id = s.agency_id
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         q.id,
        'isSelected', q.is_selected,
        'total',      (select coalesce(sum(sv.sale_price), 0) from public.dossier_services sv where sv.quote_option_id = q.id),
        'services',   coalesce((
          select jsonb_agg(jsonb_build_object('type', sv.service_type, 'description', sv.description) order by sv.created_at)
          from public.dossier_services sv where sv.quote_option_id = q.id
        ), '[]'::jsonb)
      ) order by q.created_at)
      from public.quote_options q
      where q.dossier_id = d.id and not q.is_archived
        and exists (select 1 from public.dossier_services sv where sv.quote_option_id = q.id and sv.sale_price > 0)
    ), '[]'::jsonb)
  )
  from public.quote_shares s
  join public.travel_dossiers d on d.id = s.dossier_id
  join public.clients c on c.id = d.client_id
  join public.agencies a on a.id = s.agency_id
  where s.token = p_token
$$;

-- «Lo quiero»: registra la opción elegida mientras la cotización siga abierta.
-- No confirma el expediente; eso lo hace el asesor desde el Workspace.
create function public.accept_quote_share(p_token uuid, p_option_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share  public.quote_shares;
  v_status public.dossier_status;
begin
  select * into v_share from public.quote_shares where token = p_token for update;
  if not found then
    raise exception 'Enlace no válido' using errcode = 'P0002';
  end if;

  select status into v_status from public.travel_dossiers where id = v_share.dossier_id;
  if v_status <> 'DRAFT' then
    raise exception 'Esta cotización ya fue confirmada' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.quote_options
    where id = p_option_id and dossier_id = v_share.dossier_id and not is_archived
  ) then
    raise exception 'Opción no válida' using errcode = '22023';
  end if;

  update public.quote_shares
  set accepted_option_id = p_option_id, accepted_at = now()
  where id = v_share.id;

  return public.get_quote_share(p_token);
end;
$$;

revoke execute on function public.assert_image_bank_limit()          from public, anon, authenticated;
revoke execute on function public.get_quote_share(uuid)              from public;
revoke execute on function public.accept_quote_share(uuid, uuid)     from public;
grant  execute on function public.get_quote_share(uuid)              to anon, authenticated;
grant  execute on function public.accept_quote_share(uuid, uuid)     to anon, authenticated;
