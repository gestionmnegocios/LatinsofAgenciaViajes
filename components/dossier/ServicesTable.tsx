"use client";

import { AlertTriangle, CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";

import { deadlineLevel, isMissingExchangeRate, netCostInCop, round2 } from "@/lib/finance/calculations";
import { formatCOP, formatNumber, fromDateTimeLocal, toDateTimeLocal } from "@/lib/finance/format";
import type { Currency, DossierService, DossierStatus, Provider, ServiceType } from "@/lib/finance/types";
import { useNow } from "@/lib/hooks/use-now";
import { MoneyInput } from "./MoneyInput";
import { ProviderCombobox } from "./ProviderCombobox";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  PACKAGE: "Paquete",
  HOTEL: "Hotel",
  FLIGHT: "Vuelo",
  ASSISTANCE: "Asistencia",
  TRANSFER: "Traslado",
  TOUR: "Tour",
};

interface ServicesTableProps {
  services: readonly DossierService[];
  status: DossierStatus;
  providers: readonly Provider[];
  onAdd: () => void;
  onUpdate: (serviceId: string, patch: Partial<DossierService>) => void;
  onRemove: (serviceId: string) => void;
  onCreateProvider: (name: string) => Provider;
  /** Servicios con giros al proveedor: su estado de pago lo calculan los giros. */
  servicesWithTransfers?: ReadonlySet<string>;
}

/**
 * Grilla de costos editable en línea (FR-2.2). Cada celda escribe directo en
 * el store; no hay botón "Guardar" ni recarga.
 */
export function ServicesTable({
  services,
  status,
  providers,
  onAdd,
  onUpdate,
  onRemove,
  onCreateProvider,
  servicesWithTransfers,
}: ServicesTableProps) {
  const locked = status === "LIQUIDATED" || status === "CANCELLED";
  const isFile = status !== "DRAFT";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-3 py-2">Servicio</th>
              <th scope="col" className="w-28 px-2 py-2">Moneda / TRM</th>
              <th scope="col" className="w-36 px-2 py-2 text-right">Costo neto</th>
              <th scope="col" className="w-36 px-2 py-2 text-right">Venta cliente</th>
              <th scope="col" className="w-44 px-2 py-2">{isFile ? "Time-limit / Pago" : "Time-limit"}</th>
              <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                providers={providers}
                locked={locked}
                isFile={isFile}
                onUpdate={(patch) => onUpdate(service.id, patch)}
                onRemove={() => onRemove(service.id)}
                onCreateProvider={onCreateProvider}
                hasTransfers={servicesWithTransfers?.has(service.id) ?? false}
              />
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  Sin servicios. Agrega el primero para empezar a cotizar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!locked && (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <Plus className="size-4" aria-hidden /> Agregar servicio
        </button>
      )}
    </div>
  );
}

interface ServiceRowProps {
  service: DossierService;
  providers: readonly Provider[];
  locked: boolean;
  isFile: boolean;
  onUpdate: (patch: Partial<DossierService>) => void;
  onRemove: () => void;
  onCreateProvider: (name: string) => Provider;
  hasTransfers: boolean;
}

const inputClass =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-200 focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:hover:border-transparent";

function ServiceRow({ service, providers, locked, isFile, onUpdate, onRemove, onCreateProvider, hasTransfers }: ServiceRowProps) {
  const now = useNow();
  const costCop = netCostInCop(service);
  const margin = round2(service.salePrice - costCop);
  const missingTrm = isMissingExchangeRate(service);
  const level = now === null ? "none" : deadlineLevel(service, now);

  function handleProviderSelect(provider: Provider) {
    const patch: Partial<DossierService> = {
      providerId: provider.id,
      providerName: provider.name,
    };
    // Primer proveedor del servicio: hereda moneda y time-limit por defecto.
    if (!service.providerId && service.netCostOriginal === 0) {
      patch.currency = provider.defaultCurrency;
    }
    if (!service.paymentDeadline) {
      patch.paymentDeadline = new Date(Date.now() + provider.paymentDeadlineHours * 3_600_000).toISOString();
    }
    onUpdate(patch);
  }

  return (
    <tr className="align-top transition hover:bg-slate-50/60">
      <td className="min-w-64 px-3 py-2">
        <ProviderCombobox
          providers={providers}
          value={service.providerName}
          disabled={locked}
          onSelect={handleProviderSelect}
          onCreate={onCreateProvider}
        />
        <div className="mt-0.5 flex items-center gap-1">
          <select
            aria-label="Tipo de servicio"
            value={service.serviceType}
            disabled={locked}
            onChange={(e) => onUpdate({ serviceType: e.target.value as ServiceType })}
            className="w-24 shrink-0 rounded-md border border-transparent bg-slate-100 px-1 py-1 text-xs font-medium text-slate-700 outline-none hover:border-slate-200 focus:border-slate-400 disabled:cursor-not-allowed"
          >
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label="Descripción del servicio"
            placeholder="Descripción (hotel, ruta, plan…)"
            title={service.description}
            value={service.description}
            disabled={locked}
            onChange={(e) => onUpdate({ description: e.target.value })}
            className={`${inputClass} min-w-0 text-slate-600`}
          />
        </div>
        {isFile && (
          <input
            aria-label="Localizador / PNR"
            placeholder="Localizador / PNR"
            value={service.bookingReference}
            disabled={locked}
            onChange={(e) => onUpdate({ bookingReference: e.target.value.toUpperCase() })}
            className={`${inputClass} mt-0.5 font-mono text-xs`}
          />
        )}
      </td>

      <td className="px-2 py-2">
        <select
          aria-label="Moneda del costo"
          value={service.currency}
          disabled={locked || hasTransfers}
          title={hasTransfers ? "Tiene giros registrados en esta moneda" : undefined}
          onChange={(e) => onUpdate({ currency: e.target.value as Currency })}
          className="w-full rounded-md border border-transparent bg-slate-100 px-1.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:border-slate-200 focus:border-slate-400 disabled:cursor-not-allowed"
        >
          <option value="COP">COP</option>
          <option value="USD">USD</option>
        </select>
        {service.currency === "USD" && (
          <div className="mt-1">
            <MoneyInput
              aria-label="TRM convenida"
              aria-invalid={missingTrm}
              required
              title="TRM convenida con el proveedor"
              value={service.exchangeRate}
              disabled={locked}
              onValueChange={(exchangeRate) => onUpdate({ exchangeRate })}
              prefix="TRM"
              className={missingTrm ? "rounded-md ring-1 ring-red-400" : ""}
            />
          </div>
        )}
      </td>

      <td className="px-2 py-2">
        <MoneyInput
          aria-label={`Costo neto en ${service.currency}`}
          value={service.netCostOriginal}
          disabled={locked}
          prefix={service.currency === "USD" ? "US$" : "$"}
          onValueChange={(netCostOriginal) => onUpdate({ netCostOriginal })}
        />
        {service.currency === "USD" && (
          <p className={`mt-1 px-2 text-right text-xs tabular-nums ${missingTrm ? "text-red-600" : "text-slate-500"}`}>
            {missingTrm ? "Ingresa la TRM" : `≈ ${formatCOP(costCop)}`}
          </p>
        )}
      </td>

      <td className="px-2 py-2">
        <MoneyInput
          aria-label="Precio de venta al cliente en COP"
          value={service.salePrice}
          disabled={locked}
          onValueChange={(salePrice) => onUpdate({ salePrice })}
        />
        {(service.salePrice > 0 || costCop > 0) && (
          <p
            className={`mt-1 px-2 text-right text-xs tabular-nums ${
              margin > 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            Margen {formatCOP(margin)}
            {service.salePrice > 0 && ` · ${formatNumber(round2((margin / service.salePrice) * 100))} %`}
          </p>
        )}
      </td>

      <td className="px-2 py-2">
        <input
          type="datetime-local"
          aria-label="Time-limit de pago al proveedor"
          value={toDateTimeLocal(service.paymentDeadline)}
          disabled={locked || service.isProviderPaid}
          onChange={(e) => onUpdate({ paymentDeadline: fromDateTimeLocal(e.target.value) })}
          className={`${inputClass} text-xs ${
            level === "expired" ? "border-red-300 bg-red-50 text-red-800" : level === "due-24h" ? "bg-red-50/50" : ""
          }`}
        />
        <DeadlineBadge level={level} />
        {isFile && (
          <label className="mt-1 flex cursor-pointer items-center gap-1.5 px-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={service.isProviderPaid}
              disabled={locked || hasTransfers}
              onChange={(e) => onUpdate({ isProviderPaid: e.target.checked })}
              className="size-3.5 accent-emerald-600"
            />
            {hasTransfers ? "Pagado (según giros)" : "Pagado al proveedor"}
          </label>
        )}
      </td>

      <td className="px-2 py-2">
        {!locked && !hasTransfers && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Eliminar servicio ${service.providerName || service.description || ""}`.trim()}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </td>
    </tr>
  );
}

export function DeadlineBadge({ level }: { level: ReturnType<typeof deadlineLevel> }) {
  if (level === "expired") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
        <AlertTriangle className="size-3" aria-hidden /> Vencido
      </span>
    );
  }
  if (level === "due-24h") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
        <Clock className="size-3" aria-hidden /> Vence en &lt;24 h
      </span>
    );
  }
  if (level === "paid") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 className="size-3" aria-hidden /> Proveedor pagado
      </span>
    );
  }
  return null;
}
