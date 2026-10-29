/**
 * Mensajes pre-redactados para WhatsApp: cotización (FR-2.4) y recibo de abono (FR-3.2).
 *
 * El texto se arma con saltos de línea reales y emojis Unicode, y se codifica
 * una sola vez con `encodeURIComponent`, que serializa correctamente los pares
 * sustitutos UTF-16 de los emojis (👉 → %F0%9F%91%89) y los "\n" (%0A).
 */

import type { ClientPayment, Dossier, FinancialSummary, PaymentMethod, QuoteOption, ServiceType } from "./finance/types.ts";
import { formatCOP, formatDate, formatDateTime } from "./finance/format.ts";

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

const SERVICE_EMOJI: Record<ServiceType, string> = {
  HOTEL: "🏨",
  FLIGHT: "✈️",
  PACKAGE: "🧳",
  ASSISTANCE: "🩺",
  TRANSFER: "🚐",
  TOUR: "🗺️",
};

const SERVICE_LABEL: Record<ServiceType, string> = {
  HOTEL: "Hotel",
  FLIGHT: "Vuelo",
  PACKAGE: "Paquete",
  ASSISTANCE: "Asistencia médica",
  TRANSFER: "Traslados",
  TOUR: "Tour",
};

const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

export interface QuoteMessageInput {
  dossier: Pick<
    Dossier,
    "agencyName" | "code" | "destinationTitle" | "departureDate" | "returnDate" | "adultsCount" | "childrenCount" | "client"
  >;
  options: readonly Pick<QuoteOption, "services" | "isArchived">[];
  /** Fecha y hora hasta la que se sostienen los precios (ISO), opcional. */
  validUntil?: string | null;
}

/**
 * Cotización para que el cliente apruebe por WhatsApp (FR-2.4). Solo precios
 * de venta: nunca costos, márgenes ni el nombre del mayorista.
 */
export function buildQuoteMessage({ dossier, options, validUntil }: QuoteMessageInput): string {
  const firstName = dossier.client.fullName.split(" ")[0] ?? dossier.client.fullName;
  const pax = [
    `${dossier.adultsCount} ${dossier.adultsCount === 1 ? "adulto" : "adultos"}`,
    dossier.childrenCount > 0 ? `${dossier.childrenCount} ${dossier.childrenCount === 1 ? "niño" : "niños"}` : null,
  ]
    .filter(Boolean)
    .join(" y ");

  const quoted = options
    .filter((o) => !o.isArchived)
    .map((o) => ({ ...o, total: o.services.reduce((t, s) => t + s.salePrice, 0) }))
    .filter((o) => o.total > 0);

  const lines = [
    `Hola ${firstName} 👋`,
    "",
    `Te comparto la cotización de *${dossier.destinationTitle}* – ${dossier.agencyName}`,
    `📅 ${formatDate(dossier.departureDate)} → ${formatDate(dossier.returnDate)}`,
    `👥 ${pax}`,
  ];

  quoted.forEach((option, i) => {
    // El título de la pestaña es interno (suele llevar el mayorista): al cliente va numerada.
    const heading = quoted.length > 1 ? `${NUMBER_EMOJI[i] ?? `${i + 1}.`} *Opción ${i + 1}*` : "*Tu plan*";
    lines.push("", heading);
    for (const service of option.services) {
      const detail = service.description.trim() || SERVICE_LABEL[service.serviceType];
      lines.push(`${SERVICE_EMOJI[service.serviceType]} ${detail}`);
    }
    lines.push(`💰 Total: *${formatCOP(option.total)}*`);
  });

  lines.push("");
  if (validUntil) lines.push(`⏳ Precios sujetos a disponibilidad hasta el ${formatDateTime(validUntil)}`);
  else lines.push("⏳ Precios sujetos a disponibilidad.");
  lines.push(
    quoted.length > 1
      ? "Respóndeme con el número de la opción que prefieres y la reservamos 🙌"
      : "Respóndeme *SÍ* para confirmar y la reservamos 🙌",
    `📁 Ref. ${dossier.code}`,
  );
  return lines.join("\n");
}

/** Mensaje con el enlace a la micro-landing de la cotización. */
export function buildQuoteLinkMessage({
  dossier,
  url,
  optionCount,
}: {
  dossier: Pick<Dossier, "agencyName" | "code" | "destinationTitle" | "client">;
  url: string;
  optionCount: number;
}): string {
  const firstName = dossier.client.fullName.split(" ")[0] ?? dossier.client.fullName;
  return [
    `Hola ${firstName} 👋`,
    "",
    `Te comparto la cotización de *${dossier.destinationTitle}* – ${dossier.agencyName}:`,
    url,
    "",
    optionCount > 1
      ? `Ahí verás las ${optionCount} opciones; toca *Lo quiero* en la que prefieras 🙌`
      : "Ahí verás tu plan; si te gusta, toca *Lo quiero* 🙌",
    `📁 Ref. ${dossier.code}`,
  ].join("\n");
}

/**
 * Time-limit más próximo aún vigente entre los servicios cotizados: hasta ahí
 * se pueden sostener los precios.
 */
export function earliestValidDeadline(
  options: readonly Pick<QuoteOption, "services" | "isArchived">[],
  now: number,
): string | null {
  const future = options
    .filter((o) => !o.isArchived)
    .flatMap((o) => o.services.map((s) => s.paymentDeadline))
    .filter((d): d is string => d !== null && Date.parse(d) > now)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return future[0] ?? null;
}

/**
 * Enlace universal wa.me (abre WhatsApp Web o Desktop).
 * Sin número válido devuelve `https://wa.me/?text=…` para elegir el chat.
 */
export function buildWhatsappLink(message: string, phone?: string): string {
  const number = phone ? normalizeWhatsappNumber(phone) : "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
