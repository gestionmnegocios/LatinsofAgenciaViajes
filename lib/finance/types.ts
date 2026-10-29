/**
 * Tipos de dominio de TravelSaaS Colombia.
 *
 * Reflejan 1:1 los ENUM y tablas de `supabase/migrations/0001_init.sql`
 * (en camelCase). Se usan uniones literales en vez de `enum` de TypeScript
 * para que el motor financiero pueda ejecutarse con el type-stripping nativo
 * de Node en los tests.
 */

export type Currency = "COP" | "USD";

export type ServiceType =
  | "HOTEL"
  | "FLIGHT"
  | "PACKAGE"
  | "ASSISTANCE"
  | "TRANSFER"
  | "TOUR";

export type DossierStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "LIQUIDATED"
  | "CANCELLED";

export type CommissionStatus = "HELD" | "RELEASED" | "PAID" | "CANCELLED";

export type PaymentMethod =
  | "TRANSFER_BANCOLOMBIA"
  | "NEQUI_DAVIPLATA"
  | "CARD_GATEWAY"
  | "CASH"
  | "OTHER";

export type ProviderCategory =
  | "MAYORISTA"
  | "CONSOLIDADOR"
  | "HOTEL"
  | "ASISTENCIA"
  | "OPERADOR_LOCAL";

/** Proveedor del catálogo (global del sistema o personalizado de la agencia). */
export interface Provider {
  id: string;
  /** `null` = proveedor precargado global; si no, pertenece a una agencia. */
  agencyId: string | null;
  name: string;
  category: ProviderCategory;
  nit: string | null;
  defaultCurrency: Currency;
  defaultPucAccount: string;
  paymentDeadlineHours: number;
  isSystemPreload: boolean;
  /** Ficha de contacto (solo proveedores propios de la agencia). */
  contactName: string | null;
  phone: string | null;
  email: string | null;
  /** Banco, tipo y número de cuenta para los giros. */
  bankDetails: string | null;
}

/**
 * Línea de servicio de una opción de cotización.
 *
 * El costo neto se captura en la moneda del proveedor (`netCostOriginal`) y se
 * convierte a COP con `exchangeRate` (TRM convenida). El precio de venta al
 * cliente siempre se expresa en COP.
 */
export interface DossierService {
  id: string;
  providerId: string | null;
  providerName: string;
  serviceType: ServiceType;
  description: string;
  /** Localizador / PNR. */
  bookingReference: string;
  currency: Currency;
  /** TRM convenida. Siempre 1 cuando `currency` es COP. */
  exchangeRate: number;
  /** Costo neto en la moneda del proveedor. */
  netCostOriginal: number;
  /** Precio de venta al cliente en COP. */
  salePrice: number;
  /** Time-limit del proveedor (ISO 8601) o `null` si no aplica. */
  paymentDeadline: string | null;
  isProviderPaid: boolean;
}

export interface QuoteOption {
  id: string;
  title: string;
  services: DossierService[];
  /** Opción congelada al confirmar el expediente. */
  isSelected: boolean;
  /** Opciones descartadas al confirmar (se conservan, no se borran). */
  isArchived: boolean;
}

/** Giro a un proveedor: salida de caja ligada a un servicio y su localizador. */
export interface ProviderPayment {
  id: string;
  serviceId: string;
  /** Moneda del servicio; en USD el giro lleva su propia TRM. */
  currency: Currency;
  amountOriginal: number;
  exchangeRate: number;
  /** Valor en pesos del giro (amountOriginal × exchangeRate). */
  amountCop: number;
  method: PaymentMethod;
  paidAt: string;
  /** N.º de transferencia o comprobante. */
  reference: string;
  /** Localizador del servicio al momento del giro. */
  bookingReference: string;
  notes: string;
}

export interface ClientPayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  /** ISO 8601. */
  paidAt: string;
  receiptNumber: string;
  notes: string;
}

export interface DossierClient {
  id: string;
  documentNumber: string;
  fullName: string;
  /** Número en formato internacional sin "+" (ej. 573001234567). */
  whatsapp: string;
}

export interface DossierAgent {
  id: string;
  fullName: string;
  /** Porcentaje sobre la Base Gravable Neta (ej. 15 = 15 %). */
  commissionRate: number;
}

export interface Dossier {
  id: string;
  agencyId: string;
  agencyName: string;
  agencyNit: string;
  /** Membrete para documentos impresos (configuración de la agencia). */
  agencyAddress: string | null;
  agencyCity: string | null;
  agencyPhone: string | null;
  agencyLogoUrl: string | null;
  /** Ej. EXP-1049. */
  code: string;
  destinationTitle: string;
  /** Fechas ISO (YYYY-MM-DD). */
  departureDate: string;
  returnDate: string;
  adultsCount: number;
  childrenCount: number;
  status: DossierStatus;
  client: DossierClient;
  agent: DossierAgent;
  options: QuoteOption[];
  payments: ClientPayment[];
  providerPayments: ProviderPayment[];
  /** Opción que el cliente marcó «Lo quiero» en el enlace web (la más reciente). */
  clientChoice: { optionId: string; acceptedAt: string } | null;
  liquidatedAt: string | null;
}

/** Saldos para la pre-contabilidad (PUC colombiano). */
export interface PucBreakdown {
  /** 2815 – Ingresos recibidos para terceros (dinero de proveedores). */
  account2815: number;
  /** 4155 – Ingresos por intermediación (Base Gravable Neta). */
  account4155: number;
  /** 2408 – IVA por pagar (19 % incluido en el margen). */
  account2408: number;
  /** 520518 – Gasto comisiones a comerciales. */
  account520518: number;
}

/** Resultado del motor financiero para una opción / expediente. */
export interface FinancialSummary {
  totalSale: number;
  /** Dinero de terceros en COP. */
  totalNetCost: number;
  grossMargin: number;
  netTaxableBase: number;
  ivaGenerated: number;
  commissionRate: number;
  commissionAmount: number;
  commissionStatus: CommissionStatus;
  agencyNetProfit: number;
  /** Margen bruto ≤ 0: no hay base gravable ni comisión. */
  isLoss: boolean;
  totalPaid: number;
  balanceDue: number;
  /** 0–100, con dos decimales. */
  paidPercentage: number;
  puc: PucBreakdown;
}
