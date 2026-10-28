"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { formatCOP, formatDate, formatDateTime } from "@/lib/finance/format";
import type { ClientPayment, Dossier } from "@/lib/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/whatsapp";

export interface ReceiptToPrint {
  payment: ClientPayment;
  /** Estado de cartera acumulado hasta este abono. */
  totalSale: number;
  totalPaid: number;
  balanceDue: number;
}

/**
 * Recibo de caja de un abono, impreso fuera del Workspace (portal en <body>).
 * Mientras imprime, `body.print-receipt` oculta el resto de la página.
 */
export function PaymentReceipt({
  dossier,
  receipt,
  onDone,
}: {
  dossier: Dossier;
  receipt: ReceiptToPrint | null;
  onDone: () => void;
}) {
  const [issuedAt, setIssuedAt] = useState("");

  useEffect(() => {
    if (!receipt) return;
    document.body.classList.add("print-receipt");
    const done = () => {
      document.body.classList.remove("print-receipt");
      onDone();
    };
    window.addEventListener("afterprint", done, { once: true });
    // Un frame para que el portal pinte antes de abrir el diálogo.
    const frame = requestAnimationFrame(() => {
      setIssuedAt(new Date().toISOString());
      requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("print-receipt");
    };
  }, [receipt, onDone]);

  if (!receipt) return null;
  const { payment } = receipt;

  return createPortal(
    <div id="print-root" className="hidden bg-white p-6 text-[13px] leading-snug text-slate-900 print:block">
      <header className="flex items-start justify-between border-b border-slate-300 pb-3">
        <div>
          <p className="text-lg font-semibold">{dossier.agencyName}</p>
          {dossier.agencyNit && <p>NIT {dossier.agencyNit}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">Recibo de caja</p>
          <p className="font-mono">{payment.receiptNumber || "—"}</p>
          <p>Fecha: {formatDate(payment.paidAt)}</p>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-[10rem_1fr] gap-y-2">
        <dt className="font-semibold">Recibimos de</dt>
        <dd>
          {dossier.client.fullName}
          {dossier.client.documentNumber && ` · CC/NIT ${dossier.client.documentNumber}`}
        </dd>
        <dt className="font-semibold">La suma de</dt>
        <dd className="text-base font-semibold">{formatCOP(payment.amount)}</dd>
        <dt className="font-semibold">Por concepto de</dt>
        <dd>
          Abono al plan «{dossier.destinationTitle}», expediente {dossier.code}, del {formatDate(dossier.departureDate)} al{" "}
          {formatDate(dossier.returnDate)}.
        </dd>
        <dt className="font-semibold">Medio de pago</dt>
        <dd>{PAYMENT_METHOD_LABELS[payment.method]}</dd>
        {payment.notes && (
          <>
            <dt className="font-semibold">Referencia</dt>
            <dd>{payment.notes}</dd>
          </>
        )}
      </dl>

      <table className="mt-6 w-72 border-collapse">
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="py-1">Total del plan</td>
            <td className="py-1 text-right tabular-nums">{formatCOP(receipt.totalSale)}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1">Total abonado</td>
            <td className="py-1 text-right tabular-nums">{formatCOP(receipt.totalPaid)}</td>
          </tr>
          <tr className="font-semibold">
            <td className="py-1">Saldo pendiente</td>
            <td className="py-1 text-right tabular-nums">{formatCOP(receipt.balanceDue)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-6 text-[11px] text-slate-600">
        Los valores recibidos para el pago de servicios turísticos a proveedores son ingresos para terceros. Este
        documento no reemplaza la factura electrónica de la agencia.
      </p>

      <div className="mt-16 grid grid-cols-2 gap-12">
        <div className="border-t border-slate-500 pt-1">Recibido por · {dossier.agent.fullName}</div>
        <div className="border-t border-slate-500 pt-1">Cliente · {dossier.client.fullName}</div>
      </div>
      {issuedAt && <p className="mt-6 text-[10px] text-slate-500">Impreso: {formatDateTime(issuedAt)}</p>}
    </div>,
    document.body,
  );
}
