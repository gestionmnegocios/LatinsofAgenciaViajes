import { AuthGate } from "@/components/auth/AuthGate";
import { CommissionsPage } from "@/components/commissions/CommissionsPage";

/** FR-4.4 Corte de comisiones (ADMIN) / Mis comisiones (asesor). */
export default function ComisionesPage() {
  return (
    <AuthGate>
      <CommissionsPage />
    </AuthGate>
  );
}
