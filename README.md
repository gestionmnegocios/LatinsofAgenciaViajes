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
| `/` | Login → registro de agencia (primer usuario = ADMIN) → semáforo (FR-1.1), listado de expedientes, Apertura Flash y exportación CSV contable del mes (FR-5.2, solo ADMIN) |
| `/expediente?id=…` | Workspace conectado: autoguardado (~0,7 s), confirmar y liquidar vía RPC |
| `/comisiones` | Corte de comisiones (FR-4.4): por pagar / retenidas / pagadas, agrupadas por asesor; pago en lote y cuenta de cobro imprimible a PDF. El asesor ve solo las suyas |
| `/equipo` | Asesores: rol, tasa de comisión y activo/inactivo; invitaciones por correo (edición solo ADMIN) |
| `/proveedores` | Catálogo: 12 precargados (solo lectura) y proveedores propios con NIT, moneda, plazo de pago, contacto y datos bancarios; crear, editar y eliminar (si no se usan) |
| `/configuracion` | Datos de la agencia (nombre, NIT, dirección, ciudad, teléfono/WhatsApp) y logo; edición solo ADMIN. Salen en recibos y cuentas de cobro |
| `/cotizacion?t=…` | Micro-landing pública de la cotización (sin sesión): logo, fotos del banco, opciones con «Lo quiero» y «Descargar PDF» |
| `/demo` | El mismo Workspace con datos en memoria, sin backend |

RPC de aplicación (`20261028000100_app_rpcs.sql`): `register_agency`,
`create_dossier` (consecutivo `EXP-####` por agencia) y `sync_dossier_options`
(guarda opciones y servicios en una transacción). `convert_quote_to_file` y
`liquidate_dossier` recalculan las cifras en el servidor. `settle_commissions`
(`20261028000300_commission_settlement.sql`) pasa en lote comisiones RELEASED a
PAID con un mismo `settlement_batch_id`; solo ADMIN. `dashboard_alerts`
(`20261028000400_dashboard_alerts.sql`) alimenta el semáforo en hora de Colombia:
🔴 proveedores sin pagar con time-limit vencido o ≤ 24 h, 🟡 saldo del cliente con
vencimiento esta semana (próximo time-limit o salida), 🟢 salidas en ≤ 48 h.

### Equipo e invitaciones (`20261028000500_team.sql`)

Sin service role: el ADMIN crea una invitación (correo, rol, %); la persona crea
su cuenta con ese correo, lo confirma y al ingresar `my_onboarding` le muestra la
invitación, que acepta con `accept_invitation`. Un trigger impide dejar la
agencia sin un ADMIN activo o mover usuarios de agencia; un usuario desactivado
pierde el acceso por RLS y ve un aviso.

Los abonos tienen recibo de caja imprimible a PDF desde el panel de abonos.

### Logo de la agencia (`20261028000600_agency_settings.sql`)

Bucket público `agency-logos` (PNG/JPG/WEBP/SVG, ≤ 2 MB). Solo el ADMIN escribe,
y solo en la carpeta `<agency_id>/`. Cada subida usa un nombre nuevo (sin caché
vieja) y borra los anteriores; `agencies.logo_url` guarda la URL pública.

### Pagos a proveedores (`20261029000000_provider_payments.sql`)

Panel «Proveedores» del expediente activo: giros por servicio de la opción
aprobada, en la moneda del servicio (USD con la TRM real del giro), con
comprobante y el localizador del momento. La base de datos impide pagar de más,
girar en expedientes en cotización o liquidados y borrar servicios con giros, y
con giros calcula `is_provider_paid` (lo girado cubre el costo neto); el
autoguardado no puede pisarlo.

### Micro-landing de cotización (`20261029000200_quote_landing.sql`)

- Banco de imágenes por agencia (máx. 10, trigger con bloqueo) en Configuración;
  bucket público `agency-images`, escritura solo ADMIN en su carpeta.
- «Enlace web» en el paso 1 del Workspace crea un `quote_shares` con token
  aleatorio y las fotos elegidas (la primera es la portada) y arma el mensaje de
  WhatsApp con el enlace.
- El público solo llama `get_quote_share(token)` (precios de venta, descripciones,
  imágenes; nunca costos ni mayoristas) y `accept_quote_share(token, opción)`,
  que registra «Lo quiero» mientras la cotización siga en DRAFT. El Workspace
  muestra la elección; la conversión la hace el asesor.

### Exportación contable (`lib/accounting/export.ts`)

Un comprobante cuadrado por expediente liquidado, en pesos enteros, CSV con `;`
y BOM: 111005 (recaudo) contra 281505 por proveedor, 2408 (IVA), 4155 (base,
absorbe el redondeo) y 520518 / 233520 (comisión). Cada giro a proveedor del mes
genera su propio comprobante (`EXP-1049-G3F9A2C`): débito 281505 a la TRM
cotizada contra crédito 111005 por la salida real, y la diferencia en cambio a
530525 (gasto) o 421020 (ingreso). Ajustar `ACCOUNTS` al plan de
cuentas auxiliar de la agencia en Siigo o Alegra.

Tras cambiar el esquema: aplicar la migración, regenerar
`lib/supabase/database.types.ts` y correr `npm run test:rls`.
