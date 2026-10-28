/**
 * FR-4.4 Corte de comisiones. La RLS decide qué se ve: el ADMIN todas las de
 * su agencia, el asesor solo las suyas. El pago en lote va por la RPC
 * `settle_commissions` (solo ADMIN, solo RELEASED).
 */

import type { CommissionStatus } from "@/lib/finance/types";
import { getSupabase } from "@/lib/supabase/client";
import { fail, num } from "./dossier-repository";

export interface CommissionItem {
  id: string;
  agentId: string;
  agentName: string;
  dossierId: string;
  dossierCode: string;
  dossierTitle: string;
  clientName: string;
  liquidatedAt: string | null;
  /** Base gravable neta del expediente (cuenta 4155) sobre la que se calcula. */
  taxableBase: number;
  percentage: number;
  amount: number;
  status: CommissionStatus;
  batchId: string | null;
  paidAt: string | null;
}

export interface AgencyInfo {
  name: string;
  nit: string;
  city: string | null;
}

export async function listCommissions(): Promise<CommissionItem[]> {
  const { data, error } = await getSupabase()
    .from("agent_commissions")
    .select(
      "id, agent_id, dossier_id, commission_percentage, calculated_amount, status, settlement_batch_id, paid_at, " +
        "agency_users(full_name), travel_dossiers(dossier_code, destination_title, liquidated_at, net_utility_base, clients(full_name))",
    )
    .order("created_at", { ascending: false });
  if (error) fail(error, "No se pudieron cargar las comisiones.");

  type Row = {
    id: string;
    agent_id: string;
    dossier_id: string;
    commission_percentage: number;
    calculated_amount: number;
    status: CommissionStatus;
    settlement_batch_id: string | null;
    paid_at: string | null;
    agency_users: { full_name: string } | null;
    travel_dossiers: {
      dossier_code: string;
      destination_title: string;
      liquidated_at: string | null;
      net_utility_base: number | null;
      clients: { full_name: string } | null;
    } | null;
  };

  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    agentName: r.agency_users?.full_name ?? "—",
    dossierId: r.dossier_id,
    dossierCode: r.travel_dossiers?.dossier_code ?? "—",
    dossierTitle: r.travel_dossiers?.destination_title ?? "",
    clientName: r.travel_dossiers?.clients?.full_name ?? "—",
    liquidatedAt: r.travel_dossiers?.liquidated_at ?? null,
    taxableBase: num(r.travel_dossiers?.net_utility_base),
    percentage: num(r.commission_percentage),
    amount: num(r.calculated_amount),
    status: r.status,
    batchId: r.settlement_batch_id,
    paidAt: r.paid_at,
  }));
}

/** Pasa el lote a PAID y devuelve el ID del lote (cuenta de cobro). */
export async function settleCommissions(ids: readonly string[]): Promise<string> {
  const { data, error } = await getSupabase().rpc("settle_commissions", { p_commission_ids: [...ids] });
  if (error) fail(error, "No se pudo registrar el pago.");
  return data;
}

export async function fetchAgencyInfo(agencyId: string): Promise<AgencyInfo> {
  const { data, error } = await getSupabase().from("agencies").select("name, nit, city").eq("id", agencyId).single();
  if (error) fail(error, "No se pudo cargar la agencia.");
  return data;
}
