"use client";

import { useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import { createDossier, type NewDossierInput } from "@/lib/data/dossier-repository";

interface NewDossierFormProps {
  onCreated: (dossierId: string) => void;
  onCancel: () => void;
}

const EMPTY: NewDossierInput = {
  clientDocument: "",
  clientName: "",
  clientWhatsapp: "",
  title: "",
  departureDate: "",
  returnDate: "",
  adults: 2,
  children: 0,
};

/**
 * FR-1.2 Apertura Flash: cliente (se crea o actualiza por documento),
 * viaje, fechas y pasajeros en un solo paso. Abre el Workspace al guardar.
 */
export function NewDossierForm({ onCreated, onCancel }: NewDossierFormProps) {
  const id = useId();
  const [form, setForm] = useState<NewDossierInput>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof NewDossierInput>(key: K, value: NewDossierInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.returnDate < form.departureDate) {
      setError("La fecha de regreso no puede ser anterior a la de ida.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await createDossier(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el expediente.");
      setSubmitting(false);
    }
  }

  const input =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Nuevo expediente</h2>
        <button type="button" onClick={onCancel} aria-label="Cancelar" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</legend>
        <div>
          <label htmlFor={`${id}-doc`} className={label}>Cédula / NIT</label>
          <input id={`${id}-doc`} required value={form.clientDocument} onChange={(e) => set("clientDocument", e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${id}-name`} className={label}>Nombre</label>
          <input id={`${id}-name`} required value={form.clientName} onChange={(e) => set("clientName", e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${id}-wa`} className={label}>WhatsApp</label>
          <input
            id={`${id}-wa`}
            required
            type="tel"
            inputMode="tel"
            placeholder="300 123 4567"
            value={form.clientWhatsapp}
            onChange={(e) => set("clientWhatsapp", e.target.value)}
            className={input}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-6">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Viaje</legend>
        <div className="sm:col-span-6">
          <label htmlFor={`${id}-title`} className={label}>Nombre del viaje</label>
          <input
            id={`${id}-title`}
            required
            placeholder="Cancún – Familia Pérez"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={input}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-dep`} className={label}>Ida</label>
          <input id={`${id}-dep`} type="date" required value={form.departureDate} onChange={(e) => set("departureDate", e.target.value)} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-ret`} className={label}>Regreso</label>
          <input
            id={`${id}-ret`}
            type="date"
            required
            min={form.departureDate || undefined}
            value={form.returnDate}
            onChange={(e) => set("returnDate", e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor={`${id}-ad`} className={label}>Adultos</label>
          <input id={`${id}-ad`} type="number" min={1} required value={form.adults} onChange={(e) => set("adults", Number(e.target.value))} className={input} />
        </div>
        <div>
          <label htmlFor={`${id}-ch`} className={label}>Niños</label>
          <input id={`${id}-ch`} type="number" min={0} required value={form.children} onChange={(e) => set("children", Number(e.target.value))} className={input} />
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
        >
          {submitting ? "Creando…" : "Crear y cotizar"}
        </button>
      </div>
    </form>
  );
}
