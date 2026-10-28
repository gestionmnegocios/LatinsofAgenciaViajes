import type { AgencyInfo } from "@/lib/data/agency-repository";

/** Membrete de documentos impresos: logo, razón social, NIT, dirección y teléfono. */
export function AgencyLetterhead({ agency }: { agency: Pick<AgencyInfo, "name" | "nit" | "address" | "city" | "phone" | "logoUrl"> | null }) {
  if (!agency) return <div />;
  const location = [agency.address, agency.city].filter(Boolean).join(" · ");
  return (
    <div className="flex items-start gap-3">
      {agency.logoUrl && (
        // Imagen remota del bucket público; en impresión no aplica la optimización de next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={agency.logoUrl} alt={`Logo de ${agency.name}`} className="max-h-16 max-w-40 object-contain" />
      )}
      <div>
        <p className="text-base font-semibold">{agency.name}</p>
        <p>NIT {agency.nit}</p>
        {location && <p>{location}</p>}
        {agency.phone && <p>Tel. / WhatsApp {agency.phone}</p>}
      </div>
    </div>
  );
}
