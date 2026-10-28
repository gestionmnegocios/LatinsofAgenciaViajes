"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Trash2, X } from "lucide-react";

import { round2 } from "@/lib/finance/calculations";
import { formatCOP, formatDate } from "@/lib/finance/format";
import type { ClientPayment, Dossier, FinancialSummary, PaymentMethod } from "@/lib/finance/types";
import { buildReceiptMessage, buildWhatsappLink, PAYMENT_METHOD_LABELS } from "@/lib/whatsapp";
import { MoneyInput } from "./MoneyInput";

interface PaymentDrawerProps {
  open: boolean;
  onClose: () => void;
  dossier: Dossier;
  summary: FinancialSummary;
  /** Devuelve el abono guardado o `null` si falló (el error lo muestra el Workspace). */
  onAddPayment: (payment: Omit<ClientPayment, "id">) => Promise<ClientPayment | null>;
  onRemovePayment: (paymentId: string) => Promise<void>;
}

function todayLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Drawer lateral de abonos del cliente (FR-3.1 / FR-3.2): registra pagos,
 * muestra % pagado y saldo, y genera el recibo pre-redactado para WhatsApp.
 */
export function PaymentDrawer({ open, onClose, dossier, summary, onAddPayment, onRemovePayment }: PaymentDrawerProps) {
  const titleId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER_BANCOLOMBIA");
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");
  const [balanceDueDate, setBalanceDueDate] = useState("");
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const readOnly = dossier.status === "LIQUIDATED" || dossier.status === "CANCELLED";
  const exceedsBalance = amount > summary.balanceDue;
  const projectedPaid = round2(summary.totalPaid + (exceedsBalance ? 0 : amount));
  const projectedPct = summary.totalSale > 0 ? Math.min((projectedPaid / summary.totalSale) * 100, 100) : 0;

  // Cerrar con Escape y enfocar el monto al abrir.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => amountRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  /** Mensaje de WhatsApp de cada abono con el estado de cartera acumulado a esa fecha. */
  const receipts = useMemo(() => {
    return dossier.payments.map((payment, index) => {
      const cumulative = round2(
        dossier.payments.slice(0, index + 1).reduce((sum, p) => sum + p.amount, 0),
      );
      const balanceDue = round2(Math.max(summary.totalSale - cumulative, 0));
      const message = buildReceiptMessage({
        dossier,
        payment,
        summary: {
          totalSale: summary.totalSale,
          totalPaid: cumulative,
          balanceDue,
          paidPercentage: summary.totalSale > 0 ? Math.min((cumulative / summary.totalSale) * 100, 100) : 0,
        },
        balanceDueDate: balanceDueDate || null,
      });
      return { payment, link: buildWhatsappLink(message, dossier.client.whatsapp) };
    });
  }, [dossier, summary.totalSale, balanceDueDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (amount <= 0 || exceedsBalance || readOnly || submitting) return;
    const date = paidAt || todayLocal();
    // Consecutivo por expediente; no reutiliza números de abonos anulados.
    const lastNumber = Math.max(
      0,
      ...dossier.payments.map((p) => Number(p.receiptNumber.match(/-(\d+)$/)?.[1] ?? 0)),
    );
    setSubmitting(true);
    setSubmitError(null);
    const payment = await onAddPayment({
      amount: round2(amount),
      method,
      paidAt: new Date(`${date}T12:00:00`).toISOString(),
      receiptNumber: `RC-${dossier.code.replace(/\D/g, "")}-${String(lastNumber + 1).padStart(2, "0")}`,
      notes: notes.trim(),
    });
    setSubmitting(false);
    if (!payment) {
      setSubmitError("No se pudo registrar el abono. Revisa la conexión e intenta de nuevo.");
      return;
    }
    setLastPaymentId(payment.id);
    setAmount(0);
    setNotes("");
    setPaidAt("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Abonos del cliente
            </h2>
            <p className="text-xs text-slate-500">
              {dossier.code} · {dossier.client.fullName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Estado de cartera */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Total plan" value={formatCOP(summary.totalSale)} />
            <Stat label="Abonado" value={formatCOP(summary.totalPaid)} tone="emerald" />
            <Stat
              label="Saldo"
              value={formatCOP(summary.balanceDue)}
              tone={summary.balanceDue > 0 ? "amber" : "emerald"}
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{summary.paidPercentage.toLocaleString("es-CO", { maximumFractionDigits: 1 })} % pagado</span>
              {amount > 0 && !exceedsBalance && (
                <span className="text-slate-500">
                  con este abono: {projectedPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %
                </span>
              )}
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="absolute inset-y-0 left-0 bg-amber-200" style={{ width: `${projectedPct}%` }} />
              <div
                className={`absolute inset-y-0 left-0 ${summary.balanceDue > 0 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${summary.paidPercentage}%` }}
              />
            </div>
          </div>

          {/* Formulario */}
          {!readOnly && summary.balanceDue > 0 && (
            <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-900">Registrar abono</h3>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${titleId}-amount`}>
                  Monto (COP)
                </label>
                <div className="rounded-md border border-slate-300 focus-within:border-slate-500">
                  <MoneyInput
                    ref={amountRef}
                    id={`${titleId}-amount`}
                    value={amount}
                    onValueChange={setAmount}
                    aria-invalid={exceedsBalance}
                  />
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <QuickAmount label="30 %" onClick={() => setAmount(Math.min(round2(summary.totalSale * 0.3), summary.balanceDue))} />
                  <QuickAmount label="50 %" onClick={() => setAmount(Math.min(round2(summary.totalSale * 0.5), summary.balanceDue))} />
                  <QuickAmount label="Saldo total" onClick={() => setAmount(summary.balanceDue)} />
                </div>
                {exceedsBalance && (
                  <p className="mt-1 text-xs text-red-600">El abono supera el saldo de {formatCOP(summary.balanceDue)}.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${titleId}-method`}>
                    Medio de pago
                  </label>
                  <select
                    id={`${titleId}-method`}
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${titleId}-date`}>
                    Fecha
                  </label>
                  <input
                    id={`${titleId}-date`}
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${titleId}-notes`}>
                  Notas / comprobante
                </label>
                <input
                  id={`${titleId}-notes`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Ref. transferencia 88231"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={amount <= 0 || exceedsBalance || submitting}
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? "Registrando…" : `Registrar abono ${amount > 0 && !exceedsBalance ? formatCOP(amount) : ""}`}
              </button>
              {submitError && (
                <p role="alert" className="text-xs text-red-600">
                  {submitError}
                </p>
              )}
            </form>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${titleId}-due`}>
              Fecha límite de pago (para el mensaje)
            </label>
            <input
              id={`${titleId}-due`}
              type="date"
              value={balanceDueDate}
              onChange={(e) => setBalanceDueDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
            />
          </div>

          {/* Historial */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-900">Historial ({dossier.payments.length})</h3>
            {receipts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                Aún no hay abonos registrados.
              </p>
            ) : (
              <ul className="space-y-2">
                {receipts.map(({ payment, link }) => (
                  <li
                    key={payment.id}
                    className={`rounded-lg border px-3 py-2.5 ${
                      payment.id === lastPaymentId ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCOP(payment.amount)}</p>
                        <p className="text-xs text-slate-500">
                          {payment.receiptNumber} · {PAYMENT_METHOD_LABELS[payment.method]} · {formatDate(payment.paidAt)}
                        </p>
                        {payment.notes && <p className="mt-0.5 text-xs text-slate-500">{payment.notes}</p>}
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => void onRemovePayment(payment.id)}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Anular abono ${payment.receiptNumber}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                    >
                      <MessageCircle className="size-3.5" aria-hidden /> Enviar recibo por WhatsApp
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function QuickAmount({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}
