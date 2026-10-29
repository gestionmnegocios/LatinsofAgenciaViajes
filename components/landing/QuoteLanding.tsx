"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Check, Download, Heart, Loader2, MapPin, MessageCircle, Phone, Users } from "lucide-react";

import { acceptQuoteShare, getQuoteShare, type QuoteShareView } from "@/lib/data/landing-repository";
import { formatCOP, formatDate, formatDateTime } from "@/lib/finance/format";
import type { ServiceType } from "@/lib/finance/types";
import { buildWhatsappLink, normalizeWhatsappNumber } from "@/lib/whatsapp";

const SERVICE: Record<ServiceType, { emoji: string; label: string }> = {
  HOTEL: { emoji: "🏨", label: "Hotel" },
  FLIGHT: { emoji: "✈️", label: "Vuelos" },
  PACKAGE: { emoji: "🧳", label: "Paquete" },
  ASSISTANCE: { emoji: "🩺", label: "Asistencia médica" },
  TRANSFER: { emoji: "🚐", label: "Traslados" },
  TOUR: { emoji: "🗺️", label: "Tour" },
};

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; share: QuoteShareView };

/** Página pública de la cotización (micro-landing) con «Lo quiero» por opción. */
export function QuoteLanding() {
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<State>({ status: "loading" });
  const [choosing, setChoosing] = useState<string | null>(null);
  const [chooseError, setChooseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (token ? getQuoteShare(token) : Promise.resolve(null))
      .then((share) => !cancelled && setState(share ? { status: "ready", share } : { status: "missing" }))
      .catch((e: unknown) => !cancelled && setState({ status: "error", message: e instanceof Error ? e.message : "Error" }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-slate-400" aria-label="Cargando" />
      </div>
    );
  }
  if (state.status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-900">Esta cotización no está disponible</p>
          <p className="mt-1 text-sm text-slate-500">
            {state.status === "error" ? state.message : "Revisa el enlace o pide uno nuevo a tu asesor de viajes."}
          </p>
        </div>
      </div>
    );
  }

  const { share } = state;
  const open = share.status === "DRAFT";
  const [cover, ...gallery] = share.images;
  const pax = [
    `${share.adults} ${share.adults === 1 ? "adulto" : "adultos"}`,
    share.children > 0 ? `${share.children} ${share.children === 1 ? "niño" : "niños"}` : null,
  ]
    .filter(Boolean)
    .join(" y ");
  const chosenIndex = share.options.findIndex((o) => o.id === (open ? share.acceptedOptionId : share.options.find((x) => x.isSelected)?.id));
  const multiple = share.options.length > 1;
  const optionName = (i: number) => (multiple ? `Opción ${i + 1}` : "Tu plan");

  const notifyLink =
    share.agency.phone && chosenIndex >= 0
      ? buildWhatsappLink(
          `¡Hola! 🙌 Quiero la ${multiple ? `Opción ${chosenIndex + 1}` : "cotización"} de *${share.title}* ` +
            `(${formatCOP(share.options[chosenIndex].total)}). Ref. ${share.code}`,
          share.agency.phone,
        )
      : null;

  async function choose(optionId: string) {
    setChoosing(optionId);
    setChooseError(null);
    try {
      const updated = await acceptQuoteShare(token, optionId);
      setState({ status: "ready", share: updated });
    } catch (e) {
      setChooseError(e instanceof Error ? e.message : "No se pudo registrar tu elección.");
    } finally {
      setChoosing(null);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900 print:bg-white">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
        {share.agency.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={share.agency.logoUrl} alt="" className="h-10 max-w-32 object-contain" />
        )}
        <p className="font-semibold">{share.agency.name}</p>
      </header>

      <section className="relative mx-auto max-w-3xl overflow-hidden sm:rounded-2xl">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt={cover.caption ?? share.title} className="h-72 w-full object-cover sm:h-96 print:h-64" />
        ) : (
          <div className="h-56 w-full bg-gradient-to-br from-sky-600 to-emerald-500" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-sm opacity-90">Hola {share.clientFirstName}, esta es tu cotización</p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{share.title}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-95">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4" aria-hidden /> {formatDate(share.departureDate)} → {formatDate(share.returnDate)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-4" aria-hidden /> {pax}
            </span>
          </p>
        </div>
      </section>

      {gallery.length > 0 && (
        <section aria-label="Galería" className="mx-auto mt-3 max-w-3xl px-5 sm:px-0">
          <ul className="flex snap-x gap-3 overflow-x-auto pb-2 print:grid print:grid-cols-3 print:overflow-visible">
            {gallery.map((img) => (
              <li key={img.url} className="w-56 shrink-0 snap-start print:w-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.caption ?? ""} className="aspect-[4/3] w-full rounded-xl object-cover" />
                {img.caption && <p className="mt-1 text-xs text-slate-600">{img.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <main className="mx-auto max-w-3xl px-5 py-6 sm:px-0">
        {!open && (
          <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <Check className="mr-1 inline size-4" aria-hidden /> ¡Tu reserva está confirmada! Tu asesor te contactará con los detalles.
          </p>
        )}

        <div className={`grid gap-4 ${multiple ? "sm:grid-cols-2" : ""}`}>
          {share.options.map((option, i) => {
            const chosen = i === chosenIndex;
            return (
              <article
                key={option.id}
                className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm break-inside-avoid ${
                  chosen ? "border-emerald-500 ring-2 ring-emerald-200" : "border-stone-200"
                }`}
              >
                <h2 className="text-lg font-semibold">{optionName(i)}</h2>
                <ul className="mt-3 flex-1 space-y-2 text-sm text-slate-700">
                  {option.services.map((s, j) => (
                    <li key={j} className="flex gap-2">
                      <span aria-hidden>{SERVICE[s.type].emoji}</span>
                      <span>{s.description.trim() || SERVICE[s.type].label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs uppercase tracking-wide text-slate-500">Valor total</p>
                <p className="text-2xl font-semibold tabular-nums">{formatCOP(option.total)}</p>

                {open && (
                  <button
                    type="button"
                    disabled={choosing !== null}
                    onClick={() => void choose(option.id)}
                    className={`mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition print:hidden ${
                      chosen ? "bg-emerald-600 text-white" : "bg-slate-900 text-white hover:bg-slate-800"
                    } disabled:opacity-60`}
                  >
                    {choosing === option.id ? (
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                    ) : chosen ? (
                      <Check className="size-5" aria-hidden />
                    ) : (
                      <Heart className="size-5" aria-hidden />
                    )}
                    {chosen ? "¡Elegida!" : "Lo quiero"}
                  </button>
                )}
                {!open && chosen && <p className="mt-4 text-sm font-medium text-emerald-700">Opción reservada</p>}
              </article>
            );
          })}
        </div>

        {chooseError && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {chooseError}
          </p>
        )}

        {open && chosenIndex >= 0 && (
          <div className="mt-5 rounded-2xl bg-emerald-50 p-5 text-center print:hidden">
            <p className="font-semibold text-emerald-900">¡Excelente elección! Ya le avisamos a tu asesor.</p>
            {share.acceptedAt && <p className="text-xs text-emerald-800">Registrado el {formatDateTime(share.acceptedAt)}</p>}
            {notifyLink && (
              <a
                href={notifyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="size-4" aria-hidden /> Confirmar por WhatsApp
              </a>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          {share.validUntil
            ? `Precios sujetos a disponibilidad hasta el ${formatDateTime(share.validUntil)}`
            : "Precios sujetos a disponibilidad"}{" "}
          · Ref. {share.code}
        </p>

        <div className="mt-4 flex justify-center print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-stone-100"
          >
            <Download className="size-4" aria-hidden /> Descargar PDF
          </button>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm text-slate-600">
          <p className="font-medium text-slate-900">{share.agency.name}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {share.agency.phone && (
              <a href={`https://wa.me/${normalizeWhatsappNumber(share.agency.phone)}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="size-4" aria-hidden /> {share.agency.phone}
              </a>
            )}
            {(share.agency.address || share.agency.city) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {[share.agency.address, share.agency.city].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
