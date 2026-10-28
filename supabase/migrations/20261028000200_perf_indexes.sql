-- Índices que cubren las FK compuestas (advisor 0001_unindexed_foreign_keys).
create index agent_commissions_agency_dossier_idx on public.agent_commissions (agency_id, dossier_id);
create index client_payments_agency_dossier_idx   on public.client_payments (agency_id, dossier_id);
create index client_payments_registered_by_idx    on public.client_payments (agency_id, registered_by);
create index dossier_services_agency_option_idx   on public.dossier_services (agency_id, quote_option_id);
create index dossier_services_provider_idx        on public.dossier_services (provider_id);
create index quote_options_agency_dossier_idx     on public.quote_options (agency_id, dossier_id);
create index travel_dossiers_agency_client_idx    on public.travel_dossiers (agency_id, client_id);

-- Una sola política permisiva por acción en agency_users (advisor 0006).
drop policy agency_users_admin_write on public.agency_users;
create policy agency_users_admin_insert on public.agency_users
  for insert to authenticated
  with check (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()));
create policy agency_users_admin_update on public.agency_users
  for update to authenticated
  using (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()))
  with check (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()));
create policy agency_users_admin_delete on public.agency_users
  for delete to authenticated
  using (agency_id = (select public.current_agency_id()) and (select public.is_agency_admin()));
