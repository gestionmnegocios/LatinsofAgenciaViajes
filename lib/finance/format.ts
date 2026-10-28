/** Formateadores es-CO. Instancias de Intl reutilizadas: crearlas es costoso. */

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const plainFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** $ 504.202 — pesos sin decimales (redondeo al peso). */
export function formatCOP(value: number): string {
  // Normaliza el espacio duro de Intl para que copiar/pegar y WhatsApp sean limpios.
  return copFormatter.format(Math.round(value)).replace(/ /g, " ");
}

export function formatUSD(value: number): string {
  return usdFormatter.format(value).replace(/ /g, " ");
}

/** Número para inputs: 3200000 → "3.200.000". */
export function formatNumber(value: number): string {
  return plainFormatter.format(value);
}

/** Valor plano para pegar en Siigo/Alegra: entero en pesos, sin separadores. */
export function toAccountingValue(value: number): string {
  return String(Math.round(value));
}

/**
 * Parsea montos escritos en formato colombiano ("3.200.000", "1.250,50", "$ 3200000").
 * Devuelve 0 si no hay dígitos.
 */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function formatDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

/** ISO → valor para `<input type="datetime-local">` en hora local. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Valor de `<input type="datetime-local">` → ISO, o `null` si está vacío. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
