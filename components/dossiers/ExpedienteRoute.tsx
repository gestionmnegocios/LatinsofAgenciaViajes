"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { AuthGate } from "@/components/auth/AuthGate";
import { DossierLoader } from "./DossierLoader";

export function ExpedienteRoute() {
  const id = useSearchParams().get("id");
  return (
    <AuthGate>
      {id ? (
        <DossierLoader id={id} />
      ) : (
        <div className="px-4 py-16 text-center text-sm text-slate-600">
          Falta el expediente. <Link href="/" className="underline">Volver</Link>
        </div>
      )}
    </AuthGate>
  );
}
