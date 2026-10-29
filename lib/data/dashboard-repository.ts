/**
 * FR-1.1 Semáforo del tablero y FR-5.2 datos para la exportación contable.
 * Todo pasa por la RLS de la sesión.
 */

import type { LiquidatedDossier, ProviderTransfer } from "@/lib/accounting/export";
import { getSupabase } from "@/lib/supabase/client";
import { fail, num } from "./dossier-repository";

export type AlertKind = "PROVIDER_DUE" | "CLIENT_DUE" | "DEPARTURE";

export interface DashboardAlert {
  kind: AlertKind;
  dossierId: string;
  dossierCode: string;
  title: string;
  clientName: string;
  dueAt: string | null;
  amount: number | null;
  /** Proveedor, en las alertas PROVIDER_DUE. */
  detail: string | null;
  pax: number;
}

export async function fetchDashboardAlerts(): Promise<DashboardAlert[]> {
  const { data, error } = await getSupabase().rpc("dashboard_alerts");
  if (error) fail(error, "No se pudieron cargar las alertas.");
  return data.map((r) => ({
    kind: r.kind as AlertKind,
    dossierId: r.dossier_id,
    dossierCode: r.dossier_code,
    title: r.title,
    clientName: r.client_name,
    dueAt: r.due_at,
    amount: r.amount == null ? null : num(r.amount),
    detail: r.detail,
    pax: r.pax,
  }));
}

/** Expedientes liquidados en [from, to) con lo necesario para el comprobante contable. */
export async function fetchLiquidatedDossiers(fromIso: string, toIso: string): Promise<LiquidatedDossier[]> {
  const { data, error } = await getSupabase()
    .from("travel_dossiers")
    .select(
      "id, dossier_code, destination_title, liquidated_at, total_sale_price, total_net_cost, net_utility_base, iva_margin, " +
        "clients(document_number, full_name), agency_users(full_name), agent_commissions(calculated_amount), " +
        "quote_options(is_selected, dossier_services(provider_name, net_cost, providers_catalog(nit)))",
    )
    .eq("status", "LIQUIDATED")
    .gte("liquidated_at", fromIso)
    .lt("liquidated_at", toIso)
    .order("liquidated_at");
  if (error) fail(error, "No se pudieron cargar los expedientes liquidados.");

  type Row = {
    id: string;
    dossier_code: string;
    destination_title: string;
    liquidated_at: string;
    total_sale_price: number;
    total_net_cost: number;
    net_utility_base: number;
    iva_margin: number;
    clients: { document_number: string; full_name: string } | null;
    agency_users: { full_name: string } | null;
    agent_commissions: { calculated_amount: number }[] | { calculated_amount: number } | null;
    quote_options: {
      is_selected: boolean;
      dossier_services: { provider_name: string; net_cost: number; providers_catalog: { nit: string | null } | null }[];
    }[];
  };

  return (data as unknown as Row[]).map((r) => {
    const commission = Array.isArray(r.agent_commissions) ? r.agent_commissions[0] : r.agent_commissions;
    const selected = r.quote_options.find((o) => o.is_selected);
    return {
      code: r.dossier_code,
      title: r.destination_title,
      liquidatedAt: r.liquidated_at,
      clientDocument: r.clients?.document_number ?? "",
      clientName: r.clients?.full_name ?? "",
      agentName: r.agency_users?.full_name ?? "",
      totalSale: num(r.total_sale_price),
      totalCost: num(r.total_net_cost),
      taxableBase: num(r.net_utility_base),
      iva: num(r.iva_margin),
      commission: num(commission?.calculated_amount),
      providers: (selected?.dossier_services ?? []).map((s) => ({
        name: s.provider_name,
        nit: s.providers_catalog?.nit ?? "",
        cost: num(s.net_cost),
      })),
    };
  });
}

/** Giros a proveedores con fecha de pago en [from, to), para sus comprobantes de salida de caja. */
export async function fetchProviderTransfers(fromIso: string, toIso: string): Promise<ProviderTransfer[]> {
  const { data, error } = await getSupabase()
    .from("provider_payments")
    .select(
      "id, paid_at, currency, amount_original, amount_cop, reference, booking_reference, " +
        "travel_dossiers(dossier_code, destination_title), dossier_services(provider_name, exchange_rate, providers_catalog(nit))",
    )
    .gte("paid_at", fromIso)
    .lt("paid_at", toIso)
    .order("paid_at");
  if (error) fail(error, "No se pudieron cargar los pagos a proveedores.");

  type Row = {
    id: string;
    paid_at: string;
    currency: "COP" | "USD";
    amount_original: number;
    amount_cop: number;
    reference: string | null;
    booking_reference: string | null;
    travel_dossiers: { dossier_code: string; destination_title: string } | null;
    dossier_services: { provider_name: string; exchange_rate: number; providers_catalog: { nit: string | null } | null } | null;
  };

  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    dossierCode: r.travel_dossiers?.dossier_code ?? "",
    dossierTitle: r.travel_dossiers?.destination_title ?? "",
    paidAt: r.paid_at,
    providerName: r.dossier_services?.provider_name ?? "",
    providerNit: r.dossier_services?.providers_catalog?.nit ?? "",
    currency: r.currency,
    amountOriginal: num(r.amount_original),
    quotedRate: r.currency === "COP" ? 1 : num(r.dossier_services?.exchange_rate),
    amountCop: num(r.amount_cop),
    reference: r.reference ?? "",
    bookingReference: r.booking_reference ?? "",
  }));
}
