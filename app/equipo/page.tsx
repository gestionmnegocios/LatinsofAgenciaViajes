import { AuthGate } from "@/components/auth/AuthGate";
import { TeamPage } from "@/components/team/TeamPage";

/** Equipo: asesores, tasas de comisión e invitaciones (edición solo ADMIN). */
export default function EquipoPage() {
  return (
    <AuthGate>
      <TeamPage />
    </AuthGate>
  );
}
