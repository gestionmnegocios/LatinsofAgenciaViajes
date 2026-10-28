/**
 * FR-1.1 Semáforo del tablero y FR-5.2 datos para la exportación contable.
 * Todo pasa por la RLS de la sesión.
 */

import type { LiquidatedDossier } from "@/lib/accounting/export";
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
