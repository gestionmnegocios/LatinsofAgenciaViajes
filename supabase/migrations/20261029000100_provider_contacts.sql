-- =============================================================================
-- Ficha del proveedor propio: contacto y datos bancarios para los giros.
-- Las políticas existentes ya permiten a la agencia crear, editar y borrar
-- sus proveedores (nunca los precargados del sistema).
-- =============================================================================

alter table public.providers_catalog
  add column contact_name text,
  add column phone        text,
  add column email        text,
  add column bank_details text;  -- Banco, tipo y número de cuenta para giros

alter table public.providers_catalog
  add constraint providers_catalog_name_not_blank check (trim(name) <> '');
