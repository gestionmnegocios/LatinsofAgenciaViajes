"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CloudCheck,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  CalendarDays,
  Check,
  Copy,
  FileCheck2,
  Plus,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { checkLiquidation, computeFinancials, paidToProvider } from "@/lib/finance/calculations";
import { formatCOP, formatDate, formatDateTime } from "@/lib/finance/format";
import type { DossierStatus } from "@/lib/finance/types";
import {
  useDossierStore,
  useFinancialSummary,
  useWorkingOption,
  type SaveStatus,
} from "@/lib/store/dossier-store";
import { FinancialThermometer } from "./FinancialThermometer";
import { MoneyInput } from "./MoneyInput";
import { PaymentDrawer } from "./PaymentDrawer";
import { ProviderPaymentsDrawer } from "./ProviderPaymentsDrawer";
import { QuoteShareDialog } from "./QuoteShareDialog";
import { buildQuoteMessage, buildWhatsappLink, earliestValidDeadline } from "@/lib/whatsapp";
import { ServicesTable } from "./ServicesTable";

/**
 * Single-Page Progressive Dossier.
 *
 * Una sola vista que progresa DRAFT (cotización con opciones) → CONFIRMED
 * (expediente activo con abonos y pagos a proveedores) → LIQUIDATED, sin
 * navegación ni re-digitación. Izquierda 70 %: operación. Derecha 30 %:
 * Termómetro Financiero fijo.
 *
 * Requiere que el expediente se haya cargado con `useDossierStore.loadDossier`.
 */
export function DossierWorkspace({ backHref }: { backHref?: string }) {
  const dossier = useDossierStore((s) => s.dossier);
  const busy = useDossierStore((s) => s.busy);
  const saveStatus = useDossierStore((s) => s.saveStatus);
  const saveError = useDossierStore((s) => s.saveError);
  const providers = useDossierStore((s) => s.providers);
  const defaultTrm = useDossierStore((s) => s.defaultTrm);
  const hasBackend = useDossierStore((s) => s.persistence !== null);
  const actions = useDossierStore.getState();
  const option = useWorkingOption();
  const summary = useFinancialSummary();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [providerDrawerOpen, setProviderDrawerOpen] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const closeProviderDrawer = useCallback(() => setProviderDrawerOpen(false), []);
  const [liquidationErrors, setLiquidationErrors] = useState<string[]>([]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  const unsaved = saveStatus === "pending" || saveStatus === "saving" || saveStatus === "error";
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  const liquidation = useMemo(
    () => (dossier && summary ? checkLiquidation(dossier.status, option?.services ?? [], summary) : null),
    [dossier, option, summary],
  );

  if (!dossier || !summary) return <WorkspaceSkeleton />;

  const isDraft = dossier.status === "DRAFT";
  const archivedCount = dossier.options.filter((o) => o.isArchived).length;
  const servicesWithTransfers = new Set(dossier.providerPayments.map((p) => p.serviceId));
  // Por girar a la TRM cotizada; los servicios marcados como pagados no suman.
  const providerPending = (option?.services ?? []).reduce((t, s) => {
    if (s.isProviderPaid) return t;
    const balance = Math.max(s.netCostOriginal - paidToProvider(s.id, dossier.providerPayments), 0);
    return t + (s.currency === "COP" ? balance : balance * s.exchangeRate);
  }, 0);
  const chosenOption = dossier.clientChoice
    ? dossier.options.find((o) => o.id === dossier.clientChoice!.optionId && !o.isArchived)
    : undefined;
  const quotedCount = dossier.options.filter((o) => !o.isArchived && o.services.some((s) => s.salePrice > 0)).length;

  function sendQuote() {
    if (!dossier) return;
    const message = buildQuoteMessage({
      dossier,
      options: dossier.options,
      validUntil: earliestValidDeadline(dossier.options, Date.now()),
    });
    window.open(buildWhatsappLink(message, dossier.client.whatsapp), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Encabezado del expediente */}
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> Expedientes
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <CopyCode code={dossier.code} />
            <StatusBadge status={dossier.status} />
            <SaveIndicator status={saveStatus} />
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold text-slate-900">{dossier.destinationTitle}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>{dossier.client.fullName}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4 text-slate-400" aria-hidden />
              {formatDate(dossier.departureDate)} → {formatDate(dossier.returnDate)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-4 text-slate-400" aria-hidden />
              {dossier.adultsCount} adultos{dossier.childrenCount > 0 && ` · ${dossier.childrenCount} niños`}
            </span>
            {dossier.childrenCount > 0 && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                Viaja con menores
              </span>
            )}
            <span className="text-slate-500">
              Asesor: {dossier.agent.fullName} ({dossier.agent.commissionRate} %)
            </span>
          </div>
        </div>

        <StatusStepper status={dossier.status} />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        {/* ─── Columna de operación (70 %) ─── */}
        <main className="min-w-0 space-y-4">
          {isDraft ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div role="tablist" aria-label="Opciones de cotización" className="flex flex-wrap gap-1.5">
                {dossier.options.map((o) => {
                  const optionTotal = computeFinancials({
                    services: o.services,
                    payments: [],
                    commissionRate: dossier.agent.commissionRate,
                    status: "DRAFT",
                  });
                  const selected = o.id === option?.id;
                  return (
                    <div
                      key={o.id}
                      className={`group flex items-center rounded-lg border text-left transition ${
                        selected
                          ? "border-slate-900 bg-white shadow-sm"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => actions.setActiveOption(o.id)}
                        className="px-3 py-1.5 text-left"
                      >
                        <span className="block text-sm font-medium text-slate-900">{o.title}</span>
                        <span className="block text-xs tabular-nums text-slate-500">
                          {formatCOP(optionTotal.totalSale)} ·{" "}
                          <span className={optionTotal.isLoss ? "text-red-600" : "text-emerald-700"}>
                            util. {formatCOP(optionTotal.agencyNetProfit)}
                          </span>
                        </span>
                      </button>
                      {dossier.options.length > 1 && (
                        <button
                          type="button"
                          onClick={() => actions.removeOption(o.id)}
                          aria-label={`Eliminar ${o.title}`}
                          className="mr-1 rounded p-1 text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => actions.addOption(option?.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                  title="Duplica la opción activa para comparar variantes"
                >
                  <Plus className="size-4" aria-hidden /> Duplicar opción
                </button>
              </div>
              <TrmField value={defaultTrm} onChange={actions.setDefaultTrm} />
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-medium text-slate-900">
                  <FileCheck2 className="mr-1 inline size-4 text-emerald-600" aria-hidden />
                  {option?.title ?? "Opción confirmada"}
                </p>
                <p className="text-xs text-slate-500">
                  Opción congelada
                  {archivedCount > 0 && (
                    <>
                      {" · "}
                      <Archive className="inline size-3" aria-hidden /> {archivedCount} archivada
                      {archivedCount > 1 ? "s" : ""}
                    </>
                  )}
                  {dossier.liquidatedAt && ` · Liquidado ${formatDateTime(dossier.liquidatedAt)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                    summary.balanceDue > 0
                      ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <Wallet className="size-4" aria-hidden />
                  Abonos
                  {summary.balanceDue > 0 ? ` · saldo ${formatCOP(summary.balanceDue)}` : " · 100 %"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProviderError(null);
                    setProviderDrawerOpen(true);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                    providerPending > 0
                      ? "bg-sky-100 text-sky-900 hover:bg-sky-200"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <Building2 className="size-4" aria-hidden />
                  Proveedores
                  {providerPending > 0 ? ` · por girar ${formatCOP(providerPending)}` : " · pagados"}
                </button>
                {dossier.status !== "LIQUIDATED" && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      const result = await actions.liquidate();
                      setLiquidationErrors(result.reasons);
                    }}
                    aria-describedby={liquidationErrors.length ? "liquidation-errors" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                      liquidation?.canLiquidate
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                    }`}
                    title={liquidation?.reasons.join("\n") || "Liquidar y liberar comisión"}
                  >
                    {busy === "liquidate" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <BadgeCheck className="size-4" aria-hidden />
                    )}
                    {busy === "liquidate" ? "Liquidando…" : "Liquidar expediente"}
                  </button>
                )}
              </div>
            </div>
          )}

          {saveStatus === "error" && saveError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <span className="inline-flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                No se guardaron los últimos cambios: {saveError}
              </span>
              <button
                type="button"
                onClick={() => void actions.flush()}
                className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-red-200 hover:bg-red-100"
              >
                Reintentar
              </button>
            </div>
          )}

          {liquidationErrors.length > 0 && dossier.status !== "LIQUIDATED" && (
            <div
              id="liquidation-errors"
              role="alert"
              className="flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <ul className="list-disc space-y-0.5 pl-4">
                {liquidationErrors.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <button type="button" onClick={() => setLiquidationErrors([])} aria-label="Cerrar aviso">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          {option && (
            <ServicesTable
              services={option.services}
              status={dossier.status}
              providers={providers}
              onAdd={() => actions.addService(option.id)}
              onUpdate={(serviceId, patch) => actions.updateService(option.id, serviceId, patch)}
              onRemove={(serviceId) => actions.removeService(option.id, serviceId)}
              onCreateProvider={actions.addCustomProvider}
              servicesWithTransfers={servicesWithTransfers}
            />
          )}

          {isDraft && option && (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-900">1. Enviar al cliente.</span>{" "}
                {quotedCount > 1 ? `Van las ${quotedCount} opciones` : "Va la cotización"} con precios de venta, sin
                costos ni mayoristas: como enlace web con fotos y botón «Lo quiero», o como texto.
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                {hasBackend && (
                  <button
                    type="button"
                    disabled={quotedCount === 0}
                    onClick={() => setShareOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Link2 className="size-4" aria-hidden /> Enlace web
                  </button>
                )}
                <button
                  type="button"
                  disabled={quotedCount === 0}
                  onClick={sendQuote}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:bg-slate-300 ${
                    hasBackend
                      ? "border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  <MessageCircle className="size-4" aria-hidden /> {hasBackend ? "Texto" : "Enviar cotización por WhatsApp"}
                </button>
              </div>
            </div>
          )}

          {isDraft && chosenOption && (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-emerald-900">
                <Heart className="mr-1 inline size-4 fill-emerald-600 text-emerald-600" aria-hidden />
                <strong>{dossier.client.fullName.split(" ")[0]}</strong> marcó «Lo quiero» en <strong>{chosenOption.title}</strong>{" "}
                desde el enlace · {formatDateTime(dossier.clientChoice!.acceptedAt)}
              </p>
              {option?.id !== chosenOption.id && (
                <button
                  type="button"
                  onClick={() => actions.setActiveOption(chosenOption.id)}
                  className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-100"
                >
                  Ver esa opción
                </button>
              )}
            </div>
          )}

          {isDraft && option && (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-900">2. ¿El cliente aprobó?</span>{" "}
                {quotedCount > 1 && "Elige arriba la pestaña de la opción que respondió y "}
                {quotedCount > 1 ? "confirma" : "Confirma"} <strong>{option.title}</strong>: se congela y las demás opciones
                se archivan.
              </p>
              <button
                type="button"
                disabled={summary.totalSale <= 0 || busy !== null}
                onClick={async () => {
                  const result = await actions.convertToFile(option.id);
                  setLiquidationErrors(result.reasons);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy === "convert" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileCheck2 className="size-4" aria-hidden />
                )}
                {busy === "convert" ? "Confirmando…" : "Convertir en expediente"}
              </button>
            </div>
          )}
        </main>

        {/* ─── Termómetro (30 %) ─── */}
        {/* En móvil va primero: es lo que se consulta rápido. */}
        <div className="order-first lg:sticky lg:top-6 lg:order-none lg:self-start">
          <FinancialThermometer summary={summary} status={dossier.status} optionTitle={option?.title} />
        </div>
      </div>

      {!isDraft && (
        <ProviderPaymentsDrawer
          open={providerDrawerOpen}
          onClose={closeProviderDrawer}
          dossierCode={dossier.code}
          services={option?.services ?? []}
          payments={dossier.providerPayments}
          readOnly={dossier.status === "LIQUIDATED" || dossier.status === "CANCELLED"}
          error={providerError}
          onAdd={async (payment) => {
            const saved = await actions.addProviderPayment(payment);
            setProviderError(saved ? null : (useDossierStore.getState().saveError ?? "No se pudo registrar el giro."));
            return saved;
          }}
          onRemove={async (paymentId) => {
            const before = useDossierStore.getState().dossier?.providerPayments.length ?? 0;
            await actions.removeProviderPayment(paymentId);
            const after = useDossierStore.getState().dossier?.providerPayments.length ?? 0;
            setProviderError(after < before ? null : (useDossierStore.getState().saveError ?? "No se pudo anular el giro."));
          }}
        />
      )}

      {isDraft && (
        <QuoteShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          dossier={dossier}
          optionCount={quotedCount}
          flush={actions.flush}
        />
      )}

      <PaymentDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        dossier={dossier}
        summary={summary}
        onAddPayment={actions.addPayment}
        onRemovePayment={actions.removePayment}
      />
    </div>
  );
}

/** Estado del autoguardado (solo visible cuando hay backend). */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
        <AlertCircle className="size-3.5" aria-hidden /> Sin guardar
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <CloudCheck className="size-3.5" aria-hidden /> Guardado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500" aria-live="polite">
      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Guardando…
    </span>
  );
}

const STATUS_LABELS: Record<DossierStatus, string> = {
  DRAFT: "Cotización",
  CONFIRMED: "Expediente activo",
  IN_PROGRESS: "En curso",
  LIQUIDATED: "Liquidado",
  CANCELLED: "Cancelado",
};

function StatusBadge({ status }: { status: DossierStatus }) {
  const styles: Record<DossierStatus, string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    CONFIRMED: "bg-sky-50 text-sky-700",
    IN_PROGRESS: "bg-sky-50 text-sky-700",
    LIQUIDATED: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-red-50 text-red-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{STATUS_LABELS[status]}</span>
  );
}

const STEPS: { status: DossierStatus; label: string }[] = [
  { status: "DRAFT", label: "Cotización" },
  { status: "CONFIRMED", label: "Expediente activo" },
  { status: "LIQUIDATED", label: "Liquidado" },
];

/** Indicador de progreso del expediente (solo lectura; las transiciones son acciones explícitas). */
function StatusStepper({ status }: { status: DossierStatus }) {
  const current = status === "IN_PROGRESS" ? 1 : STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="Estado del expediente">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.status} className="flex items-center gap-1">
            {index > 0 && <span className={`h-px w-6 ${done || active ? "bg-slate-400" : "bg-slate-200"}`} />}
            <span
              aria-current={active ? "step" : undefined}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
                active
                  ? step.status === "LIQUIDATED"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-900 text-white"
                  : done
                    ? "bg-slate-200 text-slate-700"
                    : "bg-slate-50 text-slate-400 ring-1 ring-slate-200"
              }`}
            >
              {done && <Check className="size-3" aria-hidden />}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function TrmField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      TRM sugerida USD
      <span className="w-32 rounded-md border border-slate-200 bg-white">
        <MoneyInput value={value} onValueChange={onChange} aria-label="TRM sugerida para servicios en USD" />
      </span>
    </label>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(code).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white"
      title="Copiar código"
    >
      {code}
      {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3 opacity-60" aria-hidden />}
    </button>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1600px] animate-pulse px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mb-6 h-16 w-2/3 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        <div className="h-80 rounded-xl bg-slate-200" />
        <div className="h-96 rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
