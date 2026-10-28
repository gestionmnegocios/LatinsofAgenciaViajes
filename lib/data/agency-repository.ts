/**
 * Datos de la agencia (configuración) y su logo en Storage. Editar requiere
 * ADMIN: lo imponen la política `agencies_update` y las del bucket.
 */

import { getSupabase } from "@/lib/supabase/client";
import { fail } from "./dossier-repository";

export const LOGO_BUCKET = "agency-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export interface AgencyInfo {
  name: string;
  nit: string;
  address: string | null;
  city: string | null;
  /** Teléfono / WhatsApp de la agencia. */
  phone: string | null;
  logoUrl: string | null;
}

export type AgencySettings = Omit<AgencyInfo, "logoUrl">;

export async function fetchAgencyInfo(agencyId: string): Promise<AgencyInfo> {
  const { data, error } = await getSupabase()
    .from("agencies")
    .select("name, nit, address, city, phone, logo_url")
    .eq("id", agencyId)
    .single();
  if (error) fail(error, "No se pudo cargar la agencia.");
  return {
    name: data.name,
    nit: data.nit,
    address: data.address,
    city: data.city,
    phone: data.phone,
    logoUrl: data.logo_url,
  };
}

const blankToNull = (v: string | null) => (v && v.trim() ? v.trim() : null);

export async function updateAgencySettings(agencyId: string, settings: AgencySettings): Promise<void> {
  const { data, error } = await getSupabase()
    .from("agencies")
    .update({
      name: settings.name.trim(),
      nit: settings.nit.trim(),
      address: blankToNull(settings.address),
      city: blankToNull(settings.city),
      phone: blankToNull(settings.phone),
    })
    .eq("id", agencyId)
    .select("id");
  if (error) {
    fail(
      error.message.includes("agencies_nit_key") ? { message: "Ya existe otra agencia con ese NIT." } : error,
      "No se pudo guardar la configuración.",
    );
  }
  if (data.length === 0) throw new Error("Solo el administrador puede cambiar la configuración.");
}

/** Validación previa a la subida (el bucket también limita tipo y tamaño). */
export function logoProblem(file: File): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "El logo debe ser PNG, JPG, WEBP o SVG.";
  if (file.size > LOGO_MAX_BYTES) return "El logo no puede pesar más de 2 MB.";
  return null;
}

/**
 * Sube el logo con nombre único (evita caché vieja), lo guarda en la agencia y
 * borra los anteriores de su carpeta. Devuelve la URL pública.
 */
export async function uploadAgencyLogo(agencyId: string, file: File): Promise<string> {
  const problem = logoProblem(file);
  if (problem) throw new Error(problem);

  const sb = getSupabase();
  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${agencyId}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from(LOGO_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (uploadError) fail(uploadError, "No se pudo subir el logo.");

  const url = sb.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await sb.from("agencies").update({ logo_url: url }).eq("id", agencyId);
  if (error) {
    await sb.storage.from(LOGO_BUCKET).remove([path]);
    fail(error, "No se pudo guardar el logo.");
  }

  await removeOtherLogos(agencyId, path);
  return url;
}

export async function removeAgencyLogo(agencyId: string): Promise<void> {
  const { error } = await getSupabase().from("agencies").update({ logo_url: null }).eq("id", agencyId);
  if (error) fail(error, "No se pudo quitar el logo.");
  await removeOtherLogos(agencyId, null);
}

/** Limpieza de archivos viejos; si falla no afecta el logo vigente. */
async function removeOtherLogos(agencyId: string, keepPath: string | null): Promise<void> {
  const bucket = getSupabase().storage.from(LOGO_BUCKET);
  const { data } = await bucket.list(agencyId);
  const stale = (data ?? []).map((f) => `${agencyId}/${f.name}`).filter((p) => p !== keepPath);
  if (stale.length > 0) await bucket.remove(stale);
}
