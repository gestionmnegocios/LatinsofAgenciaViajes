"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Loader2 } from "lucide-react";

import { useProfile } from "@/components/auth/AuthGate";
import { expedienteHref } from "@/components/dossiers/DossierHome";
import {
  fetchAgencyInfo,
  listCommissions,
  settleCommissions,
  type AgencyInfo,
  type CommissionItem,
} from "@/lib/data/commission-repository";
import { formatCOP, formatDate, formatDateTime } from "@/lib/finance/format";
import type { CommissionStatus } from "@/lib/finance/types";
import { CommissionStatements, type Statement } from "./CommissionStatement";

const TABS: { status: CommissionStatus; label: string; hint: string }[] = [
  { status: "RELEASED", label: "Por pagar", hint: "Expedientes liquidados: listas para el corte." },
  { status: "HELD", label: "Retenidas", hint: "Expedientes confirmados con saldo o proveedores pendientes." },
  { status: "PAID", label: "Pagadas", hint: "Cortes ya pagados, agrupados por lote." },
];

const sum = (items: readonly CommissionItem[]) => items.reduce((t, i) => t + i.amount, 0);

/** Agrupa por asesor; las pagadas además por lote (una cuenta de cobro cada una). */
function groupItems(items: readonly CommissionItem[], status: CommissionStatus): Statement[] {
  const groups = new Map<string, Statement>();
  for (const item of items) {
    const key = status === "PAID" ? `${item.batchId}:${item.agentId}` : item.agentId;
    const group = groups.get(key) ?? {
      key,
      agentName: item.agentName,
      items: [],
      paidAt: status === "PAID" ? item.paidAt : null,
      batchId: status === "PAID" ? item.batchId : null,
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    status === "PAID" ? (b.paidAt ?? "").localeCompare(a.paidAt ?? "") : a.agentName.localeCompare(b.agentName),
  );
}

/** FR-4.4 Corte de comisiones: filtrar, agrupar por asesor, imprimir cuenta de cobro y pagar en lote. */
export function CommissionsPage() {
  const profile = useProfile();
  const isAdmin = profile.role === "ADMIN";

  const [items, setItems] = useState<CommissionItem[] | null>(null);
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<CommissionStatus>("RELEASED");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [settling, setSettling] = useState(false);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const [printing, setPrinting] = useState<{ statements: Statement[]; issuedAt: string } | null>(null);

  const reload = useCallback(async () => {
    const data = await listCommissions();
    setItems(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCommissions(), fetchAgencyInfo(profile.agencyId)])
      .then(([data, info]) => {
        if (cancelled) return;
        setItems(data);
        setAgency(info);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Error al cargar."));
    return () => {
      cancelled = true;
    };
  }, [profile.agencyId]);

  // Se imprime después de pintar las cuentas de cobro; al cerrar el diálogo se descartan.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  const visible = useMemo(() => (items ?? []).filter((i) => i.status === tab), [items, tab]);
  const groups = useMemo(() => groupItems(visible, tab), [visible, tab]);
  const counts = useMemo(() => {
    const c: Partial<Record<CommissionStatus, number>> = {};
    for (const i of items ?? []) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [items]);

  const selectedItems = visible.filter((i) => selected.has(i.id));
  const selectedAgents = new Set(selectedItems.map((i) => i.agentId)).size;
  const canSelect = isAdmin && tab === "RELEASED";

  function changeTab(status: CommissionStatus) {
    setTab(status);
    setSelected(new Set());
    setConfirming(false);
  }

  function toggle(ids: readonly string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setConfirming(false);
  }

  function print(statements: Statement[]) {
    setPrinting({ statements, issuedAt: new Date().toISOString() });
  }

  async function settle() {
    const ids = selectedItems.map((i) => i.id);
    setSettling(true);
    setError(null);
    try {
      const batch = await settleCommissions(ids);
      await reload();
      setSelected(new Set());
      setLastBatch(batch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago.");
    } finally {
      setSettling(false);
      setConfirming(false);
    }
  }

  const lastBatchStatements = useMemo(
    () => (lastBatch ? groupItems((items ?? []).filter((i) => i.batchId === lastBatch), "PAID") : []),
    [items, lastBatch],
  );

  const activeTab = TABS.find((t) => t.status === tab)!;

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 print:hidden">
        <header className="mb-6">
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="size-4" aria-hidden /> Expedientes
          </Link>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{profile.agencyName}</p>
          <h1 className="text-2xl font-semibold text-slate-900">{isAdmin ? "Corte de comisiones" : "Mis comisiones"}</h1>
        </header>

        <div role="tablist" aria-label="Estado de la comisión" className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 sm:inline-flex">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              role="tab"
              aria-selected={tab === t.status}
              onClick={() => changeTab(t.status)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                tab === t.status ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs tabular-nums text-slate-400">{counts[t.status] ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="mb-5 text-xs text-slate-500">{activeTab.hint}</p>

        {lastBatch && lastBatchStatements.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="size-4" aria-hidden />
              Pago registrado: {formatCOP(lastBatchStatements.reduce((t, s) => t + sum(s.items), 0))} a{" "}
              {lastBatchStatements.length} {lastBatchStatements.length === 1 ? "asesor" : "asesores"}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => print(lastBatchStatements)}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
              >
                <FileText className="size-4" aria-hidden /> Cuentas de cobro (PDF)
              </button>
              <button type="button" onClick={() => setLastBatch(null)} className="rounded-md px-2 text-sm text-emerald-800 hover:bg-emerald-100">
                Cerrar
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {items === null && !error && <div className="h-40 animate-pulse rounded-xl bg-slate-200" aria-busy="true" />}

        {items !== null && groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-600">
            No hay comisiones {activeTab.label.toLowerCase()}.
          </div>
        )}

        <div className="space-y-4">
          {groups.map((g) => {
            const ids = g.items.map((i) => i.id);
            const allOn = ids.every((id) => selected.has(id));
            const someOn = !allOn && ids.some((id) => selected.has(id));
            return (
              <section key={g.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {canSelect && (
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar todas las comisiones de ${g.agentName}`}
                        checked={allOn}
                        ref={(el) => {
                          if (el) el.indeterminate = someOn;
                        }}
                        onChange={(e) => toggle(ids, e.target.checked)}
                        className="size-4 accent-slate-900"
                      />
                    )}
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">{g.agentName}</h2>
                      <p className="text-xs text-slate-500">
                        {g.items.length} {g.items.length === 1 ? "expediente" : "expedientes"}
                        {g.paidAt && ` · pagado ${formatDateTime(g.paidAt)}`}
                        {g.batchId && <span className="font-mono"> · lote {g.batchId.slice(0, 8).toUpperCase()}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold tabular-nums text-slate-900">{formatCOP(sum(g.items))}</span>
                    {tab !== "HELD" && (
                      <button
                        type="button"
                        onClick={() => print([g])}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FileText className="size-3.5" aria-hidden />
                        {tab === "PAID" ? "Cuenta de cobro" : "Vista previa"}
                      </button>
                    )}
                  </div>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        {canSelect && <th scope="col" className="w-10 px-4 py-2"><span className="sr-only">Seleccionar</span></th>}
                        <th scope="col" className="px-4 py-2">Expediente</th>
                        <th scope="col" className="px-4 py-2">Liquidado</th>
                        <th scope="col" className="px-4 py-2 text-right">Base gravable</th>
                        <th scope="col" className="px-4 py-2 text-right">%</th>
                        <th scope="col" className="px-4 py-2 text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.items.map((i) => (
                        <tr key={i.id} className={selected.has(i.id) ? "bg-slate-50" : undefined}>
                          {canSelect && (
                            <td className="px-4 py-2.5">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar ${i.dossierCode}`}
                                checked={selected.has(i.id)}
                                onChange={(e) => toggle([i.id], e.target.checked)}
                                className="size-4 accent-slate-900"
                              />
                            </td>
                          )}
                          <td className="px-4 py-2.5">
                            <Link href={expedienteHref(i.dossierId)} className="hover:underline">
                              <span className="font-mono text-xs font-semibold text-slate-900">{i.dossierCode}</span>{" "}
                              <span className="text-slate-900">{i.dossierTitle}</span>
                              <span className="block text-xs text-slate-500">{i.clientName}</span>
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{i.liquidatedAt ? formatDate(i.liquidatedAt) : "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{formatCOP(i.taxableBase)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{i.percentage}</td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">{formatCOP(i.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {canSelect && selectedItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              {selectedItems.length} {selectedItems.length === 1 ? "comisión" : "comisiones"} · {selectedAgents}{" "}
              {selectedAgents === 1 ? "asesor" : "asesores"} ·{" "}
              <span className="font-semibold tabular-nums text-slate-900">{formatCOP(sum(selectedItems))}</span>
            </p>
            {confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700">¿Confirmas que ya se pagó?</span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={settling}
                  className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void settle()}
                  disabled={settling}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-emerald-400"
                >
                  {settling && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Sí, marcar como pagadas
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Marcar como pagadas
              </button>
            )}
          </div>
        </div>
      )}

      {printing && <CommissionStatements statements={printing.statements} agency={agency} issuedAt={printing.issuedAt} />}
    </>
  );
}
