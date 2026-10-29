/**
 * Acceso a datos de expedientes en Supabase.
 *
 * Traduce filas (snake_case, `numeric`) ↔ tipos de dominio (camelCase). Nunca
 * envía `agency_id` elegido por el cliente sin que la RLS lo valide: las RPC
 * lo toman de la sesión y los INSERT directos pasan por las políticas
 * `agency_id = current_agency_id()`.
 */

import type {
  ClientPayment,
  Currency,
  Dossier,
  DossierService,
  Provider,
  ProviderPayment,
  QuoteOption,
} from "@/lib/finance/types";
import { getSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type ServiceRow = Tables["dossier_services"]["Row"];
type OptionRow = Tables["quote_options"]["Row"] & { dossier_services: ServiceRow[] };
type PaymentRow = Tables["client_payments"]["Row"];
type ProviderRow = Tables["providers_catalog"]["Row"];
type ProviderPaymentRow = Tables["provider_payments"]["Row"];

/** Error con mensaje listo para mostrar al asesor. */
export class RepositoryError extends Error {}

export function fail(error: { message: string } | null, fallback: string): never {
  throw new RepositoryError(error?.message ?? fallback);
}

export const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v));

function toService(row: ServiceRow): DossierService {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    serviceType: row.service_type,
    description: row.description,
    bookingReference: row.booking_reference ?? "",
    currency: row.currency as Currency,
    exchangeRate: num(row.exchange_rate),
    netCostOriginal: num(row.net_cost_original),
    salePrice: num(row.sale_price),
    paymentDeadline: row.payment_deadline,
    isProviderPaid: row.is_provider_paid,
  };
}

function toOption(row: OptionRow): QuoteOption {
  return {
    id: row.id,
    title: row.option_title,
    isSelected: row.is_selected,
    isArchived: row.is_archived,
    services: [...row.dossier_services]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(toService),
  };
}

function toPayment(row: PaymentRow): ClientPayment {
  return {
    id: row.id,
    amount: num(row.amount),
    method: row.payment_method,
    paidAt: row.paid_at,
    receiptNumber: row.receipt_number ?? "",
    notes: row.notes ?? "",
  };
}

function toProviderPayment(row: ProviderPaymentRow): ProviderPayment {
  return {
    id: row.id,
    serviceId: row.service_id,
    currency: row.currency as Currency,
    amountOriginal: num(row.amount_original),
    exchangeRate: num(row.exchange_rate),
    amountCop: num(row.amount_cop),
    method: row.payment_method,
    paidAt: row.paid_at,
    reference: row.reference ?? "",
    bookingReference: row.booking_reference ?? "",
    notes: row.notes ?? "",
  };
}

export function toProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    category: row.category,
    nit: row.nit,
    defaultCurrency: row.default_currency as Currency,
    defaultPucAccount: row.default_puc_account,
    paymentDeadlineHours: row.payment_deadline_hours,
    isSystemPreload: row.is_system_preload,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    bankDetails: row.bank_details,
  };
}

/** Carga el expediente completo y el catálogo de proveedores visible para la agencia. */
export async function fetchDossier(id: string): Promise<{ dossier: Dossier; providers: Provider[] }> {
  const sb = getSupabase();
  const { data: row, error } = await sb.from("travel_dossiers").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "No se pudo cargar el expediente.");
  // Con RLS, un ID de otra agencia simplemente no existe.
  if (!row) throw new RepositoryError("Expediente no encontrado.");

  const [client, agent, agency, options, payments, commission, providers, providerPayments] = await Promise.all([
    sb.from("clients").select("id, document_number, full_name, whatsapp").eq("id", row.client_id).single(),
    sb.from("agency_users").select("id, full_name, default_commission_rate").eq("id", row.agent_id).single(),
    sb.from("agencies").select("name, nit, address, city, phone, logo_url").eq("id", row.agency_id).single(),
    sb.from("quote_options").select("*, dossier_services(*)").eq("dossier_id", id).order("created_at"),
    sb.from("client_payments").select("*").eq("dossier_id", id).order("paid_at"),
    sb.from("agent_commissions").select("commission_percentage").eq("dossier_id", id).maybeSingle(),
    sb.from("providers_catalog").select("*").order("is_system_preload", { ascending: false }).order("name"),
    sb.from("provider_payments").select("*").eq("dossier_id", id).order("paid_at"),
  ]);
  for (const r of [client, agent, agency, options, payments, providers, providerPayments]) {
    if (r.error) fail(r.error, "No se pudo cargar el expediente.");
  }

  const dossier: Dossier = {
    id: row.id,
    agencyId: row.agency_id,
    agencyName: agency.data!.name,
    agencyNit: agency.data!.nit,
    agencyAddress: agency.data!.address,
    agencyCity: agency.data!.city,
    agencyPhone: agency.data!.phone,
    agencyLogoUrl: agency.data!.logo_url,
    code: row.dossier_code,
    destinationTitle: row.destination_title,
    departureDate: row.departure_date,
    returnDate: row.return_date,
    adultsCount: row.adults_count,
    childrenCount: row.children_count,
    status: row.status,
    client: {
      id: client.data!.id,
      documentNumber: client.data!.document_number,
      fullName: client.data!.full_name,
      whatsapp: client.data!.whatsapp,
    },
    agent: {
      id: agent.data!.id,
      fullName: agent.data!.full_name,
      // La tasa pactada al confirmar manda sobre la tasa por defecto del asesor.
      commissionRate: num(commission.data?.commission_percentage ?? agent.data!.default_commission_rate),
    },
    options: (options.data as OptionRow[]).map(toOption),
    payments: (payments.data ?? []).map(toPayment),
    providerPayments: (providerPayments.data ?? []).map(toProviderPayment),
    liquidatedAt: row.liquidated_at,
  };

  return { dossier, providers: (providers.data ?? []).map(toProvider) };
}

/** Autoguardado: sincroniza opciones y servicios en una sola transacción (RPC). */
export async function syncOptions(dossierId: string, options: readonly QuoteOption[]): Promise<void> {
  const payload = options.map((o) => ({
    id: o.id,
    title: o.title,
    services: o.services.map((s) => ({ ...s })),
  }));
  const { error } = await getSupabase().rpc("sync_dossier_options", {
    p_dossier_id: dossierId,
    p_options: payload,
  });
  if (error) fail(error, "No se pudieron guardar los cambios.");
}

export async function convertQuoteToFile(dossierId: string, optionId: string): Promise<void> {
  const { error } = await getSupabase().rpc("convert_quote_to_file", {
    p_dossier_id: dossierId,
    p_option_id: optionId,
  });
  if (error) fail(error, "No se pudo confirmar la cotización.");
}

export async function liquidateDossier(dossierId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("liquidate_dossier", { p_dossier_id: dossierId });
  if (error) fail(error, "No se pudo liquidar el expediente.");
  return data.liquidated_at ?? new Date().toISOString();
}

export async function insertPayment(
  dossier: Pick<Dossier, "id" | "agencyId">,
  payment: Omit<ClientPayment, "id">,
): Promise<ClientPayment> {
  const { data, error } = await getSupabase()
    .from("client_payments")
    .insert({
      agency_id: dossier.agencyId,
      dossier_id: dossier.id,
      amount: payment.amount,
      payment_method: payment.method,
      paid_at: payment.paidAt,
      receipt_number: payment.receiptNumber || null,
      notes: payment.notes || null,
    })
    .select()
    .single();
  if (error) fail(error, "No se pudo registrar el abono.");
  return toPayment(data);
}

export async function insertProviderPayment(
  dossier: Pick<Dossier, "id" | "agencyId">,
  payment: Omit<ProviderPayment, "id" | "amountCop">,
): Promise<ProviderPayment> {
  const { data, error } = await getSupabase()
    .from("provider_payments")
    .insert({
      agency_id: dossier.agencyId,
      dossier_id: dossier.id,
      service_id: payment.serviceId,
      currency: payment.currency,
      amount_original: payment.amountOriginal,
      exchange_rate: payment.currency === "COP" ? 1 : payment.exchangeRate,
      payment_method: payment.method,
      paid_at: payment.paidAt,
      reference: payment.reference || null,
      booking_reference: payment.bookingReference || null,
      notes: payment.notes || null,
    })
    .select()
    .single();
  if (error) fail(error, "No se pudo registrar el pago al proveedor.");
  return toProviderPayment(data);
}

export async function deleteProviderPayment(paymentId: string): Promise<void> {
  const { error } = await getSupabase().from("provider_payments").delete().eq("id", paymentId);
  if (error) fail(error, "No se pudo anular el pago al proveedor.");
}

export async function deletePayment(paymentId: string): Promise<void> {
  const { error } = await getSupabase().from("client_payments").delete().eq("id", paymentId);
  if (error) fail(error, "No se pudo anular el abono.");
}

export async function insertProvider(provider: Provider): Promise<void> {
  if (!provider.agencyId) throw new RepositoryError("Proveedor sin agencia.");
  const { error } = await getSupabase().from("providers_catalog").insert({
    id: provider.id,
    agency_id: provider.agencyId,
    name: provider.name,
    category: provider.category,
    default_currency: provider.defaultCurrency,
    payment_deadline_hours: provider.paymentDeadlineHours,
    is_system_preload: false,
  });
  if (error) fail(error, "No se pudo crear el proveedor.");
}

// ─── Listado y Apertura Flash ────────────────────────────────────────────────

export interface DossierListItem {
  id: string;
  code: string;
  title: string;
  clientName: string;
  departureDate: string;
  returnDate: string;
  status: Dossier["status"];
  totalSale: number;
}

export async function listDossiers(): Promise<DossierListItem[]> {
  const { data, error } = await getSupabase()
    .from("travel_dossiers")
    .select("id, dossier_code, destination_title, departure_date, return_date, status, total_sale_price, clients(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail(error, "No se pudieron cargar los expedientes.");
  return data.map((d) => ({
    id: d.id,
    code: d.dossier_code,
    title: d.destination_title,
    clientName: (d.clients as { full_name: string } | null)?.full_name ?? "—",
    departureDate: d.departure_date,
    returnDate: d.return_date,
    status: d.status,
    totalSale: num(d.total_sale_price),
  }));
}

export interface NewDossierInput {
  clientDocument: string;
  clientName: string;
  clientWhatsapp: string;
  title: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
}

export async function createDossier(input: NewDossierInput): Promise<string> {
  const { data, error } = await getSupabase().rpc("create_dossier", {
    p_client_document: input.clientDocument,
    p_client_name: input.clientName,
    p_client_whatsapp: input.clientWhatsapp,
    p_title: input.title,
    p_departure: input.departureDate,
    p_return: input.returnDate,
    p_adults: input.adults,
    p_children: input.children,
  });
  if (error) fail(error, "No se pudo crear el expediente.");
  return data;
}

export async function registerAgency(agencyName: string, nit: string, fullName: string): Promise<void> {
  const { error } = await getSupabase().rpc("register_agency", {
    p_agency_name: agencyName,
    p_nit: nit,
    p_full_name: fullName,
  });
  if (error) {
    fail(
      error.message.includes("agencies_nit_key") ? { message: "Ya existe una agencia con ese NIT." } : error,
      "No se pudo registrar la agencia.",
    );
  }
}
