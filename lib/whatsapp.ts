/**
 * Recibo de abono pre-redactado para WhatsApp (FR-3.2).
 *
 * El texto se arma con saltos de línea reales y emojis Unicode, y se codifica
 * una sola vez con `encodeURIComponent`, que serializa correctamente los pares
 * sustitutos UTF-16 de los emojis (👉 → %F0%9F%91%89) y los "\n" (%0A).
 */

import type { ClientPayment, Dossier, FinancialSummary, PaymentMethod } from "./finance/types.ts";
import { formatCOP, formatDate } from "./finance/format.ts";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  TRANSFER_BANCOLOMBIA: "Transferencia Bancolombia",
  NEQUI_DAVIPLATA: "Nequi / Daviplata",
  CARD_GATEWAY: "Tarjeta (pasarela)",
  CASH: "Efectivo",
  OTHER: "Otro",
};

/** Deja solo dígitos y antepone el indicativo 57 a celulares colombianos de 10 dígitos. */
export function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits;
}

export interface ReceiptMessageInput {
  dossier: Pick<
    Dossier,
    "agencyName" | "code" | "destinationTitle" | "departureDate" | "returnDate" | "client"
  >;
  payment: Pick<ClientPayment, "amount" | "method" | "paidAt" | "receiptNumber">;
  summary: Pick<FinancialSummary, "totalSale" | "totalPaid" | "balanceDue" | "paidPercentage">;
  /** Fecha límite para completar el pago (ISO), opcional. */
  balanceDueDate?: string | null;
}

export function buildReceiptMessage({
  dossier,
  payment,
  summary,
  balanceDueDate,
}: ReceiptMessageInput): string {
  const firstName = dossier.client.fullName.split(" ")[0] ?? dossier.client.fullName;
  const isPaidInFull = summary.balanceDue <= 0;

  const lines = [
    `Hola ${firstName} 👋`,
    "",
    `✅ *Abono recibido* – ${dossier.agencyName}`,
    `🧾 Recibo: ${payment.receiptNumber || "—"}`,
    `📁 Expediente: ${dossier.code}`,
    "",
    `✈️ *${dossier.destinationTitle}*`,
    `📅 ${formatDate(dossier.departureDate)} → ${formatDate(dossier.returnDate)}`,
    "",
    `💵 Valor abonado: *${formatCOP(payment.amount)}*`,
    `💳 Medio: ${PAYMENT_METHOD_LABELS[payment.method]}`,
    `🗓️ Fecha: ${formatDate(payment.paidAt)}`,
    "",
    `📊 Total del plan: ${formatCOP(summary.totalSale)}`,
    `💰 Total abonado: ${formatCOP(summary.totalPaid)} (${Math.round(summary.paidPercentage)} %)`,
  ];

  if (isPaidInFull) {
    lines.push("", "🎉 ¡Tu plan está *100 % pagado*! Pronto te enviamos los vouchers.");
  } else {
    lines.push(`⏳ Saldo pendiente: *${formatCOP(summary.balanceDue)}*`);
    if (balanceDueDate) lines.push(`📌 Fecha límite de pago: ${formatDate(balanceDueDate)}`);
  }

  lines.push("", "¡Gracias por viajar con nosotros! 🌴");
  return lines.join("\n");
}

/**
 * Enlace universal wa.me (abre WhatsApp Web o Desktop).
 * Sin número válido devuelve `https://wa.me/?text=…` para elegir el chat.
 */
export function buildWhatsappLink(message: string, phone?: string): string {
  const number = phone ? normalizeWhatsappNumber(phone) : "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
