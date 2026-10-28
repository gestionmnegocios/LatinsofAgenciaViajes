import { AuthGate } from "@/components/auth/AuthGate";
import { SettingsPage } from "@/components/settings/SettingsPage";

/** Configuración de la agencia: nombre, NIT, dirección, teléfono y logo. */
export default function ConfiguracionPage() {
  return (
    <AuthGate>
      <SettingsPage />
    </AuthGate>
  );
}
