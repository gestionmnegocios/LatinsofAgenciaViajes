import assert from "node:assert/strict";
import { test } from "node:test";

import { ACCOUNTS, bogotaDate, buildAccountingLines, buildTransferLines, toCsv, type LiquidatedDossier, type ProviderTransfer } from "./export.ts";

const dossier: LiquidatedDossier = {
  code: "EXP-1049",
  title: "Cancún; Familia \"Pérez\"",
  liquidatedAt: "2026-11-01T03:30:00Z", // 31/10 en Bogotá
  clientDocument: "1036",
  clientName: "Andrés Pérez",
  agentName: "Laura",
  totalSale: 3_800_000,
  totalCost: 3_200_000,
  taxableBase: 504_201.68,
  iva: 95_798.32,
  commission: 75_630.25,
  providers: [
    { name: "Mayorplus", nit: "900111", cost: 2_000_000.4 },
    { name: "Ciclo Viajes", nit: "", cost: 1_199_999.6 },
  ],
};

test("comprobante cuadrado con las cuentas del PUC", () => {
  const lines = buildAccountingLines([dossier]);
  const debit = lines.reduce((t, l) => t + l.debit, 0);
  const credit = lines.reduce((t, l) => t + l.credit, 0);
  assert.equal(debit, credit);

  const byAccount = (code: string) => lines.filter((l) => l.account === code);
  assert.equal(byAccount(ACCOUNTS.bank.code)[0].debit, 3_800_000);
  assert.deepEqual(byAccount(ACCOUNTS.thirdParty.code).map((l) => l.credit), [2_000_000, 1_200_000]);
  assert.equal(byAccount(ACCOUNTS.iva.code)[0].credit, 95_798);
  // 3.800.000 − 3.200.000 − 95.798: la base absorbe el redondeo.
  assert.equal(byAccount(ACCOUNTS.income.code)[0].credit, 504_202);
  assert.equal(byAccount(ACCOUNTS.commissionExpense.code)[0].debit, 75_630);
  assert.equal(byAccount(ACCOUNTS.commissionPayable.code)[0].credit, 75_630);
  assert.ok(lines.every((l) => l.date === "31/10/2026" && l.voucher === "EXP-1049"));
});

test("CSV con BOM, separador ; y comillas escapadas", () => {
  const csv = toCsv(buildAccountingLines([dossier]));
  assert.ok(csv.startsWith("﻿Comprobante;Fecha;Cuenta;"));
  assert.ok(csv.includes('"EXP-1049 Cancún; Familia ""Pérez"" · Recaudo cliente"'));
  assert.ok(csv.includes(";3800000;0\r\n"));
});

test("margen negativo: sin IVA ni comisión, pérdida al débito de 4155", () => {
  const lines = buildAccountingLines([
    { ...dossier, totalSale: 1_000_000, iva: 0, commission: 0, providers: [{ name: "X", nit: "", cost: 1_100_000 }] },
  ]);
  assert.equal(lines.find((l) => l.account === ACCOUNTS.income.code)?.debit, 100_000);
  assert.equal(lines.some((l) => l.account === ACCOUNTS.iva.code || l.account === ACCOUNTS.commissionExpense.code), false);
});

test("bogotaDate usa la hora de Colombia", () => {
  assert.equal(bogotaDate("2026-12-01T04:59:00Z"), "30/11/2026");
  assert.equal(bogotaDate("2026-12-01T05:00:00Z"), "01/12/2026");
});

const transfer = (overrides: Partial<ProviderTransfer>): ProviderTransfer => ({
  id: "3f9a2c11-0000-4000-8000-000000000001",
  dossierCode: "EXP-1049",
  dossierTitle: "Cancún",
  paidAt: "2026-10-29T17:00:00Z",
  providerName: "Ciclo Viajes",
  providerNit: "900555",
  currency: "USD",
  amountOriginal: 500,
  quotedRate: 4_150,
  amountCop: 2_105_000,
  reference: "TRX-1",
  bookingReference: "PNR-QA1",
  ...overrides,
});

test("giro en USD: salda 281505 a la TRM cotizada y lleva la diferencia en cambio", () => {
  const lines = buildTransferLines([transfer({})]);
  assert.deepEqual(
    lines.map((l) => [l.account, l.debit, l.credit]),
    [
      [ACCOUNTS.thirdParty.code, 2_075_000, 0],
      [ACCOUNTS.fxLoss.code, 30_000, 0],
      [ACCOUNTS.bank.code, 0, 2_105_000],
    ],
  );
  assert.ok(lines.every((l) => l.voucher === "EXP-1049-G3F9A2C" && l.date === "29/10/2026" && l.thirdPartyName === "Ciclo Viajes"));
  assert.ok(lines[0].description.includes("Loc. PNR-QA1") && lines[0].description.includes("Ref. TRX-1"));
});

test("giros: TRM menor da ingreso por diferencia en cambio; en COP no hay diferencia; un comprobante por giro", () => {
  const lines = buildTransferLines([
    transfer({ id: "bbbbbb00-1", paidAt: "2026-10-30T17:00:00Z", amountOriginal: 300, amountCop: 300 * 4_100 }),
    transfer({ id: "aaaaaa00-1", currency: "COP", amountOriginal: 1_000_000, quotedRate: 1, amountCop: 1_000_000, paidAt: "2026-10-20T17:00:00Z" }),
    transfer({ id: "cccccc00-1", dossierCode: "EXP-1050", currency: "COP", amountOriginal: 500_000, quotedRate: 1, amountCop: 500_000 }),
  ]);
  const byVoucher = (v: string) => lines.filter((l) => l.voucher === v);
  assert.equal(lines[0].voucher, "EXP-1049-GAAAAAA", "ordenados por fecha");
  assert.equal(byVoucher("EXP-1049-GAAAAAA").length, 2, "en COP no hay diferencia en cambio");
  assert.deepEqual(
    byVoucher("EXP-1049-GBBBBBB").map((l) => [l.account, l.debit, l.credit]),
    [
      [ACCOUNTS.thirdParty.code, 1_245_000, 0],
      [ACCOUNTS.fxGain.code, 0, 15_000],
      [ACCOUNTS.bank.code, 0, 1_230_000],
    ],
  );
  assert.equal(byVoucher("EXP-1050-GCCCCCC").length, 2);
  const debit = lines.reduce((t, l) => t + l.debit, 0);
  const credit = lines.reduce((t, l) => t + l.credit, 0);
  assert.equal(debit, credit);
});
