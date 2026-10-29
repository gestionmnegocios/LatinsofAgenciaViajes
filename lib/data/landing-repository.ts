/**
 * Micro-landing de la cotización: banco de imágenes de la agencia (máx. 10),
 * enlaces públicos por token y las llamadas públicas (sin sesión) de la página
 * del cliente. El público solo usa las RPC `get_quote_share` y
 * `accept_quote_share`, que nunca devuelven costos ni mayoristas.
 */

import type { DossierStatus, ServiceType } from "@/lib/finance/types";
import { getSupabase } from "@/lib/supabase/client";
import { fail } from "./dossier-repository";

export const IMAGE_BUCKET = "agency-images";
export const IMAGE_BANK_LIMIT = 10;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface BankImage {
  id: string;
  url: string;
  storagePath: string;
  caption: string;
}

// ─── Banco de imágenes ───────────────────────────────────────────────────────

export function imageProblem(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "La imagen debe ser JPG, PNG o WEBP.";
  if (file.size > IMAGE_MAX_BYTES) return "La imagen no puede pesar más de 5 MB.";
  return null;
}

export async function listBankImages(): Promise<BankImage[]> {
  const { data, error } = await getSupabase()
    .from("agency_images")
    .select("id, url, storage_path, caption")
    .order("created_at");
  if (error) fail(error, "No se pudo cargar el banco de imágenes.");
  return data.map((r) => ({ id: r.id, url: r.url, storagePath: r.storage_path, caption: r.caption ?? "" }));
}

/** Sube el archivo con nombre único y devuelve su ruta y URL pública. */
async function uploadFile(agencyId: string, file: File): Promise<{ path: string; url: string }> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const bucket = getSupabase().storage.from(IMAGE_BUCKET);
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${agencyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) fail(error, "No se pudo subir la imagen.");
  return { path, url: bucket.getPublicUrl(path).data.publicUrl };
}

export async function addBankImage(agencyId: string, file: File, caption: string): Promise<BankImage> {
  const { path, url } = await uploadFile(agencyId, file);
  const { data, error } = await getSupabase()
    .from("agency_images")
    .insert({ agency_id: agencyId, storage_path: path, url, caption: caption.trim() || null })
    .select("id")
    .single();
  if (error) {
    await getSupabase().storage.from(IMAGE_BUCKET).remove([path]);
    fail(error, "No se pudo guardar la imagen.");
  }
  return { id: data.id, url, storagePath: path, caption: caption.trim() };
}

/** Sustituye el archivo conservando el mismo registro (los enlaces ya enviados ven la nueva). */
export async function replaceBankImage(agencyId: string, image: BankImage, file: File): Promise<BankImage> {
  const { path, url } = await uploadFile(agencyId, file);
  const { error } = await getSupabase().from("agency_images").update({ storage_path: path, url }).eq("id", image.id);
  if (error) {
    await getSupabase().storage.from(IMAGE_BUCKET).remove([path]);
    fail(error, "No se pudo sustituir la imagen.");
  }
  await getSupabase().storage.from(IMAGE_BUCKET).remove([image.storagePath]);
  return { ...image, url, storagePath: path };
}

export async function updateBankImageCaption(id: string, caption: string): Promise<void> {
  const { error } = await getSupabase().from("agency_images").update({ caption: caption.trim() || null }).eq("id", id);
  if (error) fail(error, "No se pudo guardar el texto de la imagen.");
}

export async function deleteBankImage(image: BankImage): Promise<void> {
  const { error } = await getSupabase().from("agency_images").delete().eq("id", image.id);
  if (error) fail(error, "No se pudo eliminar la imagen.");
  await getSupabase().storage.from(IMAGE_BUCKET).remove([image.storagePath]);
}

// ─── Enlaces de cotización (asesor) ──────────────────────────────────────────

export async function createQuoteShare(
  dossier: { id: string; agencyId: string },
  imageIds: readonly string[],
): Promise<string> {
  const { data, error } = await getSupabase()
    .from("quote_shares")
    .insert({ agency_id: dossier.agencyId, dossier_id: dossier.id, image_ids: [...imageIds] })
    .select("token")
    .single();
  if (error) fail(error, "No se pudo crear el enlace.");
  return data.token;
}

export function quoteShareUrl(token: string, origin: string): string {
  return `${origin}/cotizacion?t=${token}`;
}

// ─── Página pública del cliente ──────────────────────────────────────────────

export interface QuoteShareView {
  code: string;
  status: DossierStatus;
  title: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  clientFirstName: string;
  agency: { name: string; logoUrl: string | null; phone: string | null; address: string | null; city: string | null };
  acceptedOptionId: string | null;
  acceptedAt: string | null;
  validUntil: string | null;
  images: { url: string; caption: string | null }[];
  options: {
    id: string;
    isSelected: boolean;
    total: number;
    services: { type: ServiceType; description: string }[];
  }[];
}

function toView(raw: unknown): QuoteShareView | null {
  if (!raw) return null;
  const v = raw as QuoteShareView;
  return { ...v, options: v.options.map((o) => ({ ...o, total: Number(o.total) })) };
}

export async function getQuoteShare(token: string): Promise<QuoteShareView | null> {
  const { data, error } = await getSupabase().rpc("get_quote_share", { p_token: token });
  // Un token mal formado no es un error del sistema: el enlace simplemente no existe.
  if (error) {
    if (error.code === "22P02") return null;
    fail(error, "No se pudo cargar la cotización.");
  }
  return toView(data);
}

export async function acceptQuoteShare(token: string, optionId: string): Promise<QuoteShareView> {
  const { data, error } = await getSupabase().rpc("accept_quote_share", { p_token: token, p_option_id: optionId });
  if (error) fail(error, "No se pudo registrar tu elección.");
  return toView(data)!;
}
