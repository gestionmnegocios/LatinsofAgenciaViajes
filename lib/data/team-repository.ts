/**
 * Equipo de la agencia: asesores e invitaciones. Escribir requiere ADMIN (RLS);
 * la base de datos impide dejar la agencia sin un ADMIN activo.
 */

import { getSupabase } from "@/lib/supabase/client";
import { fail, num } from "./dossier-repository";

export type Role = "ADMIN" | "AGENT";

export interface TeamMember {
  id: string;
  fullName: string;
  role: Role;
  commissionRate: number;
  isActive: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  commissionRate: number;
  createdAt: string;
}

export interface NewInvitation {
  email: string;
  fullName: string;
  role: Role;
  commissionRate: number;
}

export type Onboarding =
  | { kind: "INACTIVE"; agencyName: string }
  | { kind: "INVITATION"; invitationId: string; agencyName: string; role: Role; commissionRate: number };

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error } = await getSupabase()
    .from("agency_users")
    .select("id, full_name, role, default_commission_rate, is_active")
    .order("is_active", { ascending: false })
    .order("full_name");
  if (error) fail(error, "No se pudo cargar el equipo.");
  return data.map((u) => ({
    id: u.id,
    fullName: u.full_name,
    role: u.role,
    commissionRate: num(u.default_commission_rate),
    isActive: u.is_active,
  }));
}

export async function listInvitations(): Promise<Invitation[]> {
  const { data, error } = await getSupabase()
    .from("agency_invitations")
    .select("id, email, full_name, role, commission_rate, created_at")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) fail(error, "No se pudieron cargar las invitaciones.");
  return data.map((i) => ({
    id: i.id,
    email: i.email,
    fullName: i.full_name,
    role: i.role,
    commissionRate: num(i.commission_rate),
    createdAt: i.created_at,
  }));
}

export async function inviteMember(agencyId: string, invitedBy: string, input: NewInvitation): Promise<void> {
  const { error } = await getSupabase()
    .from("agency_invitations")
    .insert({
      agency_id: agencyId,
      invited_by: invitedBy,
      email: input.email.trim().toLowerCase(),
      full_name: input.fullName.trim(),
      role: input.role,
      commission_rate: input.commissionRate,
    });
  if (error) {
    fail(
      error.message.includes("agency_invitations_pending_uq") ? { message: "Ya hay una invitación pendiente para ese correo." } : error,
      "No se pudo crear la invitación.",
    );
  }
}

export async function cancelInvitation(id: string): Promise<void> {
  const { error } = await getSupabase().from("agency_invitations").delete().eq("id", id);
  if (error) fail(error, "No se pudo cancelar la invitación.");
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<TeamMember, "role" | "commissionRate" | "isActive">>,
): Promise<void> {
  const { data, error } = await getSupabase()
    .from("agency_users")
    .update({
      role: patch.role,
      default_commission_rate: patch.commissionRate,
      is_active: patch.isActive,
    })
    .eq("id", id)
    .select("id");
  if (error) {
    fail(
      error.message.includes("administrador activo") ? { message: "La agencia debe conservar al menos un administrador activo." } : error,
      "No se pudo actualizar el asesor.",
    );
  }
  if (data.length === 0) throw new Error("No tienes permiso para editar este usuario.");
}

export async function fetchOnboarding(): Promise<Onboarding[]> {
  const { data, error } = await getSupabase().rpc("my_onboarding");
  if (error) fail(error, "No se pudo consultar tu cuenta.");
  return data.map((r) =>
    r.kind === "INACTIVE"
      ? { kind: "INACTIVE", agencyName: r.agency_name }
      : {
          kind: "INVITATION",
          invitationId: r.invitation_id ?? "",
          agencyName: r.agency_name,
          role: r.role,
          commissionRate: num(r.commission_rate),
        },
  );
}

export async function acceptInvitation(invitationId: string): Promise<void> {
  const { error } = await getSupabase().rpc("accept_invitation", { p_invitation_id: invitationId });
  if (error) fail(error, "No se pudo aceptar la invitación.");
}
