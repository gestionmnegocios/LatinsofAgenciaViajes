"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ImageUp, Loader2, Trash2 } from "lucide-react";

import { useProfile } from "@/components/auth/AuthGate";
import {
  fetchAgencyInfo,
  LOGO_TYPES,
  logoProblem,
  removeAgencyLogo,
  updateAgencySettings,
  uploadAgencyLogo,
  type AgencyInfo,
  type AgencySettings,
} from "@/lib/data/agency-repository";

const input =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-500";
const label = "mb-1 block text-xs font-medium text-slate-600";

/** Configuración de la agencia: datos de membrete y logo (edición solo ADMIN). */
export function SettingsPage() {
  const profile = useProfile();
  const isAdmin = profile.role === "ADMIN";
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAgencyInfo(profile.agencyId)
      .then((info) => !cancelled && setAgency(info))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "No se pudo cargar la agencia."));
    return () => {
      cancelled = true;
    };
  }, [profile.agencyId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden /> Expedientes
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500">
          Estos datos salen en los recibos de caja y las cuentas de cobro.
          {!isAdmin && " Solo el administrador puede cambiarlos."}
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!agency && !error && <div className="h-72 animate-pulse rounded-xl bg-slate-200" aria-busy="true" />}

      {agency && (
        <div className="space-y-6">
          <LogoSection
            agencyId={profile.agencyId}
            agencyName={agency.name}
            logoUrl={agency.logoUrl}
            editable={isAdmin}
            onChange={async (logoUrl) => {
              setAgency({ ...agency, logoUrl });
              await profile.reload();
            }}
          />
          <DetailsForm
            key={`${agency.name}|${agency.nit}|${agency.address}|${agency.city}|${agency.phone}`}
            initial={agency}
            editable={isAdmin}
            onSave={async (settings) => {
              await updateAgencySettings(profile.agencyId, settings);
              setAgency({ ...agency, ...settings });
              await profile.reload();
            }}
          />
        </div>
      )}
    </div>
  );
}

function DetailsForm({
  initial,
  editable,
  onSave,
}: {
  initial: AgencySettings;
  editable: boolean;
  onSave: (settings: AgencySettings) => Promise<void>;
}) {
  const id = useId();
  const [form, setForm] = useState<AgencySettings>({
    name: initial.name,
    nit: initial.nit,
    address: initial.address ?? "",
    city: initial.city ?? "",
    phone: initial.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof AgencySettings, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Datos de la agencia</h2>
      <fieldset disabled={!editable || saving} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-name`} className={label}>Nombre de la agencia</label>
          <input id={`${id}-name`} required value={form.name} onChange={(e) => set("name", e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${id}-nit`} className={label}>NIT</label>
          <input id={`${id}-nit`} required value={form.nit} onChange={(e) => set("nit", e.target.value)} placeholder="900123456-7" className={input} />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className={label}>Teléfono (WhatsApp)</label>
          <input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="300 123 4567"
            className={input}
          />
        </div>
        <div>
          <label htmlFor={`${id}-address`} className={label}>Dirección</label>
          <input
            id={`${id}-address`}
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Cra 70 # 1-23, local 104"
            className={input}
          />
        </div>
        <div>
          <label htmlFor={`${id}-city`} className={label}>Ciudad</label>
          <input id={`${id}-city`} value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Medellín" className={input} />
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {editable && (
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span role="status" className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <Check className="size-4" aria-hidden /> Guardado
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Guardar
          </button>
        </div>
      )}
    </form>
  );
}

function LogoSection({
  agencyId,
  agencyName,
  logoUrl,
  editable,
  onChange,
}: {
  agencyId: string;
  agencyName: string;
  logoUrl: string | null;
  editable: boolean;
  onChange: (logoUrl: string | null) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const problem = logoProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      await onChange(await uploadAgencyLogo(agencyId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el logo.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy("remove");
    setError(null);
    try {
      await removeAgencyLogo(agencyId);
      await onChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el logo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Logo</h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-28 w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`Logo de ${agencyName}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">Sin logo</span>
          )}
        </div>
        {editable && (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="sr-only"
              id="agency-logo-file"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <label
                htmlFor="agency-logo-file"
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 ${
                  busy ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {busy === "upload" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
                {logoUrl ? "Cambiar logo" : "Subir logo"}
              </label>
              {logoUrl && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleRemove()}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                >
                  {busy === "remove" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                  Quitar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">PNG, JPG, WEBP o SVG de hasta 2 MB. Mejor con fondo transparente.</p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
