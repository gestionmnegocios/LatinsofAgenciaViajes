import { AuthGate } from "@/components/auth/AuthGate";
import { ProvidersPage } from "@/components/providers/ProvidersPage";

/** Catálogo de proveedores: precargados y propios de la agencia. */
export default function ProveedoresPage() {
  return (
    <AuthGate>
      <ProvidersPage />
    </AuthGate>
  );
}
