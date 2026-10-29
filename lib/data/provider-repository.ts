/**
 * Catálogo de proveedores: los precargados del sistema (solo lectura) y los
 * propios de la agencia, que cualquier miembro puede crear y editar (RLS).
 */

import type { Currency, Provider, ProviderCategory } from "@/lib/finance/types";
import { getSupabase } from "@/lib/supabase/client";
import { fail, toProvider } from "./dossier-repository";

export const PROVIDER_CATEGORY_LABELS: Record<ProviderCategory, string> = {
  MAYORISTA: "Mayorista",
  CONSOLIDADOR: "Consolidador aéreo",
  HOTEL: "Hotel",
  ASISTENCIA: "Asistencia médica",
  OPERADOR_LOCAL: "Operador local / receptivo",
};

export interface ProviderInput {
  name: string;
  category: ProviderCategory;
  nit: string;
  defaultCurrency: Currency;
  paymentDeadlineHours: number;
  contactName: string;
  phone: string;
  email: string;
  bankDetails: string;
}

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);

function toRow(input: ProviderInput) {
  return {
    name: input.name.trim(),
    category: input.category,
    nit: blankToNull(input.nit),
    default_currency: input.defaultCurrency,
    payment_deadline_hours: Math.max(0, Math.round(input.paymentDeadlineHours)),
    contact_name: blankToNull(input.contactName),
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    bank_details: blankToNull(input.bankDetails),
  };
}

function friendly(error: { message: string }, fallback: string): never {
  if (error.message.includes("providers_catalog_name_uq")) fail({ message: "Ya tienes un proveedor con ese nombre." }, fallback);
  fail(error, fallback);
}

export async function listProviders(): Promise<Provider[]> {
  const { data, error } = await getSupabase()
    .from("providers_catalog")
    .select("*")
    .order("is_system_preload")
    .order("name");
  if (error) fail(error, "No se pudieron cargar los proveedores.");
  return data.map(toProvider);
}

export async function createProvider(agencyId: string, input: ProviderInput): Promise<Provider> {
  const { data, error } = await getSupabase()
    .from("providers_catalog")
    .insert({ ...toRow(input), agency_id: agencyId, is_system_preload: false })
    .select()
    .single();
  if (error) friendly(error, "No se pudo crear el proveedor.");
  return toProvider(data);
}

export async function updateProvider(id: string, input: ProviderInput): Promise<Provider> {
  const { data, error } = await getSupabase().from("providers_catalog").update(toRow(input)).eq("id", id).select();
  if (error) friendly(error, "No se pudo guardar el proveedor.");
  if (data.length === 0) throw new Error("Los proveedores precargados no se pueden editar.");
  return toProvider(data[0]);
}

export async function deleteProvider(id: string): Promise<void> {
  const { data, error } = await getSupabase().from("providers_catalog").delete().eq("id", id).select("id");
  if (error) {
    fail(
      error.code === "23503" ? { message: "Este proveedor ya se usa en expedientes; no se puede eliminar." } : error,
      "No se pudo eliminar el proveedor.",
    );
  }
  if (data.length === 0) throw new Error("Los proveedores precargados no se pueden eliminar.");
}
