"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Building2, Plus, Trash2, X } from "lucide-react";

import { deadlineLevel, netCostInCop, paidToProvider, round2 } from "@/lib/finance/calculations";
import { formatCOP, formatDate, formatUSD } from "@/lib/finance/format";
import type { DossierService, PaymentMethod, ProviderPayment } from "@/lib/finance/types";
import { useNow } from "@/lib/hooks/use-now";
import { PAYMENT_METHOD_LABELS } from "@/lib/whatsapp";
import { MoneyInput } from "./MoneyInput";
import { DeadlineBadge, SERVICE_TYPE_LABELS } from "./ServicesTable";

interface ProviderPaymentsDrawerProps {
  open: boolean;
  onClose: () => void;
  dossierCode: string;
  /** Servicios de la opción aprobada. */
  services: readonly DossierService[];
  payments: readonly ProviderPayment[];
  readOnly: boolean;
  /** Devuelve el giro guardado o `null` si falló. */
  onAdd: (payment: Omit<ProviderPayment, "id" | "amountCop">) => Promise<ProviderPayment | null>;
  onRemove: (paymentId: string) => Promise<void>;
  error: string | null;
}

const money = (value: number, currency: string) => (currency === "USD" ? formatUSD(value) : formatCOP(value));

function todayLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Pagos a proveedores: registra los giros a mayoristas (salidas de caja) por
 * servicio y localizador, y muestra lo girado y el saldo de cada uno.
 */
export function ProviderPaymentsDrawer({
  open,
  onClose,
  dossierCode,
  services,
  payments,
  readOnly,
  onAdd,
  onRemove,
  error,
}: ProviderPaymentsDrawerProps) {
  const titleId = useId();
  const [formFor, setFormFor] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const totals = useMemo(() => {
    const cost = services.reduce((t, s) => t + netCostInCop(s), 0);
    const transferred = payments.reduce((t, p) => t + p.amountCop, 0);
    // Pendiente a la TRM cotizada de cada servicio; los marcados a mano cuentan como pagados.
    const pending = services.reduce((t, s) => {
      if (s.isProviderPaid) return t;
      const balance = Math.max(s.netCostOriginal - paidToProvider(s.id, payments), 0);
      return t + (s.currency === "COP" ? balance : balance * s.exchangeRate);
    }, 0);
    return { cost: round2(cost), transferred: round2(transferred), pending: round2(pending) };
  }, [services, payments]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Pagos a proveedores
            </h2>
            <p className="text-xs text-slate-500">{dossierCode} · giros a mayoristas por localizador</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Costo proveedores" value={formatCOP(totals.cost)} />
            <Stat label="Girado" value={formatCOP(totals.transferred)} tone="emerald" />
            <Stat label="Por girar" value={formatCOP(totals.pending)} tone={totals.pending > 0 ? "amber" : "emerald"} />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {services.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
              La opción aprobada no tiene servicios.
            </p>
          )}

          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              payments={payments.filter((p) => p.serviceId === service.id)}
              readOnly={readOnly}
              formOpen={formFor === service.id}
              onToggleForm={() => setFormFor((f) => (f === service.id ? null : service.id))}
              onAdd={async (input) => {
                const saved = await onAdd(input);
                if (saved) setFormFor(null);
                return saved !== null;
              }}
              onRemove={onRemove}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ServiceCard({
  service,
  payments,
  readOnly,
  formOpen,
  onToggleForm,
  onAdd,
  onRemove,
}: {
  service: DossierService;
  payments: readonly ProviderPayment[];
  readOnly: boolean;
  formOpen: boolean;
  onToggleForm: () => void;
  onAdd: (payment: Omit<ProviderPayment, "id" | "amountCop">) => Promise<boolean>;
  onRemove: (paymentId: string) => Promise<void>;
}) {
  const now = useNow();
  const paid = paidToProvider(service.id, payments);
  const balance = round2(Math.max(service.netCostOriginal - paid, 0));
  const pct = service.netCostOriginal > 0 ? Math.min((paid / service.netCostOriginal) * 100, 100) : 0;
  const manual = service.isProviderPaid && payments.length === 0;
  const level = now === null ? "none" : deadlineLevel(service, now);

  return (
    <article className="rounded-lg border border-slate-200">
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Building2 className="size-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{service.providerName || "Proveedor sin nombre"}</span>
          </p>
          <p className="truncate text-xs text-slate-500">
            {SERVICE_TYPE_LABELS[service.serviceType]}
            {service.description && ` · ${service.description}`}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-600">
            {service.bookingReference ? `Loc. ${service.bookingReference}` : "Sin localizador"}
          </p>
          <DeadlineBadge level={level} />
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="text-slate-500">Costo {money(service.netCostOriginal, service.currency)}</p>
          <p className="text-emerald-700">Girado {money(paid, service.currency)}</p>
          <p className={`font-semibold ${balance > 0 && !service.isProviderPaid ? "text-amber-700" : "text-emerald-700"}`}>
            {service.isProviderPaid ? (manual ? "Marcado pagado" : "Pagado") : `Saldo ${money(balance, service.currency)}`}
          </p>
        </div>
      </div>

      {service.netCostOriginal > 0 && (
        <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${pct >= 100 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {payments.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {payments.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
              <div>
                <p className="font-medium tabular-nums text-slate-900">
                  {money(p.amountOriginal, p.currency)}
                  {p.currency === "USD" && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      × {p.exchangeRate.toLocaleString("es-CO")} = {formatCOP(p.amountCop)}
                    </span>
                  )}
                </p>
                <p className="text-slate-500">
                  {formatDate(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference && ` · Ref. ${p.reference}`}
                  {p.bookingReference && ` · Loc. ${p.bookingReference}`}
                </p>
                {p.notes && <p className="text-slate-500">{p.notes}</p>}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => void onRemove(p.id)}
                  className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Anular giro de ${money(p.amountOriginal, p.currency)}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {manual && (
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          Marcado como pagado a mano en la tabla, sin giros registrados.
        </p>
      )}

      {!readOnly && balance > 0 && !manual && (
        <div className="border-t border-slate-100 px-3 py-2">
          {formOpen ? (
            <TransferForm service={service} balance={balance} onCancel={onToggleForm} onSubmit={onAdd} />
          ) : (
            <button
              type="button"
              onClick={onToggleForm}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Plus className="size-3.5" aria-hidden /> Registrar giro
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function TransferForm({
  service,
  balance,
  onCancel,
  onSubmit,
}: {
  service: DossierService;
  balance: number;
  onCancel: () => void;
  onSubmit: (payment: Omit<ProviderPayment, "id" | "amountCop">) => Promise<boolean>;
}) {
  const id = useId();
  const isUsd = service.currency === "USD";
  const [amount, setAmount] = useState(balance);
  const [trm, setTrm] = useState(isUsd ? service.exchangeRate : 1);
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER_BANCOLOMBIA");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const exceeds = amount > balance;
  const invalid = amount <= 0 || exceeds || (isUsd && trm <= 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (invalid || submitting) return;
    setSubmitting(true);
    await onSubmit({
      serviceId: service.id,
      currency: service.currency,
      amountOriginal: round2(amount),
      exchangeRate: isUsd ? trm : 1,
      method,
      paidAt: new Date(`${date || todayLocal()}T12:00:00`).toISOString(),
      reference: reference.trim(),
      bookingReference: service.bookingReference,
      notes: notes.trim(),
    });
    setSubmitting(false);
  }

  const fieldLabel = "mb-1 block text-[11px] font-medium text-slate-600";
  const field = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className={`grid gap-2.5 ${isUsd ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <label htmlFor={`${id}-amount`} className={fieldLabel}>
            Monto ({service.currency})
          </label>
          <div className="rounded-md border border-slate-300 focus-within:border-slate-500">
            <MoneyInput id={`${id}-amount`} value={amount} onValueChange={setAmount} prefix={isUsd ? "US$" : "$"} aria-invalid={exceeds} />
          </div>
        </div>
        {isUsd && (
          <div>
            <label htmlFor={`${id}-trm`} className={fieldLabel}>
              TRM del giro
            </label>
            <div className="rounded-md border border-slate-300 focus-within:border-slate-500">
              <MoneyInput id={`${id}-trm`} value={trm} onValueChange={setTrm} />
            </div>
          </div>
        )}
      </div>
      {exceeds && <p className="text-xs text-red-600">Supera el saldo de {money(balance, service.currency)}.</p>}
      {isUsd && amount > 0 && trm > 0 && <p className="text-xs text-slate-500">Salida de caja: {formatCOP(amount * trm)}</p>}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor={`${id}-method`} className={fieldLabel}>
            Medio
          </label>
          <select id={`${id}-method`} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={field}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-date`} className={fieldLabel}>
            Fecha
          </label>
          <input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-ref`} className={fieldLabel}>
          N.º de transferencia / comprobante
        </label>
        <input id={`${id}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. 000123456" className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-notes`} className={fieldLabel}>
          Notas
        </label>
        <input id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
      </div>
      {!service.bookingReference && (
        <p className="text-xs text-amber-700">Este servicio aún no tiene localizador; puedes escribirlo en la tabla.</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={invalid || submitting}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          {submitting ? "Registrando…" : `Registrar giro ${amount > 0 && !exceeds ? money(amount, service.currency) : ""}`}
        </button>
      </div>
    </form>
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
