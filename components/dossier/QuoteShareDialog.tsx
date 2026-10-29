"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Link2, Loader2, MessageCircle, X } from "lucide-react";

import { createQuoteShare, listBankImages, quoteShareUrl, type BankImage } from "@/lib/data/landing-repository";
import type { Dossier } from "@/lib/finance/types";
import { buildQuoteLinkMessage, buildWhatsappLink } from "@/lib/whatsapp";

interface QuoteShareDialogProps {
  open: boolean;
  onClose: () => void;
  dossier: Dossier;
  optionCount: number;
  /** Guarda lo pendiente antes de publicar: el enlace lee la cotización en vivo. */
  flush: () => Promise<boolean>;
}

/**
 * Crea el enlace web (micro-landing) de la cotización: el asesor elige las
 * fotos del banco (la primera es la portada) y lo envía por WhatsApp.
 */
export function QuoteShareDialog({ open, onClose, dossier, optionCount, flush }: QuoteShareDialogProps) {
  const titleId = useId();
  const [images, setImages] = useState<BankImage[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || images !== null) return;
    let cancelled = false;
    listBankImages()
      .then((data) => {
        if (cancelled) return;
        setImages(data);
        setPicked(data.slice(0, 5).map((i) => i.id));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "No se pudo cargar el banco."));
    return () => {
      cancelled = true;
    };
  }, [open, images]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggle(id: string) {
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
    setUrl(null);
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      if (!(await flush())) throw new Error("Hay cambios sin guardar; revisa la conexión e intenta de nuevo.");
      const token = await createQuoteShare(dossier, picked);
      setUrl(quoteShareUrl(token, window.location.origin));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el enlace.");
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles: el enlace sigue visible para copiarlo a mano.
    }
  }

  const whatsapp = url
    ? buildWhatsappLink(buildQuoteLinkMessage({ dossier, url, optionCount }), dossier.client.whatsapp)
    : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Enlace web de la cotización
            </h2>
            <p className="text-xs text-slate-500">
              El cliente ve {optionCount > 1 ? `las ${optionCount} opciones` : "su plan"} con fotos, el logo de la agencia y el botón
              «Lo quiero». Sin costos ni mayoristas.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <h3 className="mb-2 text-sm font-medium text-slate-900">
          Fotos <span className="font-normal text-slate-500">· la primera que marques es la portada</span>
        </h3>
        {images === null && !error && <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-busy="true" />}
        {images && images.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
            El banco de imágenes está vacío. Súbelas en{" "}
            <Link href="/configuracion" className="underline">
              Configuración
            </Link>
            ; mientras tanto el enlace sale sin fotos.
          </p>
        )}
        {images && images.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images.map((img) => {
              const position = picked.indexOf(img.id);
              return (
                <li key={img.id}>
                  <button
                    type="button"
                    onClick={() => toggle(img.id)}
                    aria-pressed={position >= 0}
                    className={`relative block aspect-[4/3] w-full overflow-hidden rounded-lg ring-offset-1 ${
                      position >= 0 ? "ring-2 ring-emerald-500" : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.caption || "Imagen del banco"} className="size-full object-cover" />
                    {position >= 0 && (
                      <span className="absolute left-1 top-1 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">
                        {position === 0 ? "Portada" : position + 1}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!url ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating || images === null}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
              Crear enlace
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{url}</p>
              <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
                {copied ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="size-4" aria-hidden /> Ver / descargar PDF
              </a>
              <a
                href={whatsapp ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <MessageCircle className="size-4" aria-hidden /> Enviar por WhatsApp
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
