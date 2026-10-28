-- =============================================================================
-- Configuración de la agencia: dirección y logo (además de nombre, NIT,
-- teléfono/WhatsApp y ciudad, que ya existían). El ADMIN edita por la política
-- agencies_update; el logo vive en Storage, carpeta = id de la agencia.
-- =============================================================================

alter table public.agencies
  add column address  text,
  add column logo_url text;

alter table public.agencies
  add constraint agencies_name_not_blank check (trim(name) <> ''),
  add constraint agencies_nit_not_blank  check (trim(nit) <> '');

-- Bucket público de lectura (el logo sale en recibos y documentos impresos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agency-logos', 'agency-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- Escritura: solo el ADMIN, solo dentro de la carpeta de su agencia.
create policy agency_logos_admin_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agency-logos'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
    and (select public.is_agency_admin())
  );
create policy agency_logos_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agency-logos'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
    and (select public.is_agency_admin())
  );
create policy agency_logos_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'agency-logos'
    and (storage.foldername(name))[1] = (select public.current_agency_id())::text
    and (select public.is_agency_admin())
  );
