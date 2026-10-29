import { Suspense } from "react";
import type { Metadata } from "next";

import { QuoteLanding } from "@/components/landing/QuoteLanding";

export const metadata: Metadata = {
  title: "Tu cotización de viaje",
  // Enlace privado por token: no debe aparecer en buscadores.
  robots: { index: false, follow: false },
};

/** /cotizacion?t=<token> — micro-landing pública que recibe el cliente por WhatsApp. */
export default function CotizacionPage() {
  return (
    <Suspense fallback={null}>
      <QuoteLanding />
    </Suspense>
  );
}
