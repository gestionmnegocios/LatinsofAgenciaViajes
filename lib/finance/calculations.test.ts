/**
 * Ejecutar con: npm test  (node --test, type-stripping nativo de Node ≥ 22.18)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkLiquidation,
  computeFinancials,
  deadlineLevel,
  netCostInCop,
} from "./calculations.ts";
import { formatCOP, parseAmount } from "./format.ts";
import type { ClientPayment, DossierService } from "./types.ts";
import { buildReceiptMessage, buildWhatsappLink } from "../whatsapp.ts";

function service(overrides: Partial<DossierService> = {}): DossierService {
  return {
    id: "s1",
    providerId: null,
    providerName: "Mayorplus",
    serviceType: "PACKAGE",
    description: "Cancún 5 noches",
    bookingReference: "",
    currency: "COP",
    exchangeRate: 1,
    netCostOriginal: 3_200_000,
    salePrice: 3_800_000,
    paymentDeadline: null,
    isProviderPaid: false,
    ...overrides,
  };
}

function payment(amount: number): ClientPayment {
  return {
    id: crypto.randomUUID(),
    amount,
    method: "CASH",
    paidAt: "2026-10-28T15:00:00.000Z",
    receiptNumber: "RC-1",
    notes: "",
  };
}

test("Criterio 1: costo $3.200.000 / venta $3.800.000 / comisión 15 %", () => {
  const started = performance.now();
  const s = computeFinancials({
    services: [service()],
    payments: [],
    commissionRate: 15,
    status: "DRAFT",
  });
  const elapsed = performance.now() - started;

  assert.equal(formatCOP(s.grossMargin), "$ 600.000");
  assert.equal(formatCOP(s.netTaxableBase), "$ 504.202");
  assert.equal(formatCOP(s.ivaGenerated), "$ 95.798");
  assert.equal(formatCOP(s.commissionAmount), "$ 75.630");
  assert.equal(s.commissionStatus, "HELD");
  // Base + IVA debe cuadrar exactamente con el margen.
  assert.equal(s.netTaxableBase + s.ivaGenerated, s.grossMargin);
  assert.equal(s.agencyNetProfit, s.netTaxableBase - s.commissionAmount);
  assert.equal(s.puc.account2815, 3_200_000);
  assert.ok(elapsed < 100, `cálculo tardó ${elapsed} ms`);
});

test("USD: el costo neto se convierte a COP con la TRM", () => {
  assert.equal(
    netCostInCop({ currency: "USD", exchangeRate: 4_150.5, netCostOriginal: 1_000 }),
    4_150_500,
  );
  const s = computeFinancials({
    services: [service({ currency: "USD", exchangeRate: 4_000, netCostOriginal: 800, salePrice: 3_800_000 })],
    payments: [],
    commissionRate: 15,
    status: "DRAFT",
  });
  assert.equal(s.totalNetCost, 3_200_000);
  assert.equal(s.grossMargin, 600_000);
});

test("USD sin TRM no suma costo (input obligatorio en la UI)", () => {
  assert.equal(netCostInCop({ currency: "USD", exchangeRate: 0, netCostOriginal: 500 }), 0);
});

test("Comisión: HELD con saldo pendiente, RELEASED solo al 100 % y LIQUIDATED", () => {
  const base = { services: [service()], commissionRate: 15 };
  assert.equal(
    computeFinancials({ ...base, payments: [payment(3_800_000)], status: "CONFIRMED" }).commissionStatus,
    "HELD",
  );
  assert.equal(
    computeFinancials({ ...base, payments: [payment(1_000_000)], status: "LIQUIDATED" }).commissionStatus,
    "HELD",
  );
  assert.equal(
    computeFinancials({ ...base, payments: [payment(3_800_000)], status: "LIQUIDATED" }).commissionStatus,
    "RELEASED",
  );
  assert.equal(
    computeFinancials({ ...base, payments: [], status: "CANCELLED" }).commissionStatus,
    "CANCELLED",
  );
});

test("Abonos: porcentaje pagado y saldo pendiente", () => {
  const s = computeFinancials({
    services: [service()],
    payments: [payment(1_900_000)],
    commissionRate: 15,
    status: "CONFIRMED",
  });
  assert.equal(s.paidPercentage, 50);
  assert.equal(s.balanceDue, 1_900_000);
});

test("Margen negativo: sin IVA ni comisión", () => {
  const s = computeFinancials({
    services: [service({ salePrice: 3_000_000 })],
    payments: [],
    commissionRate: 15,
    status: "DRAFT",
  });
  assert.equal(s.isLoss, true);
  assert.equal(s.ivaGenerated, 0);
  assert.equal(s.commissionAmount, 0);
  assert.equal(s.agencyNetProfit, -200_000);
});

test("Liquidación exige cliente al 100 % y proveedores pagados", () => {
  const services = [service()];
  const pending = computeFinancials({ services, payments: [payment(3_800_000)], commissionRate: 15, status: "CONFIRMED" });
  assert.equal(checkLiquidation("CONFIRMED", services, pending).canLiquidate, false);
  const paidServices = [service({ isProviderPaid: true })];
  assert.equal(checkLiquidation("CONFIRMED", paidServices, pending).canLiquidate, true);
  assert.equal(checkLiquidation("DRAFT", paidServices, pending).canLiquidate, false);
});

test("Semáforo de time-limit", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  assert.equal(deadlineLevel({ paymentDeadline: "2026-10-28T11:00:00Z", isProviderPaid: false }, now), "expired");
  assert.equal(deadlineLevel({ paymentDeadline: "2026-10-29T06:00:00Z", isProviderPaid: false }, now), "due-24h");
  assert.equal(deadlineLevel({ paymentDeadline: "2026-11-05T06:00:00Z", isProviderPaid: false }, now), "ok");
  assert.equal(deadlineLevel({ paymentDeadline: "2026-10-28T11:00:00Z", isProviderPaid: true }, now), "paid");
});

test("parseAmount acepta formato colombiano", () => {
  assert.equal(parseAmount("3.200.000"), 3_200_000);
  assert.equal(parseAmount("$ 1.250,50"), 1_250.5);
  assert.equal(parseAmount(""), 0);
});

test("Criterio 4: enlace de WhatsApp sin errores de encoding", () => {
  const summary = computeFinancials({
    services: [service()],
    payments: [payment(1_900_000)],
    commissionRate: 15,
    status: "CONFIRMED",
  });
  const message = buildReceiptMessage({
    dossier: {
      agencyName: "Viajes Laureles",
      code: "EXP-1049",
      destinationTitle: "Cancún – Familia Pérez",
      departureDate: "2026-12-15",
      returnDate: "2026-12-20",
      client: { id: "c1", documentNumber: "1", fullName: "Andrés Pérez", whatsapp: "300 123 4567" },
    },
    payment: payment(1_900_000),
    summary,
  });
  const link = buildWhatsappLink(message, "300 123 4567");

  assert.ok(link.startsWith("https://wa.me/573001234567?text="));
  const encoded = link.split("?text=")[1];
  assert.doesNotMatch(encoded, /[\s\n#&]/, "no debe haber caracteres sin codificar");
  assert.match(encoded, /%0A/, "saltos de línea codificados");
  assert.match(encoded, /%E2%9C%85/, "emoji ✅ codificado en UTF-8");
  assert.equal(decodeURIComponent(encoded), message, "ida y vuelta sin pérdida");
  assert.match(message, /Saldo pendiente: \*\$ 1\.900\.000\*/);
  assert.equal(buildWhatsappLink("hola").startsWith("https://wa.me/?text="), true);
});
