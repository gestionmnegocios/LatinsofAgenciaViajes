# TravelSaaS Colombia · Core Workspace

Mid-Office para agencias de viajes minoristas: cotización con opciones →
expediente activo → liquidación DIAN, en una sola página.

Next.js 16 (App Router) · TypeScript estricto · Tailwind CSS 4 · Zustand · Supabase.

## Comandos

```bash
npm run dev        # http://localhost:3000 (expediente de demostración)
npm test           # motor financiero + WhatsApp (node --test)
npm run test:rls   # migración real sobre PGlite: aislamiento multi-tenant
npm run build
```

## Estructura

| Ruta | Qué hace |
| --- | --- |
| `lib/finance/types.ts` | Tipos de dominio (espejo de los ENUM/tablas SQL). |
| `lib/finance/calculations.ts` | Motor DIAN puro: margen, base ÷ 1,19, IVA 2408, comisión, estado HELD/RELEASED, semáforos, precondiciones de liquidación. |
| `lib/store/dossier-store.ts` | Estado del Workspace (Zustand) y hooks `useFinancialSummary` / `useWorkingOption`. |
| `lib/whatsapp.ts` | Recibo de abono y enlace `wa.me` codificado. |
| `components/dossier/DossierWorkspace.tsx` | Single-Page 70/30, pestañas de opciones, conversión en 1 clic, liquidación. |
| `components/dossier/FinancialThermometer.tsx` | Panel financiero reactivo + bloque PUC con copia (2815, 4155, 2408, 520518). |
| `components/dossier/PaymentDrawer.tsx` | Abonos, % pagado, saldo y botón de WhatsApp por recibo. |
| `components/dossier/ServicesTable.tsx` | Grilla editable en línea, USD con TRM, time-limits con semáforo. |
| `supabase/migrations/…_init.sql` | Esquema, RLS, FKs compuestas por agencia, RPC `convert_quote_to_file` y `liquidate_dossier`, seed de mayoristas. |
| `supabase/tests/rls_isolation.test.ts` | Pruebas del criterio 3 (lectura/escritura cruzada entre agencias). |

## Reglas financieras

```
Margen Bruto       = Venta − Costo proveedores (COP; USD × TRM)
Base Gravable Neta = Margen / 1,19          → Cuenta 4155
IVA 19 %           = Margen − Base          → Cuenta 2408
Comisión asesor    = Base × tasa %          → Cuenta 520518 (HELD hasta saldo 0 + LIQUIDATED)
Utilidad agencia   = Base − Comisión
Costo proveedores                            → Cuenta 2815
```

Los montos se redondean a centavos internamente (NUMERIC(14,2)) y se muestran
al peso. Con margen ≤ 0 no se genera IVA ni comisión.

## Supabase

Proyecto: `LatinsofAgenciaViajes` (`oboqmueszriimadxxzyc`). Las migraciones
de `supabase/migrations/` están aplicadas. `.env.local` (no versionado) tiene la
URL y la llave publicable; usa `.env.example` como plantilla.

| Ruta | Qué muestra |
| --- | --- |
| `/` | Login → registro de agencia (primer usuario = ADMIN) → listado de expedientes + Apertura Flash |
| `/expediente?id=…` | Workspace conectado: autoguardado (~0,7 s), confirmar y liquidar vía RPC |
| `/comisiones` | Corte de comisiones (FR-4.4): por pagar / retenidas / pagadas, agrupadas por asesor; pago en lote y cuenta de cobro imprimible a PDF. El asesor ve solo las suyas |
| `/demo` | El mismo Workspace con datos en memoria, sin backend |

RPC de aplicación (`20261028000100_app_rpcs.sql`): `register_agency`,
`create_dossier` (consecutivo `EXP-####` por agencia) y `sync_dossier_options`
(guarda opciones y servicios en una transacción). `convert_quote_to_file` y
`liquidate_dossier` recalculan las cifras en el servidor. `settle_commissions`
(`20261028000300_commission_settlement.sql`) pasa en lote comisiones RELEASED a
PAID con un mismo `settlement_batch_id`; solo ADMIN.

Tras cambiar el esquema: aplicar la migración, regenerar
`lib/supabase/database.types.ts` y correr `npm run test:rls`.
