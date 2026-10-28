"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandCoins, LogOut, Plus } from "lucide-react";

import { useProfile } from "@/components/auth/AuthGate";
import { listDossiers, type DossierListItem } from "@/lib/data/dossier-repository";
import { formatCOP, formatDate } from "@/lib/finance/format";
import type { DossierStatus } from "@/lib/finance/types";
import { getSupabase } from "@/lib/supabase/client";
import { NewDossierForm } from "./NewDossierForm";

const STATUS: Record<DossierStatus, { label: string; className: string }> = {
  DRAFT: { label: "Cotización", className: "bg-slate-100 text-slate-700" },
  CONFIRMED: { label: "Expediente activo", className: "bg-sky-50 text-sky-700" },
  IN_PROGRESS: { label: "En curso", className: "bg-sky-50 text-sky-700" },
  LIQUIDATED: { label: "Liquidado", className: "bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "Cancelado", className: "bg-red-50 text-red-700" },
};

export function expedienteHref(id: string): string {
  return `/expediente?id=${encodeURIComponent(id)}`;
}

/** Inicio de la agencia: expedientes recientes + Apertura Flash. */
export function DossierHome() {
  const profile = useProfile();
  const router = useRouter();
  const [items, setItems] = useState<DossierListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listDossiers()
      .then((data) => !cancelled && setItems(data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Error al cargar."));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{profile.agencyName}</p>
          <h1 className="text-2xl font-semibold text-slate-900">Expedientes</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-slate-600 sm:inline">
            {profile.fullName} · {profile.role === "ADMIN" ? "Administrador" : "Asesor"}
          </span>
          <Link
            href="/comisiones"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <HandCoins className="size-4" aria-hidden /> Comisiones
          </Link>
          <button
            type="button"
            onClick={() => void getSupabase().auth.signOut()}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="size-4" aria-hidden /> Salir
          </button>
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus className="size-4" aria-hidden /> Nuevo expediente
            </button>
          )}
        </div>
      </header>

      {creating && (
        <div className="mb-6">
          <NewDossierForm onCreated={(id) => router.push(expedienteHref(id))} onCancel={() => setCreating(false)} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && items === null && <div className="h-40 animate-pulse rounded-xl bg-slate-200" aria-busy="true" />}

      {items && items.length === 0 && !creating && (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="text-sm text-slate-600">Aún no hay expedientes.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="size-4" aria-hidden /> Crear el primero
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2">Código</th>
                <th scope="col" className="px-4 py-2">Viaje</th>
                <th scope="col" className="px-4 py-2">Fechas</th>
                <th scope="col" className="px-4 py-2">Estado</th>
                <th scope="col" className="px-4 py-2 text-right">Venta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={expedienteHref(d.id)} className="font-mono text-xs font-semibold text-slate-900 hover:underline">
                      {d.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={expedienteHref(d.id)} className="block hover:underline">
                      <span className="font-medium text-slate-900">{d.title}</span>
                      <span className="block text-xs text-slate-500">{d.clientName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(d.departureDate)} → {formatDate(d.returnDate)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[d.status].className}`}>
                      {STATUS[d.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                    {/* El total se congela al confirmar; antes es una cotización en curso. */}
                    {d.status === "DRAFT" ? <span className="text-slate-400">—</span> : formatCOP(d.totalSale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
