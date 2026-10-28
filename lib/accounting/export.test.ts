import assert from "node:assert/strict";
import { test } from "node:test";

import { ACCOUNTS, bogotaDate, buildAccountingLines, toCsv, type LiquidatedDossier } from "./export.ts";

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
