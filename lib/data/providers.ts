import type { Currency, Provider, ProviderCategory } from "../finance/types.ts";

/**
 * Catálogo precargado de mayoristas y operadores (sección 6 del PRD).
 * Mismos registros que inserta `supabase/migrations/0001_init.sql`; los IDs
 * son fijos para que el cliente y la base coincidan.
 */
type ProviderRow = [id: string, name: string, category: ProviderCategory, currency: Currency, deadlineHours: number];

const ROWS: ProviderRow[] = [
  ["00000000-0000-4000-8000-000000000001", "Mayorplus", "MAYORISTA", "COP", 48],
  ["00000000-0000-4000-8000-000000000002", "Grupo Bienvenidos", "MAYORISTA", "COP", 48],
  ["00000000-0000-4000-8000-000000000003", "Ciclo Viajes", "MAYORISTA", "USD", 48],
  ["00000000-0000-4000-8000-000000000004", "Turismo al Vuelo", "MAYORISTA", "COP", 48],
  ["00000000-0000-4000-8000-000000000005", "Cielos Abiertos", "MAYORISTA", "USD", 48],
  ["00000000-0000-4000-8000-000000000006", "Mega Travel Colombia", "MAYORISTA", "USD", 72],
  ["00000000-0000-4000-8000-000000000007", "Hoteles Decameron", "HOTEL", "COP", 24],
  ["00000000-0000-4000-8000-000000000008", "Hoteles Estelar", "HOTEL", "COP", 48],
  ["00000000-0000-4000-8000-000000000009", "Travel Depot (Consolidador)", "CONSOLIDADOR", "COP", 6],
  ["00000000-0000-4000-8000-000000000010", "Consolidador.com (Aviatur)", "CONSOLIDADOR", "COP", 12],
  ["00000000-0000-4000-8000-000000000011", "Assist Card", "ASISTENCIA", "USD", 24],
  ["00000000-0000-4000-8000-000000000012", "Terrawind Global Protection", "ASISTENCIA", "USD", 24],
];

export const SYSTEM_PROVIDERS: readonly Provider[] = ROWS.map(
  ([id, name, category, defaultCurrency, paymentDeadlineHours]) => ({
    id,
    agencyId: null,
    name,
    category,
    nit: null,
    defaultCurrency,
    defaultPucAccount: "281505",
    paymentDeadlineHours,
    isSystemPreload: true,
    contactName: null,
    phone: null,
    email: null,
    bankDetails: null,
  }),
);

/** Búsqueda predictiva sin tildes ni mayúsculas ("decam" → Hoteles Decameron). */
export function searchProviders(providers: readonly Provider[], query: string): Provider[] {
  const q = normalize(query);
  if (!q) return [...providers];
  return providers
    .filter((p) => normalize(p.name).includes(q))
    .sort((a, b) => normalize(a.name).indexOf(q) - normalize(b.name).indexOf(q));
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
