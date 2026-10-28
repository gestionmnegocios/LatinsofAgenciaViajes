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
} as const;

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
