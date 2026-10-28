"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { DossierWorkspace, WorkspaceSkeleton } from "@/components/dossier/DossierWorkspace";
import {
  convertQuoteToFile,
  deletePayment,
  fetchDossier,
  insertPayment,
  insertProvider,
  liquidateDossier,
  syncOptions,
} from "@/lib/data/dossier-repository";
import { useDossierStore, type DossierPersistence } from "@/lib/store/dossier-store";

const supabasePersistence: DossierPersistence = {
  syncOptions,
  convertQuoteToFile,
  liquidate: liquidateDossier,
  insertPayment,
  deletePayment,
  insertProvider,
};

/** Carga un expediente de Supabase en el store y monta el Workspace. */
export function DossierLoader({ id }: { id: string }) {
  const loadDossier = useDossierStore((s) => s.loadDossier);
  const loadedId = useDossierStore((s) => s.dossier?.id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDossier(id)
      .then(({ dossier, providers }) => {
        if (!cancelled) loadDossier(dossier, providers, supabasePersistence);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Error al cargar."));
    return () => {
      cancelled = true;
      // Al salir del expediente se guarda lo pendiente sin bloquear la navegación.
      void useDossierStore.getState().flush();
    };
  }, [id, loadDossier]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-slate-600 underline">
          Volver a expedientes
        </Link>
      </div>
    );
  }

  // Hasta que llegue este expediente no se muestra el anterior que quedó en el store.
  if (loadedId !== id) return <WorkspaceSkeleton />;
  return <DossierWorkspace backHref="/" />;
}
