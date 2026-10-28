"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Loader2, Mail, X } from "lucide-react";

import { useProfile } from "@/components/auth/AuthGate";
import {
  cancelInvitation,
  inviteMember,
  listInvitations,
  listTeam,
  updateMember,
  type Invitation,
  type NewInvitation,
  type Role,
  type TeamMember,
} from "@/lib/data/team-repository";
import { formatDate } from "@/lib/finance/format";

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrador", AGENT: "Asesor" };

const input =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500";

/** Equipo de la agencia: tasas de comisión, roles, estado e invitaciones. */
export function TeamPage() {
  const profile = useProfile();
  const isAdmin = profile.role === "ADMIN";
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [team, invites] = await Promise.all([listTeam(), isAdmin ? listInvitations() : Promise.resolve([])]);
    setMembers(team);
    setInvitations(invites);
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTeam(), isAdmin ? listInvitations() : Promise.resolve([])])
      .then(([team, invites]) => {
        if (cancelled) return;
        setMembers(team);
        setInvitations(invites);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Error al cargar el equipo."));
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      await reload().catch(() => undefined);
      return false;
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden /> Expedientes
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{profile.agencyName}</p>
        <h1 className="text-2xl font-semibold text-slate-900">Equipo</h1>
      </header>

      {error && (
        <p role="alert" className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2">Nombre</th>
                <th scope="col" className="px-4 py-2">Rol</th>
                <th scope="col" className="px-4 py-2">Comisión</th>
                <th scope="col" className="px-4 py-2 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members === null && !error && (
                <tr>
                  <td colSpan={4} className="px-4 py-6">
                    <div className="h-6 animate-pulse rounded bg-slate-200" aria-busy="true" />
                  </td>
                </tr>
              )}
              {members?.map((m) => (
                <MemberRow key={`${m.id}-${m.commissionRate}-${m.role}-${m.isActive}`} member={m} isSelf={m.id === profile.userId} editable={isAdmin} onSave={(patch) => run(() => updateMember(m.id, patch))} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          La tasa se aplica a los expedientes que se confirmen desde ahora; las comisiones ya calculadas no cambian.
        </p>
      </section>

      {isAdmin && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Invitar asesor</h2>
          <InviteForm onInvite={(data) => run(() => inviteMember(profile.agencyId, profile.userId, data))} />

          {invitations.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <Mail className="size-3.5 text-slate-400" aria-hidden /> {i.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      {i.fullName} · {ROLE_LABEL[i.role]} · {i.commissionRate} % · pendiente desde {formatDate(i.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyInstructions email={i.email} agencyName={profile.agencyName} />
                    <button
                      type="button"
                      onClick={() => void run(() => cancelInvitation(i.id))}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <X className="size-3.5" aria-hidden /> Cancelar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  editable,
  onSave,
}: {
  member: TeamMember;
  isSelf: boolean;
  editable: boolean;
  onSave: (patch: Partial<Pick<TeamMember, "role" | "commissionRate" | "isActive">>) => Promise<boolean>;
}) {
  const [rate, setRate] = useState(String(member.commissionRate));
  const [saving, setSaving] = useState(false);

  async function save(patch: Parameters<typeof onSave>[0]) {
    setSaving(true);
    await onSave(patch);
    setSaving(false);
  }

  function commitRate() {
    const value = Number(rate.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setRate(String(member.commissionRate));
      return;
    }
    if (value !== member.commissionRate) void save({ commissionRate: value });
  }

  return (
    <tr className={member.isActive ? undefined : "bg-slate-50 text-slate-400"}>
      <td className="px-4 py-2.5">
        <span className={member.isActive ? "font-medium text-slate-900" : ""}>{member.fullName}</span>
        {isSelf && <span className="ml-1.5 text-xs text-slate-500">(tú)</span>}
      </td>
      <td className="px-4 py-2.5">
        {editable ? (
          <select
            aria-label={`Rol de ${member.fullName}`}
            value={member.role}
            disabled={saving}
            onChange={(e) => void save({ role: e.target.value as Role })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="AGENT">{ROLE_LABEL.AGENT}</option>
            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
          </select>
        ) : (
          ROLE_LABEL[member.role]
        )}
      </td>
      <td className="px-4 py-2.5">
        {editable ? (
          <div className="flex items-center gap-1">
            <input
              aria-label={`Comisión de ${member.fullName} en porcentaje`}
              inputMode="decimal"
              value={rate}
              disabled={saving}
              onChange={(e) => setRate(e.target.value)}
              onBlur={commitRate}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
            />
            <span className="text-slate-500">%</span>
            {saving && <Loader2 className="size-3.5 animate-spin text-slate-400" aria-label="Guardando" />}
          </div>
        ) : (
          `${member.commissionRate} %`
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editable ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save({ isActive: !member.isActive })}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              member.isActive ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
            }`}
            title={member.isActive ? "Desactivar" : "Activar"}
          >
            {member.isActive ? "Activo" : "Inactivo"}
          </button>
        ) : member.isActive ? (
          "Activo"
        ) : (
          "Inactivo"
        )}
      </td>
    </tr>
  );
}

const EMPTY: NewInvitation = { email: "", fullName: "", role: "AGENT", commissionRate: 15 };

function InviteForm({ onInvite }: { onInvite: (data: NewInvitation) => Promise<boolean> }) {
  const id = useId();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (await onInvite(form)) setForm(EMPTY);
    setSubmitting(false);
  }

  const label = "mb-1 block text-xs font-medium text-slate-600";
  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-12">
      <div className="sm:col-span-4">
        <label htmlFor={`${id}-email`} className={label}>Correo</label>
        <input id={`${id}-email`} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="asesora@agencia.co" className={input} />
      </div>
      <div className="sm:col-span-3">
        <label htmlFor={`${id}-name`} className={label}>Nombre</label>
        <input id={`${id}-name`} required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={input} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-role`} className={label}>Rol</label>
        <select id={`${id}-role`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={input}>
          <option value="AGENT">{ROLE_LABEL.AGENT}</option>
          <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
        </select>
      </div>
      <div className="sm:col-span-1">
        <label htmlFor={`${id}-rate`} className={label}>%</label>
        <input
          id={`${id}-rate`}
          type="number"
          min={0}
          max={100}
          step="0.5"
          required
          value={form.commissionRate}
          onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })}
          className={input}
        />
      </div>
      <div className="flex items-end sm:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {submitting ? "Invitando…" : "Invitar"}
        </button>
      </div>
      <p className="text-xs text-slate-500 sm:col-span-12">
        La persona crea su cuenta con ese correo, lo confirma y al ingresar verá la invitación para unirse.
      </p>
    </form>
  );
}

/** Copia un mensaje listo para enviar al invitado (sin enviar nada desde la app). */
function CopyInstructions({ email, agencyName }: { email: string; agencyName: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text =
      `Te invité al equipo de ${agencyName} en TravelSaaS. ` +
      `Entra a ${window.location.origin}, crea tu cuenta con el correo ${email}, confírmalo y acepta la invitación.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles: no hay nada que hacer.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copiado" : "Copiar mensaje"}
    </button>
  );
}
