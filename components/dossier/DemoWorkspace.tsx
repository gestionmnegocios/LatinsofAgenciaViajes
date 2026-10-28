"use client";

import { useEffect } from "react";

import { createDemoDossier, DEMO_DOSSIER_ID } from "@/lib/data/demo-dossier";
import { SYSTEM_PROVIDERS } from "@/lib/data/providers";
import { useDossierStore } from "@/lib/store/dossier-store";
import { DossierWorkspace, WorkspaceSkeleton } from "./DossierWorkspace";

/**
 * Expediente de demostración en memoria, sin backend (ruta /demo). Las fechas
 * dependen de la hora actual, que no se puede leer en el prerender.
 */
export function DemoWorkspace() {
  const loadDossier = useDossierStore((s) => s.loadDossier);
  const isDemoLoaded = useDossierStore((s) => s.dossier?.id === DEMO_DOSSIER_ID);

  useEffect(() => {
    if (useDossierStore.getState().dossier?.id !== DEMO_DOSSIER_ID) {
      loadDossier(createDemoDossier(Date.now()), SYSTEM_PROVIDERS, null);
    }
  }, [loadDossier]);

  return isDemoLoaded ? <DossierWorkspace /> : <WorkspaceSkeleton />;
}
