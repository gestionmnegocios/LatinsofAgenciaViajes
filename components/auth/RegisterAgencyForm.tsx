"use client";

import { useId, useState, type FormEvent } from "react";

import { registerAgency } from "@/lib/data/dossier-repository";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Onboarding: el usuario recién creado registra su agencia y queda como ADMIN
 * (RPC `register_agency`). Los asesores adicionales los agrega el ADMIN.
 */
export function RegisterAgencyForm({ email, onRegistered }: { email: string; onRegistered: () => void }) {
  const id = useId();
  const [agencyName, setAgencyName] = useState("");
  const [nit, setNit] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await registerAgency(agencyName, nit, fullName);
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la agencia.");
      setSubmitting(false);
    }
  }

  const fields = [
    { key: "agency", label: "Nombre de la agencia", value: agencyName, set: setAgencyName, placeholder: "Viajes Laureles SAS" },
    { key: "nit", label: "NIT", value: nit, set: setNit, placeholder: "900123456-7" },
    { key: "name", label: "Tu nombre completo", value: fullName, set: setFullName, placeholder: "Gladys Restrepo" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Registra tu agencia</h1>
        <p className="mt-1 text-xs text-slate-500">
          {email} quedará como administrador. Tus datos solo los ve tu agencia.
        </p>
      </div>
      {fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={`${id}-${f.key}`} className="mb-1 block text-xs font-medium text-slate-600">
            {f.label}
          </label>
          <input
            id={`${id}-${f.key}`}
            required
            value={f.value}
            placeholder={f.placeholder}
            onChange={(e) => f.set(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
      >
        {submitting ? "Registrando…" : "Registrar agencia"}
      </button>
      <button
        type="button"
        onClick={() => void getSupabase().auth.signOut()}
        className="w-full text-center text-xs text-slate-500 underline"
      >
        Usar otra cuenta
      </button>
    </form>
  );
}
