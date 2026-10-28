import { Suspense } from "react";

import { WorkspaceSkeleton } from "@/components/dossier/DossierWorkspace";
import { ExpedienteRoute } from "@/components/dossiers/ExpedienteRoute";

/** /expediente?id=<uuid> — el ID se lee en el cliente; la RLS decide si existe. */
export default function ExpedientePage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <ExpedienteRoute />
    </Suspense>
  );
}
