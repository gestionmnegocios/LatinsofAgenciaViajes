"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, PlaneTakeoff, Wallet } from "lucide-react";

import { fetchDashboardAlerts, type AlertKind, type DashboardAlert } from "@/lib/data/dashboard-repository";
import { formatCOP, formatDate, formatDateTime } from "@/lib/finance/format";
import { useNow } from "@/lib/hooks/use-now";
import { expedienteHref } from "./DossierHome";

const CARDS: {
  kind: AlertKind;
  title: string;
  hint: string;
  icon: typeof AlarmClock;
  tone: { card: string; active: string; count: string; icon: string };
}[] = [
  {
    kind: "PROVIDER_DUE",
    title: "Pagos a proveedores",
    hint: "Time-limit vencido o en ≤ 24 h",
    icon: AlarmClock,
    tone: { card: "border-red-200 bg-red-50", active: "ring-2 ring-red-400", count: "text-red-700", icon: "text-red-500" },
  },
  {
    kind: "CLIENT_DUE",
    title: "Abonos de clientes",
    hint: "Saldo pendiente con vencimiento esta semana",
    icon: Wallet,
    tone: { card: "border-amber-200 bg-amber-50", active: "ring-2 ring-amber-400", count: "text-amber-700", icon: "text-amber-500" },
  },
  {
    kind: "DEPARTURE",
    title: "Salidas próximas",
    hint: "Pasajeros que viajan en ≤ 48 h",
    icon: PlaneTakeoff,
    tone: { card: "border-emerald-200 bg-emerald-50", active: "ring-2 ring-emerald-400", count: "text-emerald-700", icon: "text-emerald-500" },
  },
];

function summary(kind: AlertKind, items: readonly DashboardAlert[]): string {
  if (items.length === 0) return "Sin pendientes";
  if (kind === "DEPARTURE") {
    const pax = items.reduce((t, i) => t + i.pax, 0);
    return `${pax} ${pax === 1 ? "pasajero" : "pasajeros"}`;
  }
  return formatCOP(items.reduce((t, i) => t + (i.amount ?? 0), 0));
}

/** FR-1.1 Semáforo: tres contadores críticos; al tocar uno se listan sus expedientes. */
export function AlertBoard() {
  const now = useNow();
  const [alerts, setAlerts] = useState<DashboardAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AlertKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardAlerts()
      .then((data) => !cancelled && setAlerts(data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Error al cargar alertas."));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  }

  const of = (kind: AlertKind) => (alerts ?? []).filter((a) => a.kind === kind);
  const openCard = CARDS.find((c) => c.kind === open);
  const openItems = open ? of(open) : [];

  return (
    <section aria-label="Semáforo" className="mb-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {CARDS.map((c) => {
          const items = of(c.kind);
          const dossiers = new Set(items.map((i) => i.dossierId)).size;
          const Icon = c.icon;
          return (
            <button
              key={c.kind}
              type="button"
              aria-expanded={open === c.kind}
              disabled={alerts === null}
              onClick={() => setOpen((o) => (o === c.kind ? null : c.kind))}
              className={`rounded-xl border px-4 py-3 text-left transition hover:shadow-sm disabled:cursor-wait ${c.tone.card} ${
                open === c.kind ? c.tone.active : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{c.title}</span>
                <Icon className={`size-4 ${c.tone.icon}`} aria-hidden />
              </div>
              {alerts === null ? (
                <div className="mt-2 h-8 w-16 animate-pulse rounded bg-white/70" />
              ) : (
                <p className={`mt-1 text-3xl font-semibold tabular-nums ${c.tone.count}`}>
                  {c.kind === "PROVIDER_DUE" ? items.length : dossiers}
                </p>
              )}
              <p className="text-xs text-slate-600">
                {alerts === null ? c.hint : `${summary(c.kind, items)} · ${c.hint}`}
              </p>
            </button>
          );
        })}
      </div>

      {openCard && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {openItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Nada pendiente en «{openCard.title}».</p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <tbody className="divide-y divide-slate-100">
                {openItems.map((a, idx) => {
                  const expired = now !== null && a.dueAt !== null && a.kind !== "DEPARTURE" && Date.parse(a.dueAt) < now;
                  return (
                    <tr key={`${a.dossierId}-${idx}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link href={expedienteHref(a.dossierId)} className="hover:underline">
                          <span className="font-mono text-xs font-semibold text-slate-900">{a.dossierCode}</span>{" "}
                          <span className="text-slate-900">{a.title}</span>
                          <span className="block text-xs text-slate-500">
                            {a.clientName}
                            {a.detail && ` · ${a.detail}`}
                          </span>
                        </Link>
                      </td>
                      <td className={`px-4 py-2.5 text-xs ${expired ? "font-semibold text-red-700" : "text-slate-600"}`}>
                        {a.dueAt ? (a.kind === "DEPARTURE" ? `Sale ${formatDate(a.dueAt)}` : formatDateTime(a.dueAt)) : "—"}
                        {expired && " · vencido"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                        {a.kind === "DEPARTURE" ? `${a.pax} pax` : formatCOP(a.amount ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
