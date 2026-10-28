"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Lock, LockOpen, TrendingDown, TrendingUp } from "lucide-react";

import { formatCOP, toAccountingValue } from "@/lib/finance/format";
import type { DossierStatus, FinancialSummary } from "@/lib/finance/types";

interface FinancialThermometerProps {
  summary: FinancialSummary;
  status: DossierStatus;
  /** Nombre de la opción que se está midiendo (ej. "Opción 2"). */
  optionTitle?: string;
}

/**
 * Panel lateral del Workspace: resumen DIAN del margen y bloque de
 * pre-contabilidad PUC. Es puramente presentacional; el cálculo lo hace
 * `computeFinancials` y llega por props.
 */
export function FinancialThermometer({ summary, status, optionTitle }: FinancialThermometerProps) {
  const isReleased = summary.commissionStatus === "RELEASED";
  const showReceivables = status !== "DRAFT";

  return (
    <aside
      aria-label="Termómetro financiero"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Termómetro financiero</h2>
          <p className="text-xs text-slate-500">
            {optionTitle ? `${optionTitle} · ` : ""}cálculo en vivo
          </p>
        </div>
        {summary.totalSale === 0 && summary.totalNetCost === 0 ? null : summary.isLoss ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            <TrendingDown className="size-3.5" aria-hidden /> Pérdida
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <TrendingUp className="size-3.5" aria-hidden /> Rentable
          </span>
        )}
      </header>

      <dl className="space-y-2 text-sm" aria-live="polite">
        <Row label="Venta total" value={summary.totalSale} strong />
        <Row label="Costo terceros (proveedores)" value={-summary.totalNetCost} muted />
        <div className="border-t border-dashed border-slate-200" />
        <Row
          label="Margen bruto"
          value={summary.grossMargin}
          strong
          tone={summary.isLoss ? "negative" : "default"}
        />
        <Row label="Base gravable neta (÷ 1,19)" value={summary.netTaxableBase} />
        <Row label="IVA 19 % sobre margen" value={summary.ivaGenerated} muted />
        <div className="flex items-center justify-between gap-2">
          <dt className="flex flex-wrap items-center gap-1.5 text-slate-600">
            Comisión asesor ({summary.commissionRate} %)
            <span
              className={
                isReleased
                  ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700"
                  : "inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
              }
            >
              {isReleased ? (
                <LockOpen className="size-3" aria-hidden />
              ) : (
                <Lock className="size-3" aria-hidden />
              )}
              {COMMISSION_LABELS[summary.commissionStatus]}
            </span>
          </dt>
          <dd className="tabular-nums text-slate-700">{formatCOP(-summary.commissionAmount)}</dd>
        </div>
      </dl>

      <div
        className={
          summary.agencyNetProfit > 0
            ? "rounded-lg bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200"
            : "rounded-lg bg-red-50 px-4 py-3 ring-1 ring-red-200"
        }
      >
        <p
          className={
            summary.agencyNetProfit > 0
              ? "text-xs font-medium uppercase tracking-wide text-emerald-700"
              : "text-xs font-medium uppercase tracking-wide text-red-700"
          }
        >
          Utilidad libre agencia
        </p>
        <p
          className={
            summary.agencyNetProfit > 0
              ? "text-2xl font-semibold tabular-nums text-emerald-700"
              : "text-2xl font-semibold tabular-nums text-red-700"
          }
          data-testid="agency-net-profit"
        >
          {formatCOP(summary.agencyNetProfit)}
        </p>
      </div>

      {showReceivables && <Receivables summary={summary} />}

      <PucBlock summary={summary} />
    </aside>
  );
}

const COMMISSION_LABELS: Record<FinancialSummary["commissionStatus"], string> = {
  HELD: "Retenida",
  RELEASED: "Liberada",
  PAID: "Pagada",
  CANCELLED: "Anulada",
};

interface RowProps {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
  tone?: "default" | "negative";
}

function Row({ label, value, strong, muted, tone = "default" }: RowProps) {
  const valueClass = [
    "tabular-nums",
    strong ? "font-semibold" : "",
    tone === "negative" ? "text-red-700" : muted ? "text-slate-500" : "text-slate-900",
  ].join(" ");
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className={strong ? "font-medium text-slate-800" : "text-slate-600"}>{label}</dt>
      <dd className={valueClass}>{formatCOP(value)}</dd>
    </div>
  );
}

/** Cartera del cliente: semáforo amarillo mientras haya saldo, verde al 100 %. */
function Receivables({ summary }: { summary: FinancialSummary }) {
  const isPaid = summary.balanceDue <= 0 && summary.totalSale > 0;
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">Cartera cliente</span>
        <span className={isPaid ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
          {summary.paidPercentage.toLocaleString("es-CO", { maximumFractionDigits: 1 })} % pagado
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={summary.paidPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={isPaid ? "h-full bg-emerald-500" : "h-full bg-amber-400"}
          style={{ width: `${summary.paidPercentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>Abonado {formatCOP(summary.totalPaid)}</span>
        <span className={isPaid ? "text-emerald-700" : "font-medium text-amber-700"}>
          Saldo {formatCOP(summary.balanceDue)}
        </span>
      </div>
    </section>
  );
}

const PUC_ROWS: { account: string; label: string; key: keyof FinancialSummary["puc"] }[] = [
  { account: "2815", label: "Ingresos recibidos para terceros", key: "account2815" },
  { account: "4155", label: "Ingresos por intermediación", key: "account4155" },
  { account: "2408", label: "IVA por pagar", key: "account2408" },
  { account: "520518", label: "Gasto comisiones comerciales", key: "account520518" },
];

/** Bloque de pre-contabilidad con copia en 1 clic para Siigo / Alegra. */
function PucBlock({ summary }: { summary: FinancialSummary }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pre-contabilidad PUC
      </h3>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {PUC_ROWS.map((row) => (
          <li key={row.account} className="flex items-center gap-2 px-3 py-2">
            <span className="w-14 shrink-0 font-mono text-xs font-semibold text-slate-700">
              {row.account}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={row.label}>
              {row.label}
            </span>
            <span className="text-xs tabular-nums text-slate-900">
              {formatCOP(summary.puc[row.key])}
            </span>
            <CopyButton value={toAccountingValue(summary.puc[row.key])} label={`Cuenta ${row.account}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Contextos sin Clipboard API (http en LAN): selección manual.
      window.prompt(`Copia el valor de ${label}:`, value);
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-slate-400"
      aria-label={copied ? `${label} copiada` : `Copiar ${label}: ${value}`}
      title={copied ? "Copiado" : `Copiar ${value}`}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}
