"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

import { getSupabase } from "@/lib/supabase/client";
import { LoginForm } from "./LoginForm";
import { OnboardingStep } from "./OnboardingStep";

export interface AgencyProfile {
  userId: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "AGENT";
  agencyId: string;
  agencyName: string;
  agencyLogoUrl: string | null;
  /** Vuelve a leer el perfil (p. ej. tras cambiar la configuración de la agencia). */
  reload: () => Promise<void>;
}

type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "no-agency"; user: User }
  | { status: "ready"; profile: Omit<AgencyProfile, "reload">; user: User };

const ProfileContext = createContext<AgencyProfile | null>(null);

/** Perfil del asesor en sesión. Solo disponible dentro de `<AuthGate>`. */
export function useProfile(): AgencyProfile {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error("useProfile debe usarse dentro de <AuthGate>.");
  return profile;
}

async function loadProfile(user: User): Promise<SessionState> {
  const { data, error } = await getSupabase()
    .from("agency_users")
    .select("full_name, role, agency_id, agencies(name, logo_url)")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: "no-agency", user };
  return {
    status: "ready",
    profile: {
      userId: user.id,
      email: user.email ?? "",
      fullName: data.full_name,
      role: data.role,
      agencyId: data.agency_id,
      agencyName: (data.agencies as { name: string } | null)?.name ?? "",
      agencyLogoUrl: (data.agencies as { logo_url: string | null } | null)?.logo_url ?? null,
    },
    user,
  };
}

/**
 * Puerta de autenticación del lado del cliente: muestra login, registro de
 * agencia o los hijos con el perfil en contexto. No es la frontera de
 * seguridad (eso es la RLS); solo decide qué pantalla mostrar.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (user: User | null) => {
    if (!user) {
      setState({ status: "signed-out" });
      return;
    }
    try {
      setState(await loadProfile(user));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el perfil.");
    }
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      // Diferido: supabase-js no permite llamadas a la API dentro del callback.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTimeout(() => void refresh(session?.user ?? null), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  if (error) {
    return (
      <CenteredCard>
        <p className="text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void getSupabase().auth.signOut()}
          className="mt-4 text-sm text-slate-600 underline"
        >
          Cerrar sesión
        </button>
      </CenteredCard>
    );
  }

  switch (state.status) {
    case "loading":
      return (
        <div className="flex min-h-screen items-center justify-center" aria-busy="true">
          <Loader2 className="size-6 animate-spin text-slate-400" aria-label="Cargando" />
        </div>
      );
    case "signed-out":
      return (
        <CenteredCard>
          <LoginForm />
        </CenteredCard>
      );
    case "no-agency":
      return (
        <CenteredCard>
          <OnboardingStep email={state.user.email ?? ""} onJoined={() => void refresh(state.user)} />
        </CenteredCard>
      );
    case "ready":
      return (
        <ProfileContext.Provider value={{ ...state.profile, reload: () => refresh(state.user) }}>{children}</ProfileContext.Provider>
      );
  }
}

export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-5 text-xs font-semibold uppercase tracking-wider text-slate-500">TravelSaaS Colombia</p>
        {children}
      </div>
    </div>
  );
}
