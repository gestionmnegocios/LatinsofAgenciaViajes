import type { AgencyInfo, CommissionItem } from "@/lib/data/commission-repository";
import { formatCOP, formatDate, formatDateTime } from "@/lib/finance/format";

export interface Statement {
  key: string;
  agentName: string;
  items: CommissionItem[];
  /** Fecha del pago del lote; null = cuenta de cobro previa al pago. */
  paidAt: string | null;
  batchId: string | null;
}

/**
 * Cuenta de cobro / liquidación de comisiones (FR-4.4), una página por asesor.
 * Solo se ve al imprimir; "Guardar como PDF" en el diálogo del navegador.
 */
export function CommissionStatements({
  statements,
  agency,
  issuedAt,
}: {
  statements: Statement[];
  agency: AgencyInfo | null;
  issuedAt: string;
}) {
  return (
    <div className="hidden bg-white text-slate-900 print:block">
      {statements.map((s) => {
        const total = s.items.reduce((sum, i) => sum + i.amount, 0);
        return (
          <section key={s.key} className="break-after-page px-2 py-4 text-[12px] leading-snug last:break-after-auto">
            <header className="flex items-start justify-between border-b border-slate-300 pb-3">
              <div>
                <p className="text-base font-semibold">{agency?.name ?? ""}</p>
                <p>NIT {agency?.nit ?? ""}{agency?.city ? ` · ${agency.city}` : ""}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-semibold">Liquidación de comisiones</p>
                <p>Emitida: {formatDateTime(issuedAt)}</p>
                {s.batchId && <p className="font-mono text-[10px]">Lote {s.batchId.slice(0, 8).toUpperCase()}</p>}
              </div>
            </header>

            <p className="mt-4">
              <span className="font-semibold">Asesor:</span> {s.agentName}
            </p>
            <p>
              <span className="font-semibold">Estado:</span>{" "}
              {s.paidAt ? `Pagada el ${formatDateTime(s.paidAt)}` : "Pendiente de pago"}
            </p>

            <table className="mt-4 w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-400 text-left">
                  <th className="py-1 pr-2">Expediente</th>
                  <th className="py-1 pr-2">Cliente</th>
                  <th className="py-1 pr-2">Liquidado</th>
                  <th className="py-1 pr-2 text-right">Base gravable (4155)</th>
                  <th className="py-1 pr-2 text-right">%</th>
                  <th className="py-1 text-right">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.id} className="border-b border-slate-200">
                    <td className="py-1 pr-2">
                      <span className="font-mono">{i.dossierCode}</span> {i.dossierTitle}
                    </td>
                    <td className="py-1 pr-2">{i.clientName}</td>
                    <td className="py-1 pr-2">{i.liquidatedAt ? formatDate(i.liquidatedAt) : "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{formatCOP(i.taxableBase)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{i.percentage}</td>
                    <td className="py-1 text-right tabular-nums">{formatCOP(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={5} className="py-2 pr-2 text-right">
                    Total comisiones (cuenta 520518)
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatCOP(total)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-16 grid grid-cols-2 gap-12">
              <div className="border-t border-slate-500 pt-1">Firma del asesor · {s.agentName}</div>
              <div className="border-t border-slate-500 pt-1">Firma autorizada · {agency?.name ?? ""}</div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
