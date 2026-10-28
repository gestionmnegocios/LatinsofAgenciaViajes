"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { acceptInvitation, fetchOnboarding, type Onboarding } from "@/lib/data/team-repository";
import { getSupabase } from "@/lib/supabase/client";
import { RegisterAgencyForm } from "./RegisterAgencyForm";

/**
 * Usuario con sesión pero sin agencia activa: cuenta desactivada, invitaciones
 * pendientes a su correo, o registro de una agencia nueva.
 */
export function OnboardingStep({ email, onJoined }: { email: string; onJoined: () => void }) {
  const [options, setOptions] = useState<Onboarding[] | null>(null);
  const [registering, setRegistering] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOnboarding()
      .then((data) => !cancelled && setOptions(data))
      .catch((e: unknown) => {
        if (cancelled) return;
        // Sin poder consultar, al menos se puede registrar una agencia.
        setError(e instanceof Error ? e.message : "No se pudo consultar tu cuenta.");
        setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function accept(invitationId: string) {
    setAccepting(invitationId);
    setError(null);
    try {
      await acceptInvitation(invitationId);
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aceptar la invitación.");
      setAccepting(null);
    }
  }

  const signOut = (
    <button type="button" onClick={() => void getSupabase().auth.signOut()} className="w-full text-center text-xs text-slate-500 underline">
      Usar otra cuenta
    </button>
  );

  if (options === null) {
    return (
      <div className="flex justify-center py-6" aria-busy="true">
        <Loader2 className="size-5 animate-spin text-slate-400" aria-label="Cargando" />
      </div>
    );
  }

  const inactive = options.find((o) => o.kind === "INACTIVE");
  if (inactive) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">Cuenta desactivada</h1>
        <p className="text-sm text-slate-600">
          Tu usuario en <span className="font-medium">{inactive.agencyName}</span> está desactivado. Pide al administrador
          de la agencia que lo vuelva a activar.
        </p>
        {signOut}
      </div>
    );
  }

  const invitations = options.filter((o) => o.kind === "INVITATION");
  if (invitations.length === 0 || registering) {
    return (
      <div className="space-y-4">
        <RegisterAgencyForm email={email} onRegistered={onJoined} />
        {error && <p className="text-xs text-slate-500">{error}</p>}
        <p className="text-center text-xs text-slate-500">
          ¿Te invitó tu agencia? Pide al administrador que te invite con el correo {email}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Tienes una invitación</h1>
        <p className="mt-1 text-xs text-slate-500">Para {email}</p>
      </div>
      <ul className="space-y-2">
        {invitations.map((i) => (
          <li key={i.invitationId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-900">{i.agencyName}</p>
              <p className="text-xs text-slate-500">
                {i.role === "ADMIN" ? "Administrador" : "Asesor"} · comisión {i.commissionRate} %
              </p>
            </div>
            <button
              type="button"
              onClick={() => void accept(i.invitationId)}
              disabled={accepting !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              {accepting === i.invitationId && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Unirme
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="button" onClick={() => setRegistering(true)} className="w-full text-center text-xs text-slate-500 underline">
        Prefiero registrar una agencia nueva
      </button>
      {signOut}
    </div>
  );
}
