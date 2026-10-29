/**
 * FR-5.2 Exportación contable plana (CSV) para importar en Siigo / Alegra.
 *
 * Un comprobante por expediente liquidado, en pesos enteros y cuadrado:
 *
 *   Débito  111005  Bancos                      Venta total        (cliente)
 *   Crédito 281505  Ingresos para terceros      Costo por servicio (proveedor)
 *   Crédito 2408    IVA por pagar               IVA sobre el margen
 *   Crédito 4155    Ingresos por intermediación Base gravable neta (absorbe el redondeo)
 *   Débito  520518  Gasto comisiones            Comisión del asesor
 *   Crédito 233520  Comisiones por pagar        Comisión del asesor
 *
 * Y un comprobante por cada giro a proveedor, fechado el día del giro:
 *
 *   Débito  281505  Ingresos para terceros      Costo del servicio a la TRM cotizada (proveedor)
 *   Crédito 111005  Bancos                      Salida de caja real
 *   Débito  530525 / Crédito 421020             Diferencia en cambio si la TRM del giro difiere
 *
 * Las cuentas auxiliares (`ACCOUNTS`) deben coincidir con el plan de cuentas
 * de cada agencia en su software contable.
 */

export const ACCOUNTS = {
  bank: { code: "111005", name: "Bancos moneda nacional" },
  thirdParty: { code: "281505", name: "Ingresos recibidos para terceros" },
  iva: { code: "2408", name: "IVA por pagar 19% sobre margen" },
  income: { code: "4155", name: "Ingresos por intermediación" },
  commissionExpense: { code: "520518", name: "Gasto comisiones a comerciales" },
  commissionPayable: { code: "233520", name: "Comisiones por pagar" },
  fxLoss: { code: "530525", name: "Diferencia en cambio (gasto)" },
  fxGain: { code: "421020", name: "Diferencia en cambio (ingreso)" },
} as const;

/** Giro a un proveedor (salida de caja). */
export interface ProviderTransfer {
  id: string;
  dossierCode: string;
  dossierTitle: string;
  paidAt: string;
  providerName: string;
  providerNit: string;
  currency: "COP" | "USD";
  amountOriginal: number;
  /** TRM con la que se cotizó y causó el servicio (1 en COP). */
  quotedRate: number;
  /** Salida de caja en pesos (monto × TRM del giro). */
  amountCop: number;
  reference: string;
  bookingReference: string;
}

export interface LiquidatedDossier {
  code: string;
  title: string;
  liquidatedAt: string;
  clientDocument: string;
  clientName: string;
  agentName: string;
  totalSale: number;
  totalCost: number;
  taxableBase: number;
  iva: number;
  commission: number;
  providers: { name: string; nit: string; cost: number }[];
}

export interface AccountingLine {
  voucher: string;
  date: string;
  account: string;
  description: string;
  thirdPartyId: string;
  thirdPartyName: string;
  debit: number;
  credit: number;
}

/** Fecha dd/mm/aaaa en hora de Colombia. */
export function bogotaDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

export function buildAccountingLines(dossiers: readonly LiquidatedDossier[]): AccountingLine[] {
  const lines: AccountingLine[] = [];
  for (const d of dossiers) {
    const date = bogotaDate(d.liquidatedAt);
    const base = { voucher: d.code, date };
    const sale = Math.round(d.totalSale);
    const iva = Math.round(d.iva);
    const costs = d.providers.filter((p) => p.cost > 0).map((p) => ({ ...p, cost: Math.round(p.cost) }));
    const income = sale - costs.reduce((t, p) => t + p.cost, 0) - iva;
    const commission = Math.round(d.commission);
    const desc = (label: string) => `${d.code} ${d.title} · ${label}`;

    lines.push({ ...base, account: ACCOUNTS.bank.code, description: desc("Recaudo cliente"), thirdPartyId: d.clientDocument, thirdPartyName: d.clientName, debit: sale, credit: 0 });
    for (const p of costs) {
      lines.push({ ...base, account: ACCOUNTS.thirdParty.code, description: desc(`Pago a terceros ${p.name}`), thirdPartyId: p.nit, thirdPartyName: p.name, debit: 0, credit: p.cost });
    }
    if (iva > 0) {
      lines.push({ ...base, account: ACCOUNTS.iva.code, description: desc("IVA 19% sobre margen"), thirdPartyId: d.clientDocument, thirdPartyName: d.clientName, debit: 0, credit: iva });
    }
    if (income !== 0) {
      // Margen negativo: la pérdida va al débito de la misma cuenta.
      lines.push({ ...base, account: ACCOUNTS.income.code, description: desc("Ingreso por intermediación"), thirdPartyId: d.clientDocument, thirdPartyName: d.clientName, debit: income < 0 ? -income : 0, credit: income > 0 ? income : 0 });
    }
    if (commission > 0) {
      lines.push({ ...base, account: ACCOUNTS.commissionExpense.code, description: desc("Comisión asesor"), thirdPartyId: "", thirdPartyName: d.agentName, debit: commission, credit: 0 });
      lines.push({ ...base, account: ACCOUNTS.commissionPayable.code, description: desc("Comisión asesor por pagar"), thirdPartyId: "", thirdPartyName: d.agentName, debit: 0, credit: commission });
    }
  }
  return lines;
}

/**
 * Comprobantes de giros: cada uno salda en 281505 lo causado al proveedor y
 * lleva la diferencia en cambio cuando la TRM real difiere de la cotizada.
 * El comprobante se identifica con el expediente y el giro (`EXP-1049-G3F9A2C`),
 * estable entre exportaciones de distintos meses.
 */
export function buildTransferLines(transfers: readonly ProviderTransfer[]): AccountingLine[] {
  const lines: AccountingLine[] = [];
  const sorted = [...transfers].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  for (const t of sorted) {
    const voucher = `${t.dossierCode}-G${t.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    const base = { voucher, date: bogotaDate(t.paidAt) };
    const cash = Math.round(t.amountCop);
    const settled = Math.round(t.amountOriginal * (t.currency === "COP" ? 1 : t.quotedRate));
    const fx = cash - settled;
    const detail = [
      t.currency === "USD" ? `US$ ${t.amountOriginal}` : null,
      t.bookingReference ? `Loc. ${t.bookingReference}` : null,
      t.reference ? `Ref. ${t.reference}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const desc = (label: string) => `${t.dossierCode} ${t.dossierTitle} · ${label}${detail ? ` · ${detail}` : ""}`;
    const provider = { thirdPartyId: t.providerNit, thirdPartyName: t.providerName };

    lines.push({ ...base, account: ACCOUNTS.thirdParty.code, description: desc(`Giro a ${t.providerName}`), ...provider, debit: settled, credit: 0 });
    if (fx > 0) {
      lines.push({ ...base, account: ACCOUNTS.fxLoss.code, description: desc("Diferencia en cambio"), ...provider, debit: fx, credit: 0 });
    } else if (fx < 0) {
      lines.push({ ...base, account: ACCOUNTS.fxGain.code, description: desc("Diferencia en cambio"), ...provider, debit: 0, credit: -fx });
    }
    lines.push({ ...base, account: ACCOUNTS.bank.code, description: desc("Salida de caja"), ...provider, debit: 0, credit: cash });
  }
  return lines;
}

const HEADER = ["Comprobante", "Fecha", "Cuenta", "Descripción", "Identificación tercero", "Nombre tercero", "Débito", "Crédito"];

function cell(value: string | number): string {
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV separado por `;` (Excel en español) con BOM para que abra bien las tildes. */
export function toCsv(lines: readonly AccountingLine[]): string {
  const rows = lines.map((l) =>
    [l.voucher, l.date, l.account, l.description, l.thirdPartyId, l.thirdPartyName, l.debit, l.credit].map(cell).join(";"),
  );
  return `﻿${[HEADER.join(";"), ...rows].join("\r\n")}\r\n`;
}
