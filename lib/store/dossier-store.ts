"use client";

/**
 * Estado del Workspace (Zustand).
 *
 * Toda la edición ocurre en memoria y el Termómetro se deriva con `useMemo`
 * de los servicios + abonos, así que cada tecla recalcula en <1 ms. La
 * conversión Cotización → Expediente solo cambia banderas sobre los mismos
 * objetos: ninguna cifra se borra ni hay navegación.
 *
 * Persistencia: si se carga con un `DossierPersistence`, las ediciones de
 * opciones/servicios se autoguardan con debounce en una cola ordenada, y las
 * transiciones (confirmar, liquidar) vacían la cola antes de llamar a la RPC
 * para que el servidor calcule sobre las mismas cifras que ve el asesor.
 * Sin adaptador (modo demo) todo queda en memoria.
 */

import { useMemo } from "react";
import { create } from "zustand";

import {
  checkLiquidation,
  computeFinancials,
  defaultExchangeRate,
  resolveWorkingOption,
} from "@/lib/finance/calculations";
import type {
  ClientPayment,
  Currency,
  Dossier,
  DossierService,
  FinancialSummary,
  Provider,
  QuoteOption,
} from "@/lib/finance/types";

/** TRM de referencia por defecto para nuevos servicios en USD (editable). */
export const DEFAULT_TRM = 4_150;

/** Retraso del autoguardado tras la última tecla. */
const AUTOSAVE_DELAY_MS = 700;

/** Operaciones de backend que necesita el Workspace (ver `lib/data/dossier-repository.ts`). */
export interface DossierPersistence {
  syncOptions: (dossierId: string, options: readonly QuoteOption[]) => Promise<void>;
  convertQuoteToFile: (dossierId: string, optionId: string) => Promise<void>;
  liquidate: (dossierId: string) => Promise<string>;
  insertPayment: (dossier: Dossier, payment: Omit<ClientPayment, "id">) => Promise<ClientPayment>;
  deletePayment: (paymentId: string) => Promise<void>;
  insertProvider: (provider: Provider) => Promise<void>;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface ActionResult {
  ok: boolean;
  reasons: string[];
}

function newId(): string {
  return crypto.randomUUID();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado.";
}

export function createEmptyService(currency: Currency = "COP", trm = DEFAULT_TRM): DossierService {
  return {
    id: newId(),
    providerId: null,
    providerName: "",
    serviceType: "PACKAGE",
    description: "",
    bookingReference: "",
    currency,
    exchangeRate: defaultExchangeRate(currency, trm),
    netCostOriginal: 0,
    salePrice: 0,
    paymentDeadline: null,
    isProviderPaid: false,
  };
}

interface DossierState {
  dossier: Dossier | null;
  providers: Provider[];
  activeOptionId: string;
  /** TRM sugerida para nuevos servicios USD. */
  defaultTrm: number;
  persistence: DossierPersistence | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Transición en curso (deshabilita los botones). */
  busy: "convert" | "liquidate" | null;

  loadDossier: (dossier: Dossier, providers: readonly Provider[], persistence?: DossierPersistence | null) => void;
  setActiveOption: (optionId: string) => void;
  addOption: (copyFromId?: string) => void;
  renameOption: (optionId: string, title: string) => void;
  removeOption: (optionId: string) => void;

  addService: (optionId: string) => void;
  updateService: (optionId: string, serviceId: string, patch: Partial<DossierService>) => void;
  removeService: (optionId: string, serviceId: string) => void;

  addCustomProvider: (name: string) => Provider;
  setDefaultTrm: (trm: number) => void;

  /** Guarda de inmediato lo pendiente. Resuelve `false` si el guardado falló. */
  flush: () => Promise<boolean>;
  convertToFile: (optionId: string) => Promise<ActionResult>;
  addPayment: (payment: Omit<ClientPayment, "id">) => Promise<ClientPayment | null>;
  removePayment: (paymentId: string) => Promise<void>;
  liquidate: () => Promise<ActionResult>;
}

/** Aplica `fn` a una opción concreta del expediente, devolviendo un nuevo dossier. */
function mapOption(
  dossier: Dossier,
  optionId: string,
  fn: (option: QuoteOption) => QuoteOption,
): Dossier {
  return {
    ...dossier,
    options: dossier.options.map((o) => (o.id === optionId ? fn(o) : o)),
  };
}

export const useDossierStore = create<DossierState>()((set, get) => {
  // ─── Cola de guardado ──────────────────────────────────────────────────────
  // Todas las escrituras de opciones/servicios y proveedores se encadenan en
  // `chain` para que lleguen al servidor en orden (un servicio nunca se guarda
  // antes que el proveedor personalizado que referencia).
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;

  function enqueue(task: () => Promise<void>): Promise<void> {
    chain = chain.then(task, task);
    return chain;
  }

  async function runSync() {
    const { dossier, persistence } = get();
    if (!dirty || !dossier || !persistence) return;
    dirty = false;
    set({ saveStatus: "saving" });
    try {
      await persistence.syncOptions(dossier.id, dossier.options);
      set({ saveStatus: dirty ? "pending" : "saved", saveError: null });
    } catch (error) {
      dirty = true;
      set({ saveStatus: "error", saveError: errorMessage(error) });
    }
  }

  function flush(): Promise<boolean> {
    clearTimeout(timer);
    timer = undefined;
    return enqueue(runSync).then(() => get().saveStatus !== "error");
  }

  /** Marca el dossier como modificado y programa el autoguardado. */
  function touch() {
    if (!get().persistence) return;
    dirty = true;
    set({ saveStatus: "pending" });
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }

  /** Actualiza el dossier si es editable y programa el guardado. */
  function editDossier(fn: (dossier: Dossier) => Dossier | null) {
    const { dossier } = get();
    if (!dossier || dossier.status === "LIQUIDATED" || dossier.status === "CANCELLED") return;
    const next = fn(dossier);
    if (!next) return;
    set({ dossier: next });
    touch();
  }

  return {
    dossier: null,
    providers: [],
    activeOptionId: "",
    defaultTrm: DEFAULT_TRM,
    persistence: null,
    saveStatus: "idle",
    saveError: null,
    busy: null,

    loadDossier: (dossier, providers, persistence = null) => {
      clearTimeout(timer);
      dirty = false;
      set({
        dossier,
        providers: [...providers],
        persistence,
        saveStatus: "idle",
        saveError: null,
        busy: null,
        activeOptionId:
          dossier.options.find((o) => o.isSelected && !o.isArchived)?.id ?? dossier.options[0]?.id ?? "",
      });
    },

    setActiveOption: (optionId) => set({ activeOptionId: optionId }),

    addOption: (copyFromId) => {
      const { dossier } = get();
      if (!dossier || dossier.status !== "DRAFT") return;
      const source = dossier.options.find((o) => o.id === copyFromId);
      const option: QuoteOption = {
        id: newId(),
        title: `Opción ${dossier.options.length + 1}`,
        // Copia profunda con IDs nuevos para comparar variantes sin re-digitar.
        services: source ? source.services.map((s) => ({ ...s, id: newId() })) : [createEmptyService()],
        isSelected: false,
        isArchived: false,
      };
      set({ dossier: { ...dossier, options: [...dossier.options, option] }, activeOptionId: option.id });
      touch();
    },

    renameOption: (optionId, title) =>
      editDossier((d) => mapOption(d, optionId, (o) => ({ ...o, title }))),

    removeOption: (optionId) => {
      const { dossier, activeOptionId } = get();
      if (!dossier || dossier.status !== "DRAFT" || dossier.options.length <= 1) return;
      const options = dossier.options.filter((o) => o.id !== optionId);
      set({
        dossier: { ...dossier, options },
        activeOptionId: activeOptionId === optionId ? options[0].id : activeOptionId,
      });
      touch();
    },

    addService: (optionId) =>
      editDossier((d) =>
        mapOption(d, optionId, (o) => ({
          ...o,
          services: [...o.services, createEmptyService("COP", get().defaultTrm)],
        })),
      ),

    updateService: (optionId, serviceId, patch) =>
      editDossier((d) =>
        mapOption(d, optionId, (o) => ({
          ...o,
          services: o.services.map((s) => {
            if (s.id !== serviceId) return s;
            const next = { ...s, ...patch };
            // Cambio de moneda: COP fija TRM 1; USD propone la TRM del día.
            if (patch.currency && patch.currency !== s.currency && patch.exchangeRate === undefined) {
              next.exchangeRate = defaultExchangeRate(patch.currency, get().defaultTrm);
            }
            return next;
          }),
        })),
      ),

    removeService: (optionId, serviceId) =>
      editDossier((d) =>
        mapOption(d, optionId, (o) => ({
          ...o,
          services: o.services.filter((s) => s.id !== serviceId),
        })),
      ),

    addCustomProvider: (name) => {
      const { dossier, providers, persistence } = get();
      const provider: Provider = {
        id: newId(),
        agencyId: dossier?.agencyId ?? null,
        name: name.trim(),
        category: "OPERADOR_LOCAL",
        nit: null,
        defaultCurrency: "COP",
        defaultPucAccount: "281505",
        paymentDeadlineHours: 48,
        isSystemPreload: false,
      };
      set({ providers: [...providers, provider] });
      if (persistence) {
        void enqueue(async () => {
          try {
            await persistence.insertProvider(provider);
          } catch (error) {
            set({ saveStatus: "error", saveError: errorMessage(error) });
          }
        });
      }
      return provider;
    },

    setDefaultTrm: (trm) => set({ defaultTrm: trm }),

    flush,

    convertToFile: async (optionId) => {
      const { dossier, persistence, busy } = get();
      if (!dossier || dossier.status !== "DRAFT" || busy) return { ok: false, reasons: [] };

      if (persistence) {
        set({ busy: "convert" });
        try {
          if (!(await flush())) return { ok: false, reasons: [get().saveError ?? "No se pudo guardar."] };
          await persistence.convertQuoteToFile(dossier.id, optionId);
        } catch (error) {
          return { ok: false, reasons: [errorMessage(error)] };
        } finally {
          set({ busy: null });
        }
      }

      const current = get().dossier ?? dossier;
      set({
        dossier: {
          ...current,
          status: "CONFIRMED",
          options: current.options.map((o) => ({
            ...o,
            isSelected: o.id === optionId,
            isArchived: o.id !== optionId,
          })),
        },
        activeOptionId: optionId,
      });
      return { ok: true, reasons: [] };
    },

    addPayment: async (input) => {
      const { dossier, persistence } = get();
      if (!dossier || dossier.status === "DRAFT" || dossier.status === "LIQUIDATED") return null;
      let payment: ClientPayment;
      try {
        payment = persistence ? await persistence.insertPayment(dossier, input) : { ...input, id: newId() };
      } catch (error) {
        set({ saveStatus: "error", saveError: errorMessage(error) });
        return null;
      }
      const current = get().dossier;
      if (current) set({ dossier: { ...current, payments: [...current.payments, payment] } });
      return payment;
    },

    removePayment: async (paymentId) => {
      const { dossier, persistence } = get();
      if (!dossier || dossier.status === "LIQUIDATED") return;
      try {
        if (persistence) await persistence.deletePayment(paymentId);
      } catch (error) {
        set({ saveStatus: "error", saveError: errorMessage(error) });
        return;
      }
      const current = get().dossier;
      if (current) set({ dossier: { ...current, payments: current.payments.filter((p) => p.id !== paymentId) } });
    },

    liquidate: async () => {
      const { dossier, activeOptionId, persistence, busy } = get();
      if (!dossier || busy) return { ok: false, reasons: [] };
      const option = resolveWorkingOption(dossier, activeOptionId);
      const services = option?.services ?? [];
      const summary = computeFinancials({
        services,
        payments: dossier.payments,
        commissionRate: dossier.agent.commissionRate,
        status: dossier.status,
      });
      const check = checkLiquidation(dossier.status, services, summary);
      if (!check.canLiquidate) return { ok: false, reasons: check.reasons };

      let liquidatedAt = new Date().toISOString();
      if (persistence) {
        set({ busy: "liquidate" });
        try {
          if (!(await flush())) return { ok: false, reasons: [get().saveError ?? "No se pudo guardar."] };
          // El servidor recalcula y vuelve a validar saldo y proveedores.
          liquidatedAt = await persistence.liquidate(dossier.id);
        } catch (error) {
          return { ok: false, reasons: [errorMessage(error)] };
        } finally {
          set({ busy: null });
        }
      }

      const current = get().dossier ?? dossier;
      set({ dossier: { ...current, status: "LIQUIDATED", liquidatedAt } });
      return { ok: true, reasons: [] };
    },
  };
});

/** Opción que se está editando / que alimenta el Termómetro. */
export function useWorkingOption(): QuoteOption | undefined {
  const dossier = useDossierStore((s) => s.dossier);
  const activeOptionId = useDossierStore((s) => s.activeOptionId);
  return useMemo(
    () => (dossier ? resolveWorkingOption(dossier, activeOptionId) : undefined),
    [dossier, activeOptionId],
  );
}

/** Resumen financiero reactivo de la opción de trabajo. */
export function useFinancialSummary(): FinancialSummary | null {
  const dossier = useDossierStore((s) => s.dossier);
  const option = useWorkingOption();
  return useMemo(() => {
    if (!dossier) return null;
    return computeFinancials({
      services: option?.services ?? [],
      payments: dossier.payments,
      commissionRate: dossier.agent.commissionRate,
      status: dossier.status,
    });
  }, [dossier, option]);
}
