import type { Dossier } from "../finance/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const DEMO_DOSSIER_ID = "d0000000-0000-4000-8000-000000001049";

/**
 * Expediente de demostración (mientras se conecta la carga desde Supabase).
 * Las fechas se generan relativas a `now` para que los semáforos se vean
 * siempre: un time-limit a <24 h en la Opción 1 y uno vencido en la Opción 2.
 */
export function createDemoDossier(now: number): Dossier {
  return {
    id: DEMO_DOSSIER_ID,
    agencyId: "a0000000-0000-4000-8000-000000000001",
    agencyName: "Viajes Laureles",
    agencyNit: "900123456-7",
    code: "EXP-1049",
    destinationTitle: "Cancún – Familia Pérez",
    departureDate: isoDate(now + 45 * DAY),
    returnDate: isoDate(now + 50 * DAY),
    adultsCount: 2,
    childrenCount: 1,
    status: "DRAFT",
    client: {
      id: "c0000000-0000-4000-8000-000000000001",
      documentNumber: "1036612345",
      fullName: "Andrés Pérez Restrepo",
      whatsapp: "3001234567",
    },
    agent: {
      id: "b0000000-0000-4000-8000-000000000001",
      fullName: "Laura Gómez",
      commissionRate: 15,
    },
    options: [
      {
        id: "e0000000-0000-4000-8000-000000000001",
        title: "Opción 1 · Mayorplus",
        isSelected: false,
        isArchived: false,
        services: [
          {
            id: "f0000000-0000-4000-8000-000000000001",
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "Mayorplus",
            serviceType: "PACKAGE",
            description: "Plan Cancún 5 noches todo incluido + aéreo MDE",
            bookingReference: "",
            currency: "COP",
            exchangeRate: 1,
            netCostOriginal: 3_200_000,
            salePrice: 3_800_000,
            paymentDeadline: new Date(now + 20 * HOUR).toISOString(),
            isProviderPaid: false,
          },
        ],
      },
      {
        id: "e0000000-0000-4000-8000-000000000002",
        title: "Opción 2 · Ciclo Viajes",
        isSelected: false,
        isArchived: false,
        services: [
          {
            id: "f0000000-0000-4000-8000-000000000002",
            providerId: "00000000-0000-4000-8000-000000000003",
            providerName: "Ciclo Viajes",
            serviceType: "HOTEL",
            description: "Riu Palace Las Américas – 5 noches",
            bookingReference: "",
            currency: "USD",
            exchangeRate: 4_150,
            netCostOriginal: 820,
            salePrice: 4_100_000,
            paymentDeadline: new Date(now - 2 * HOUR).toISOString(),
            isProviderPaid: false,
          },
          {
            id: "f0000000-0000-4000-8000-000000000003",
            providerId: "00000000-0000-4000-8000-000000000011",
            providerName: "Assist Card",
            serviceType: "ASSISTANCE",
            description: "Asistencia médica AC 60 – 3 pax",
            bookingReference: "",
            currency: "USD",
            exchangeRate: 4_150,
            netCostOriginal: 45,
            salePrice: 250_000,
            paymentDeadline: new Date(now + 4 * DAY).toISOString(),
            isProviderPaid: false,
          },
        ],
      },
    ],
    payments: [],
    liquidatedAt: null,
  };
}
