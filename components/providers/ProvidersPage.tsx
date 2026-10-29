"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Landmark, Lock, Mail, Pencil, Phone, Plus, Search, Trash2, X } from "lucide-react";

import { useProfile } from "@/components/auth/AuthGate";
import { searchProviders } from "@/lib/data/providers";
import {
  createProvider,
  deleteProvider,
  listProviders,
  PROVIDER_CATEGORY_LABELS,
  updateProvider,
  type ProviderInput,
} from "@/lib/data/provider-repository";
import type { Provider, ProviderCategory } from "@/lib/finance/types";

const input =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500";
const label = "mb-1 block text-xs font-medium text-slate-600";

const EMPTY: ProviderInput = {
  name: "",
  category: "MAYORISTA",
  nit: "",
  defaultCurrency: "COP",
  paymentDeadlineHours: 48,
  contactName: "",
  phone: "",
  email: "",
  bankDetails: "",
};

function toInput(p: Provider): ProviderInput {
  return {
    name: p.name,
    category: p.category,
    nit: p.nit ?? "",
    defaultCurrency: p.defaultCurrency,
    paymentDeadlineHours: p.paymentDeadlineHours,
    contactName: p.contactName ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    bankDetails: p.bankDetails ?? "",
  };
}

/** Catálogo de proveedores: precargados (solo lectura) y propios de la agencia. */
export function ProvidersPage() {
  const profile = useProfile();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProviders()
      .then((data) => !cancelled && setProviders(data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Error al cargar proveedores."));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => (providers ? (query.trim() ? searchProviders(providers, query) : providers) : []), [providers, query]);
  const own = visible.filter((p) => !p.isSystemPreload);
  const system = visible.filter((p) => p.isSystemPreload);

  async function save(id: string | "new", data: ProviderInput) {
    const saved = id === "new" ? await createProvider(profile.agencyId, data) : await updateProvider(id, data);
    setProviders((list) => {
      const rest = (list ?? []).filter((p) => p.id !== saved.id);
      return [...rest, saved].sort((a, b) => Number(a.isSystemPreload) - Number(b.isSystemPreload) || a.name.localeCompare(b.name));
    });
    setEditing(null);
  }

  async function remove(provider: Provider) {
    setError(null);
    try {
      await deleteProvider(provider.id);
      setProviders((list) => (list ?? []).filter((p) => p.id !== provider.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el proveedor.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="size-4" aria-hidden /> Expedientes
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">Proveedores</h1>
          <p className="text-sm text-slate-500">Mayoristas, hoteles, consolidadores y operadores con los que trabaja la agencia.</p>
        </div>
        {editing !== "new" && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="size-4" aria-hidden /> Nuevo proveedor
          </button>
        )}
      </header>

      {editing === "new" && (
        <div className="mb-6">
          <ProviderForm title="Nuevo proveedor" initial={EMPTY} onCancel={() => setEditing(null)} onSave={(data) => save("new", data)} />
        </div>
      )}

      {error && (
        <p role="alert" className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          aria-label="Buscar proveedor"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre…"
          className={`${input} pl-9`}
        />
      </div>

      {providers === null && !error && <div className="h-40 animate-pulse rounded-xl bg-slate-200" aria-busy="true" />}

      {providers && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Mis proveedores <span className="font-normal text-slate-400">({own.length})</span>
            </h2>
            {own.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center text-sm text-slate-500">
                {query ? "Ningún proveedor propio coincide." : "Aún no has creado proveedores propios."}
              </p>
            ) : (
              <ul className="space-y-3">
                {own.map((p) =>
                  editing === p.id ? (
                    <li key={p.id}>
                      <ProviderForm
                        title={`Editar ${p.name}`}
                        initial={toInput(p)}
                        onCancel={() => setEditing(null)}
                        onSave={(data) => save(p.id, data)}
                      />
                    </li>
                  ) : (
                    <ProviderCard key={p.id} provider={p} onEdit={() => setEditing(p.id)} onDelete={() => void remove(p)} />
                  ),
                )}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Precargados <span className="font-normal text-slate-400">({system.length})</span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {system.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {PROVIDER_CATEGORY_LABELS[p.category]} · {p.defaultCurrency} · pago a {p.paymentDeadlineHours} h
                    </p>
                  </div>
                  <Lock className="size-3.5 shrink-0 text-slate-300" aria-label="Precargado, solo lectura" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider: p, onEdit, onDelete }: { provider: Provider; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-slate-900">
            <Building2 className="size-4 text-slate-400" aria-hidden /> {p.name}
          </p>
          <p className="text-xs text-slate-500">
            {PROVIDER_CATEGORY_LABELS[p.category]}
            {p.nit && ` · NIT ${p.nit}`} · {p.defaultCurrency} · pago a {p.paymentDeadlineHours} h
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {p.contactName && <span>{p.contactName}</span>}
            {p.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" aria-hidden /> {p.phone}
              </span>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:underline">
                <Mail className="size-3" aria-hidden /> {p.email}
              </a>
            )}
            {p.bankDetails && (
              <span className="inline-flex items-center gap-1">
                <Landmark className="size-3" aria-hidden /> {p.bankDetails}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {confirming ? (
            <>
              <span className="text-xs text-slate-600">¿Eliminar?</span>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Sí, eliminar
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
                <Pencil className="size-3.5" aria-hidden /> Editar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Eliminar ${p.name}`}
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function ProviderForm({
  title,
  initial,
  onCancel,
  onSave,
}: {
  title: string;
  initial: ProviderInput;
  onCancel: () => void;
  onSave: (data: ProviderInput) => Promise<void>;
}) {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ProviderInput>(key: K, value: ProviderInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onCancel} aria-label="Cancelar" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-4">
          <label htmlFor={`${id}-name`} className={label}>Nombre</label>
          <input id={`${id}-name`} required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Receptivo Caribe SAS" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-nit`} className={label}>NIT</label>
          <input id={`${id}-nit`} value={form.nit} onChange={(e) => set("nit", e.target.value)} placeholder="901222333-4" className={input} />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor={`${id}-cat`} className={label}>Tipo</label>
          <select id={`${id}-cat`} value={form.category} onChange={(e) => set("category", e.target.value as ProviderCategory)} className={input}>
            {Object.entries(PROVIDER_CATEGORY_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label htmlFor={`${id}-cur`} className={label}>Moneda</label>
          <select id={`${id}-cur`} value={form.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value as "COP" | "USD")} className={input}>
            <option value="COP">COP</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-hours`} className={label}>Plazo de pago (horas)</label>
          <input
            id={`${id}-hours`}
            type="number"
            min={0}
            required
            value={form.paymentDeadlineHours}
            onChange={(e) => set("paymentDeadlineHours", Number(e.target.value))}
            className={input}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-contact`} className={label}>Contacto</label>
          <input id={`${id}-contact`} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Nombre del ejecutivo" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-phone`} className={label}>Teléfono / WhatsApp</label>
          <input id={`${id}-phone`} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-email`} className={label}>Correo de reservas</label>
          <input id={`${id}-email`} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={input} />
        </div>
        <div className="sm:col-span-6">
          <label htmlFor={`${id}-bank`} className={label}>Datos bancarios para giros</label>
          <input
            id={`${id}-bank`}
            value={form.bankDetails}
            onChange={(e) => set("bankDetails", e.target.value)}
            placeholder="Bancolombia · ahorros · 123-456789-01"
            className={input}
          />
        </div>
      </fieldset>
      <p className="text-xs text-slate-500">
        El plazo de pago fija el time-limit sugerido al elegir este proveedor en una cotización. El NIT sale como tercero en la exportación contable.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400">
          {saving ? "Guardando…" : "Guardar proveedor"}
        </button>
      </div>
    </form>
  );
}
