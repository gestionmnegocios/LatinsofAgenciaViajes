"use client";

import { useId, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { buildAccountingLines, buildTransferLines, toCsv } from "@/lib/accounting/export";
import { fetchLiquidatedDossiers, fetchProviderTransfers } from "@/lib/data/dashboard-repository";
import { useNow } from "@/lib/hooks/use-now";

/** "2026-10" → rango [1 oct, 1 nov) en hora de Colombia (UTC−5, sin horario de verano). */
function monthRange(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${month}-01T00:00:00-05:00`, `${next}-01T00:00:00-05:00`];
}

function currentMonth(now: number): string {
  const d = new Date(now - 5 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** FR-5.2 Exporta los expedientes liquidados y los giros a proveedores del mes como CSV para Siigo / Alegra. */
export function AccountingExport() {
  const id = useId();
  const now = useNow();
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const month = picked || (now !== null ? currentMonth(now) : "");

  async function handleExport() {
    if (!month) return;
    setBusy(true);
    setMessage(null);
    try {
      const range = monthRange(month);
      const [dossiers, transfers] = await Promise.all([fetchLiquidatedDossiers(...range), fetchProviderTransfers(...range)]);
      if (dossiers.length === 0 && transfers.length === 0) {
        setMessage({ tone: "info", text: "No hay expedientes liquidados ni giros a proveedores en ese mes." });
        return;
      }
      const lines = [...buildAccountingLines(dossiers), ...buildTransferLines(transfers)];
      const blob = new Blob([toCsv(lines)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contabilidad-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({
        tone: "info",
        text:
          `${dossiers.length} ${dossiers.length === 1 ? "expediente liquidado" : "expedientes liquidados"} y ` +
          `${transfers.length} ${transfers.length === 1 ? "giro" : "giros"} a proveedores exportados.`,
      });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "No se pudo exportar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm text-slate-600">
        Contabilidad
      </label>
      <input
        id={id}
        type="month"
        value={month}
        onChange={(e) => setPicked(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
      />
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy || !month}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
        Exportar CSV
      </button>
      {message && (
        <span role="status" className={`text-xs ${message.tone === "error" ? "text-red-600" : "text-slate-500"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
