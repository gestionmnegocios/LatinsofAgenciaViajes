import { test } from "node:test";
import assert from "node:assert/strict";

import type { DossierService, QuoteOption } from "./finance/types.ts";
import { buildQuoteMessage, buildWhatsappLink, earliestValidDeadline } from "./whatsapp.ts";

function service(overrides: Partial<DossierService>): DossierService {
  return {
    id: "s",
    providerId: null,
    providerName: "Mayorplus",
    serviceType: "HOTEL",
    description: "",
    bookingReference: "",
    currency: "COP",
    exchangeRate: 1,
    netCostOriginal: 1_000_000,
    salePrice: 1_300_000,
    paymentDeadline: null,
    isProviderPaid: false,
    ...overrides,
  };
}

const dossier = {
  agencyName: "Viajes Laureles",
  code: "EXP-1003",
  destinationTitle: "Cancún",
  departureDate: "2026-12-12",
  returnDate: "2026-12-17",
  adultsCount: 2,
  childrenCount: 1,
  client: { id: "c", documentNumber: "1", fullName: "Alejandra Zapata", whatsapp: "3001234567" },
};

const options: QuoteOption[] = [
  {
    id: "o1",
    title: "Opción 1",
    isSelected: false,
    isArchived: false,
    services: [
      service({ description: "Hotel Riu Cancún 5 noches", paymentDeadline: "2026-11-02T20:00:00Z" }),
      service({ serviceType: "FLIGHT", description: "", providerName: "Avianca", salePrice: 700_000, paymentDeadline: "2026-10-29T20:00:00Z" }),
    ],
  },
  { id: "o2", title: "Opción 2 · Ciclo Viajes", isSelected: false, isArchived: false, services: [service({ salePrice: 2_500_000, description: "Todo incluido" })] },
  { id: "o3", title: "Vacía", isSelected: false, isArchived: false, services: [] },
];

test("cotización: precios de venta por opción, sin costos ni mayorista", () => {
  const msg = buildQuoteMessage({ dossier, options });
  assert.ok(msg.startsWith("Hola Alejandra 👋"));
  assert.ok(msg.includes("👥 2 adultos y 1 niño"));
  assert.ok(msg.includes("1️⃣ *Opción 1*\n🏨 Hotel Riu Cancún 5 noches\n✈️ Vuelo\n💰 Total: *$ 2.000.000*"));
  assert.ok(msg.includes("2️⃣ *Opción 2*\n"));
  assert.ok(!msg.includes("Ciclo Viajes"), "el título interno de la pestaña no se envía");
  assert.ok(!msg.includes("Vacía"), "omite opciones sin precio");
  assert.ok(!msg.includes("Mayorplus") && !msg.includes("1.000.000"), "no expone mayorista ni costo");
  assert.ok(msg.includes("número de la opción"));
  assert.ok(msg.endsWith("📁 Ref. EXP-1003"));
});

test("cotización de una sola opción pide un SÍ y el enlace codifica sin pérdida", () => {
  const msg = buildQuoteMessage({ dossier, options: [options[1]], validUntil: "2026-11-02T20:00:00Z" });
  assert.ok(!msg.includes("1️⃣"));
  assert.ok(msg.includes("*Tu plan*"));
  assert.ok(msg.includes("Respóndeme *SÍ*"));
  assert.ok(msg.includes("hasta el"));
  const url = new URL(buildWhatsappLink(msg, dossier.client.whatsapp));
  assert.equal(url.pathname, "/573001234567");
  assert.equal(url.searchParams.get("text"), msg);
});

test("vigencia: el time-limit futuro más próximo", () => {
  assert.equal(earliestValidDeadline(options, Date.parse("2026-10-28T12:00:00Z")), "2026-10-29T20:00:00Z");
  assert.equal(earliestValidDeadline(options, Date.parse("2026-10-30T12:00:00Z")), "2026-11-02T20:00:00Z");
  assert.equal(earliestValidDeadline(options, Date.parse("2026-12-01T00:00:00Z")), null);
});

test("mensaje con enlace web: URL intacta y llamado a «Lo quiero»", async () => {
  const { buildQuoteLinkMessage } = await import("./whatsapp.ts");
  const url = "https://latinsofagenciaviajes.vercel.app/cotizacion?t=3f9a2c11-0000-4000-8000-000000000001";
  const msg = buildQuoteLinkMessage({ dossier, url, optionCount: 2 });
  assert.ok(msg.includes(`\n${url}\n`), "el enlace va solo en su línea para que WhatsApp lo detecte");
  assert.ok(msg.includes("las 2 opciones") && msg.includes("*Lo quiero*"));
  assert.equal(new URL(buildWhatsappLink(msg, "3001234567")).searchParams.get("text"), msg);
  assert.ok(buildQuoteLinkMessage({ dossier, url, optionCount: 1 }).includes("tu plan"));
});
