"use client";

import { useId, useState, type FormEvent } from "react";

import { getSupabase } from "@/lib/supabase/client";

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "Correo o contraseña incorrectos.",
  email_not_confirmed: "Confirma tu correo antes de ingresar (revisa tu bandeja).",
  user_already_exists: "Ya existe una cuenta con ese correo. Inicia sesión.",
  weak_password: "La contraseña es muy débil (mínimo 6 caracteres).",
  over_email_send_rate_limit: "Demasiados intentos. Espera unos minutos.",
};

/** Ingreso y creación de cuenta con correo y contraseña (Supabase Auth). */
export function LoginForm() {
  const id = useId();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const auth = getSupabase().auth;
    const { data, error } =
      mode === "sign-in"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setSubmitting(false);

    if (error) {
      setError(AUTH_ERRORS[error.code ?? ""] ?? error.message);
      return;
    }
    // Con confirmación de correo activa, signUp no abre sesión todavía.
    if (mode === "sign-up" && !data.session) {
      setNotice("Te enviamos un correo de confirmación. Ábrelo y luego ingresa aquí.");
      setMode("sign-in");
    }
  }

  const isSignIn = mode === "sign-in";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">{isSignIn ? "Ingresar" : "Crear cuenta"}</h1>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1 block text-xs font-medium text-slate-600">
          Correo
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="mb-1 block text-xs font-medium text-slate-600">
          Contraseña
        </label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete={isSignIn ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
      >
        {submitting ? "Un momento…" : isSignIn ? "Ingresar" : "Crear cuenta"}
      </button>
      <p className="text-center text-xs text-slate-500">
        {isSignIn ? "¿Agencia nueva?" : "¿Ya tienes cuenta?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(isSignIn ? "sign-up" : "sign-in");
            setError(null);
          }}
          className="font-medium text-slate-900 underline"
        >
          {isSignIn ? "Crear cuenta" : "Ingresar"}
        </button>
      </p>
    </form>
  );
}
