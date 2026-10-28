import { AuthGate } from "@/components/auth/AuthGate";
import { DossierHome } from "@/components/dossiers/DossierHome";

export default function Home() {
  return (
    <AuthGate>
      <DossierHome />
    </AuthGate>
  );
}
