/**
 * Motor financiero DIAN / Ingresos para Terceros.
 *
 * Funciones puras, sin dependencias de React ni de Supabase, para que el
 * Termómetro Financiero calcule en memoria (<1 ms por recálculo) y para que la
 * misma lógica se pueda probar con `node --test`. La función SQL
 * `public.compute_dossier_financials` replica estas fórmulas en el servidor.
 *
 *   Margen Bruto        = Venta Total − Costo Terceros
 *   Base Gravable Neta  = Margen Bruto / 1,19           (Cuenta 4155)
 *   IVA Generado        = Margen Bruto − Base Neta      (Cuenta 2408)
 *   Comisión Asesor     = Base Neta × Tasa / 100        (Cuenta 520518)
 *   Utilidad Agencia    = Base Neta − Comisión
 */

import type {
  ClientPayment,
  CommissionStatus,
  Currency,
  Dossier,
  DossierService,
  DossierStatus,
  FinancialSummary,
  QuoteOption,
} from "./types.ts";

/** Factor de IVA incluido en el margen (19 %). */
export const IVA_FACTOR = 1.19;

/** Redondeo a centavos (NUMERIC(12,2) en PostgreSQL), sin errores de coma flotante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Convierte un número de entrada a un monto válido (no negativo, finito). */
function toAmount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Costo neto de un servicio en COP aplicando la TRM cuando es USD. */
export function netCostInCop(
  service: Pick<DossierService, "currency" | "exchangeRate" | "netCostOriginal">,
): number {
  const rate = service.currency === "COP" ? 1 : toAmount(service.exchangeRate);
  return round2(toAmount(service.netCostOriginal) * rate);
}

/** Indica si un servicio en USD aún no tiene TRM válida. */
export function isMissingExchangeRate(
  service: Pick<DossierService, "currency" | "exchangeRate">,
): boolean {
  return service.currency !== "COP" && toAmount(service.exchangeRate) === 0;
}

export function defaultExchangeRate(currency: Currency, trm: number): number {
  return currency === "COP" ? 1 : trm;
}

/**
 * Estado de la comisión.
 * Solo se libera cuando el cliente pagó el 100 % y el expediente está LIQUIDATED.
 */
export function resolveCommissionStatus(
  status: DossierStatus,
  balanceDue: number,
): CommissionStatus {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "LIQUIDATED" && balanceDue <= 0) return "RELEASED";
  return "HELD";
}

export interface ComputeFinancialsInput {
  services: readonly DossierService[];
  payments: readonly ClientPayment[];
  commissionRate: number;
  status: DossierStatus;
}

/** Calcula el resumen financiero completo de un conjunto de servicios y abonos. */
export function computeFinancials({
  services,
  payments,
  commissionRate,
  status,
}: ComputeFinancialsInput): FinancialSummary {
  const totalSale = round2(
    services.reduce((sum, s) => sum + toAmount(s.salePrice), 0),
  );
  const totalNetCost = round2(
    services.reduce((sum, s) => sum + netCostInCop(s), 0),
  );
  const grossMargin = round2(totalSale - totalNetCost);
  const isLoss = grossMargin <= 0;

  // Con margen negativo no hay hecho generador de IVA ni base comisionable.
  const netTaxableBase = isLoss ? grossMargin : round2(grossMargin / IVA_FACTOR);
  const ivaGenerated = isLoss ? 0 : round2(grossMargin - netTaxableBase);

  const rate = toAmount(commissionRate);
  const commissionAmount = isLoss ? 0 : round2(netTaxableBase * (rate / 100));
  const agencyNetProfit = round2(netTaxableBase - commissionAmount);

  const totalPaid = round2(payments.reduce((sum, p) => sum + toAmount(p.amount), 0));
  const balanceDue = round2(Math.max(totalSale - totalPaid, 0));
  const paidPercentage =
    totalSale > 0 ? round2(Math.min((totalPaid / totalSale) * 100, 100)) : 0;

  return {
    totalSale,
    totalNetCost,
    grossMargin,
    netTaxableBase,
    ivaGenerated,
    commissionRate: rate,
    commissionAmount,
    commissionStatus: resolveCommissionStatus(status, balanceDue),
    agencyNetProfit,
    isLoss,
    totalPaid,
    balanceDue,
    paidPercentage,
    puc: {
      account2815: totalNetCost,
      account4155: Math.max(netTaxableBase, 0),
      account2408: ivaGenerated,
      account520518: commissionAmount,
    },
  };
}

/**
 * Opción que alimenta el Termómetro: en DRAFT la pestaña activa; en cualquier
 * otro estado la opción congelada (`isSelected`).
 */
export function resolveWorkingOption(
  dossier: Pick<Dossier, "status" | "options">,
  activeOptionId: string,
): QuoteOption | undefined {
  if (dossier.status === "DRAFT") {
    return dossier.options.find((o) => o.id === activeOptionId) ?? dossier.options[0];
  }
  return dossier.options.find((o) => o.isSelected && !o.isArchived);
}

export interface LiquidationCheck {
  canLiquidate: boolean;
  reasons: string[];
}

/** Precondiciones de FR-4.3: cliente al 100 % y todos los proveedores pagados. */
export function checkLiquidation(
  status: DossierStatus,
  services: readonly DossierService[],
  summary: Pick<FinancialSummary, "balanceDue" | "totalSale">,
): LiquidationCheck {
  const reasons: string[] = [];
  if (status !== "CONFIRMED" && status !== "IN_PROGRESS") {
    reasons.push("El expediente debe estar confirmado.");
  }
  if (summary.totalSale <= 0) reasons.push("No hay servicios con valor de venta.");
  if (summary.balanceDue > 0) reasons.push("El cliente tiene saldo pendiente.");
  const unpaid = services.filter((s) => !s.isProviderPaid).length;
  if (unpaid > 0) {
    reasons.push(
      unpaid === 1
        ? "Hay 1 servicio sin pago al proveedor."
        : `Hay ${unpaid} servicios sin pago al proveedor.`,
    );
  }
  return { canLiquidate: reasons.length === 0, reasons };
}

export type DeadlineLevel = "paid" | "expired" | "due-24h" | "ok" | "none";

/** Semáforo de time-limit de proveedor (FR-1.1). */
export function deadlineLevel(
  service: Pick<DossierService, "paymentDeadline" | "isProviderPaid">,
  now: number,
): DeadlineLevel {
  if (service.isProviderPaid) return "paid";
  if (!service.paymentDeadline) return "none";
  const deadline = Date.parse(service.paymentDeadline);
  if (Number.isNaN(deadline)) return "none";
  if (deadline <= now) return "expired";
  if (deadline - now <= 24 * 60 * 60 * 1000) return "due-24h";
  return "ok";
}
