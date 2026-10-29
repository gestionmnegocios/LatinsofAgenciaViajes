/**
 * Criterio de aceptación 3 · Segregación multi-tenant.
 *
 * Ejecuta la migración real sobre PGlite (PostgreSQL en WASM) con un stub del
 * esquema `auth` de Supabase y verifica, actuando como el rol `authenticated`
 * con el JWT de un asesor de la Agencia A, que no puede leer ni escribir nada
 * de la Agencia B aunque conozca sus IDs.
 *
 *   npm run test:rls
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
/** Todas las migraciones en orden, igual que `supabase db push`. */
const MIGRATION = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, MIGRATIONS_DIR), "utf8"))
  .join("\n");

/** Stub mínimo de lo que Supabase provee antes de las migraciones. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`;

/** Grants por defecto que Supabase aplica a las tablas de `public`. */
const SUPABASE_GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`;

const A = {
  agency: "aaaaaaaa-0000-4000-8000-000000000001",
  admin: "aaaaaaaa-0000-4000-8000-0000000000a1",
  agent: "aaaaaaaa-0000-4000-8000-0000000000a2",
  client: "aaaaaaaa-0000-4000-8000-0000000000c1",
  dossier: "aaaaaaaa-0000-4000-8000-0000000000d1",
  option1: "aaaaaaaa-0000-4000-8000-0000000000e1",
  option2: "aaaaaaaa-0000-4000-8000-0000000000e2",
  service: "aaaaaaaa-0000-4000-8000-0000000000f1",
};
const B = {
  agency: "bbbbbbbb-0000-4000-8000-000000000001",
  admin: "bbbbbbbb-0000-4000-8000-0000000000a1",
  client: "bbbbbbbb-0000-4000-8000-0000000000c1",
  dossier: "bbbbbbbb-0000-4000-8000-0000000000d1",
  option: "bbbbbbbb-0000-4000-8000-0000000000e1",
  service: "bbbbbbbb-0000-4000-8000-0000000000f1",
  provider: "bbbbbbbb-0000-4000-8000-0000000000b1",
  payment: "bbbbbbbb-0000-4000-8000-0000000000aa",
};

let db: PGlite;

/** Ejecuta `fn` como usuario autenticado (equivalente a una petición PostgREST con su JWT). */
async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const result = await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params);
  return result.rows[0].n;
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(MIGRATION);
  await db.exec(SUPABASE_GRANTS);

  // Datos semilla como superusuario (bypass RLS).
  await db.exec(`
    insert into auth.users (id) values ('${A.admin}'), ('${A.agent}'), ('${B.admin}');
    insert into public.agencies (id, name, nit) values
      ('${A.agency}', 'Agencia A', '900111111'),
      ('${B.agency}', 'Agencia B', '900222222');
    insert into public.agency_users (id, agency_id, full_name, role, default_commission_rate) values
      ('${A.admin}', '${A.agency}', 'Gladys', 'ADMIN', 15),
      ('${A.agent}', '${A.agency}', 'Laura',  'AGENT', 15),
      ('${B.admin}', '${B.agency}', 'Otro',   'ADMIN', 10);
    insert into public.clients (id, agency_id, document_number, full_name, whatsapp) values
      ('${A.client}', '${A.agency}', '1036', 'Andrés Pérez', '3001234567'),
      ('${B.client}', '${B.agency}', '7070', 'Cliente B',    '3009999999');
    insert into public.travel_dossiers
      (id, agency_id, agent_id, client_id, dossier_code, destination_title, departure_date, return_date) values
      ('${A.dossier}', '${A.agency}', '${A.agent}', '${A.client}', 'EXP-1049', 'Cancún', '2026-12-15', '2026-12-20'),
      ('${B.dossier}', '${B.agency}', '${B.admin}', '${B.client}', 'EXP-0001', 'Miami',  '2026-12-01', '2026-12-05');
    insert into public.quote_options (id, agency_id, dossier_id, option_title) values
      ('${A.option1}', '${A.agency}', '${A.dossier}', 'Opción 1'),
      ('${A.option2}', '${A.agency}', '${A.dossier}', 'Opción 2'),
      ('${B.option}',  '${B.agency}', '${B.dossier}', 'Opción 1');
    insert into public.providers_catalog (id, agency_id, name, category) values
      ('${B.provider}', '${B.agency}', 'Proveedor secreto de B', 'OPERADOR_LOCAL');
    insert into public.dossier_services
      (id, agency_id, quote_option_id, provider_id, provider_name, service_type, net_cost_original, sale_price) values
      ('${A.service}', '${A.agency}', '${A.option1}', '00000000-0000-4000-8000-000000000001', 'Mayorplus', 'PACKAGE', 3200000, 3800000),
      ('${B.service}', '${B.agency}', '${B.option}',  '${B.provider}', 'Proveedor secreto de B', 'HOTEL', 1000000, 1500000);
    insert into public.client_payments (id, agency_id, dossier_id, amount, payment_method, registered_by) values
      ('${B.payment}', '${B.agency}', '${B.dossier}', 500000, 'CASH', '${B.admin}');
    insert into public.agent_commissions (agency_id, dossier_id, agent_id, commission_percentage, calculated_amount) values
      ('${B.agency}', '${B.dossier}', '${B.admin}', 10, 42016.81);
  `);
});

after(async () => {
  await db?.close();
});

describe("Lectura: la Agencia A no ve datos de la Agencia B", () => {
  const tables = [
    "agencies",
    "agency_users",
    "clients",
    "travel_dossiers",
    "quote_options",
    "dossier_services",
    "client_payments",
    "agent_commissions",
  ];

  for (const table of tables) {
    test(`${table}: 0 filas de B (incluso filtrando por ID)`, async () => {
      await asUser(A.admin, async () => {
        const column = table === "agencies" ? "id" : "agency_id";
        assert.equal(await count(`select 1 from public.${table} where ${column} = $1`, [B.agency]), 0);
      });
    });
  }

  test("travel_dossiers: el ID exacto de B devuelve vacío", async () => {
    await asUser(A.admin, async () => {
      assert.equal(await count(`select 1 from public.travel_dossiers where id = $1`, [B.dossier]), 0);
      assert.equal(await count(`select 1 from public.travel_dossiers`), 1);
    });
  });

  test("providers_catalog: ve los 12 globales pero no los personalizados de B", async () => {
    await asUser(A.admin, async () => {
      assert.equal(await count(`select 1 from public.providers_catalog where id = $1`, [B.provider]), 0);
      assert.equal(await count(`select 1 from public.providers_catalog where is_system_preload`), 12);
    });
  });

  test("compute_dossier_financials sobre B devuelve ceros", async () => {
    await asUser(A.admin, async () => {
      const { rows } = await db.query<{ total_sale: string }>(
        `select total_sale from public.compute_dossier_financials($1)`,
        [B.dossier],
      );
      assert.equal(Number(rows[0].total_sale), 0);
    });
  });

  test("sin JWT (anon) no se ve nada", async () => {
    await db.exec(`set role anon;`);
    try {
      assert.equal(await count(`select 1 from public.travel_dossiers`), 0);
      assert.equal(await count(`select 1 from public.providers_catalog`), 0);
    } finally {
      await db.exec(`reset role;`);
    }
  });
});

describe("Escritura: manipulación de IDs bloqueada", () => {
  test("abono con agency_id de B → rechazado por RLS", async () => {
    await asUser(A.admin, async () => {
      await assert.rejects(
        db.query(
          `insert into public.client_payments (agency_id, dossier_id, amount, payment_method) values ($1, $2, 1, 'CASH')`,
          [B.agency, B.dossier],
        ),
        /row-level security/,
      );
    });
  });

  test("abono con agency_id propio colgado del expediente de B → rechazado por FK compuesta", async () => {
    await asUser(A.admin, async () => {
      await assert.rejects(
        db.query(
          `insert into public.client_payments (agency_id, dossier_id, amount, payment_method) values ($1, $2, 1, 'CASH')`,
          [A.agency, B.dossier],
        ),
        /foreign key/,
      );
    });
  });

  test("UPDATE / DELETE sobre filas de B afectan 0 filas", async () => {
    await asUser(A.admin, async () => {
      const upd = await db.query(`update public.dossier_services set sale_price = 1 where id = $1`, [B.service]);
      const del = await db.query(`delete from public.client_payments where id = $1`, [B.payment]);
      assert.equal(upd.affectedRows, 0);
      assert.equal(del.affectedRows, 0);
    });
    const { rows } = await db.query<{ sale_price: string }>(
      `select sale_price from public.dossier_services where id = $1`,
      [B.service],
    );
    assert.equal(Number(rows[0].sale_price), 1_500_000);
  });

  test("mover un expediente propio a la agencia B → rechazado", async () => {
    await asUser(A.admin, async () => {
      await assert.rejects(
        db.query(`update public.travel_dossiers set agency_id = $1 where id = $2`, [B.agency, A.dossier]),
        /row-level security|foreign key/,
      );
    });
  });

  test("usar el proveedor personalizado de B en un servicio propio → rechazado", async () => {
    await asUser(A.admin, async () => {
      await assert.rejects(
        db.query(
          `insert into public.dossier_services (agency_id, quote_option_id, provider_id, provider_name, service_type)
           values ($1, $2, $3, 'x', 'TOUR')`,
          [A.agency, A.option1, B.provider],
        ),
        /no disponible/,
      );
    });
  });

  test("editar un proveedor global del sistema → 0 filas", async () => {
    await asUser(A.admin, async () => {
      const r = await db.query(
        `update public.providers_catalog set name = 'hack' where id = '00000000-0000-4000-8000-000000000001'`,
      );
      assert.equal(r.affectedRows, 0);
    });
  });

  test("escribir comisiones directamente → rechazado", async () => {
    await asUser(A.admin, async () => {
      await assert.rejects(
        db.query(
          `insert into public.agent_commissions (agency_id, dossier_id, agent_id, commission_percentage, calculated_amount)
           values ($1, $2, $3, 100, 999999999)`,
          [A.agency, A.dossier, A.agent],
        ),
        /row-level security/,
      );
    });
  });

  test("RPC sobre el expediente de B → 'Expediente no encontrado'", async () => {
    await asUser(A.admin, async () => {
      await assert.rejects(db.query(`select public.liquidate_dossier($1)`, [B.dossier]), /no encontrado/);
      await assert.rejects(
        db.query(`select public.convert_quote_to_file($1, $2)`, [B.dossier, B.option]),
        /no encontrado/,
      );
    });
  });
});

describe("Flujo completo de la Agencia A (DRAFT → CONFIRMED → LIQUIDATED)", () => {
  test("conversión, comisión retenida, liquidación y blindaje", async () => {
    // Saltar estados por UPDATE directo está prohibido.
    await asUser(A.agent, async () => {
      await assert.rejects(
        db.query(`update public.travel_dossiers set status = 'LIQUIDATED' where id = $1`, [A.dossier]),
        /liquidate_dossier/,
      );
    });

    await asUser(A.agent, async () => {
      await db.query(`select public.convert_quote_to_file($1, $2)`, [A.dossier, A.option1]);

      const d = await db.query<{ status: string; gross_margin: string; net_utility_base: string; iva_margin: string }>(
        `select status, gross_margin, net_utility_base, iva_margin from public.travel_dossiers where id = $1`,
        [A.dossier],
      );
      assert.equal(d.rows[0].status, "CONFIRMED");
      assert.equal(Number(d.rows[0].gross_margin), 600_000);
      assert.equal(Number(d.rows[0].net_utility_base), 504_201.68);
      assert.equal(Number(d.rows[0].iva_margin), 95_798.32);

      const opts = await db.query<{ id: string; is_selected: boolean; is_archived: boolean }>(
        `select id, is_selected, is_archived from public.quote_options where dossier_id = $1 order by option_title`,
        [A.dossier],
      );
      assert.deepEqual(
        opts.rows.map((o) => [o.is_selected, o.is_archived]),
        [
          [true, false],
          [false, true],
        ],
      );

      // El asesor ve su propia comisión, retenida.
      const c = await db.query<{ status: string; calculated_amount: string }>(
        `select status, calculated_amount from public.agent_commissions where dossier_id = $1`,
        [A.dossier],
      );
      assert.equal(c.rows[0].status, "HELD");
      assert.equal(Number(c.rows[0].calculated_amount), 75_630.25);

      // Sin pago completo ni proveedor pagado no liquida.
      await assert.rejects(db.query(`select public.liquidate_dossier($1)`, [A.dossier]), /saldo pendiente/);

      await db.query(
        `insert into public.client_payments (agency_id, dossier_id, amount, payment_method) values ($1, $2, 3800000, 'TRANSFER_BANCOLOMBIA')`,
        [A.agency, A.dossier],
      );
      await assert.rejects(db.query(`select public.liquidate_dossier($1)`, [A.dossier]), /sin pago al proveedor/);

      await db.query(`update public.dossier_services set is_provider_paid = true where id = $1`, [A.service]);
      await db.query(`select public.liquidate_dossier($1)`, [A.dossier]);

      const released = await db.query<{ status: string }>(
        `select status from public.agent_commissions where dossier_id = $1`,
        [A.dossier],
      );
      assert.equal(released.rows[0].status, "RELEASED");

      // Expediente liquidado: inmutable.
      await assert.rejects(
        db.query(`update public.dossier_services set sale_price = 1 where id = $1`, [A.service]),
        /liquidado/,
      );
      await assert.rejects(
        db.query(
          `insert into public.client_payments (agency_id, dossier_id, amount, payment_method) values ($1, $2, 1, 'CASH')`,
          [A.agency, A.dossier],
        ),
        /liquidado/,
      );
      await assert.rejects(
        db.query(`update public.travel_dossiers set destination_title = 'x' where id = $1`, [A.dossier]),
        /liquidado/,
      );
    });
  });

  test("la admin de A ve la comisión de Laura; la Agencia B no", async () => {
    await asUser(A.admin, async () => {
      assert.equal(await count(`select 1 from public.agent_commissions`), 1);
    });
    await asUser(B.admin, async () => {
      assert.equal(await count(`select 1 from public.agent_commissions where dossier_id = $1`, [A.dossier]), 0);
    });
  });

  test("corte de comisiones: solo ADMIN, solo RELEASED propias, en lote a PAID", async () => {
    const ids = async () =>
      (await db.query<{ id: string }>(`select id from public.agent_commissions where agency_id = $1`, [A.agency])).rows.map(
        (r) => r.id,
      );
    const own = await ids();
    const foreign = (await db.query<{ id: string }>(`select id from public.agent_commissions where agency_id = $1`, [B.agency]))
      .rows[0].id;

    await asUser(A.agent, async () => {
      await assert.rejects(db.query(`select public.settle_commissions($1)`, [own]), /administrador/);
    });
    await asUser(A.admin, async () => {
      // Mezclar una comisión de B invalida todo el lote.
      await assert.rejects(db.query(`select public.settle_commissions($1)`, [[...own, foreign]]), /liberadas/);
      await assert.rejects(db.query(`select public.settle_commissions($1)`, [[]]), /seleccionadas/);

      const { rows } = await db.query<{ batch: string }>(`select public.settle_commissions($1) as batch`, [own]);
      const paid = await db.query<{ status: string; settlement_batch_id: string; paid_at: string | null }>(
        `select status, settlement_batch_id, paid_at from public.agent_commissions where id = any ($1)`,
        [own],
      );
      assert.ok(paid.rows.every((r) => r.status === "PAID" && r.settlement_batch_id === rows[0].batch && r.paid_at));

      // Una comisión ya pagada no se paga dos veces.
      await assert.rejects(db.query(`select public.settle_commissions($1)`, [own]), /liberadas/);
    });
    const b = await db.query<{ status: string }>(`select status from public.agent_commissions where id = $1`, [foreign]);
    assert.equal(b.rows[0].status, "HELD");
  });
});

describe("RPC de aplicación", () => {
  const NEW_USER = "cccccccc-0000-4000-8000-0000000000a1";

  test("register_agency crea la agencia y deja al usuario como ADMIN (solo una vez)", async () => {
    await db.exec(`insert into auth.users (id) values ('${NEW_USER}');`);
    await asUser(NEW_USER, async () => {
      const { rows } = await db.query<{ id: string }>(
        `select public.register_agency('Agencia C', '900333333', 'Carlos') as id`,
      );
      assert.ok(rows[0].id);
      const me = await db.query<{ role: string }>(`select role from public.agency_users where id = $1`, [NEW_USER]);
      assert.equal(me.rows[0].role, "ADMIN");
      await assert.rejects(db.query(`select public.register_agency('Otra', '900444444', 'Carlos')`), /ya pertenece/);
      // La agencia nueva no ve nada de A ni de B.
      assert.equal(await count(`select 1 from public.travel_dossiers`), 0);
    });
  });

  test("create_dossier genera EXP consecutivo, upsert de cliente y Opción 1", async () => {
    await asUser(A.agent, async () => {
      const first = await db.query<{ id: string }>(
        `select public.create_dossier('555', 'Ana Ruiz', '3015550000', 'San Andrés', '2027-01-10', '2027-01-15', 2, 0) as id`,
      );
      const second = await db.query<{ id: string }>(
        `select public.create_dossier('555', 'Ana María Ruiz', '3015550000', 'Cartagena', '2027-02-10', '2027-02-12', 1, 1) as id`,
      );
      const codes = await db.query<{ dossier_code: string; has_minors: boolean }>(
        `select dossier_code, has_minors from public.travel_dossiers where id = any($1::uuid[]) order by dossier_code`,
        [[first.rows[0].id, second.rows[0].id]],
      );
      assert.deepEqual(codes.rows.map((r) => r.dossier_code), ["EXP-1050", "EXP-1051"]);
      assert.equal(codes.rows[1].has_minors, true);
      assert.equal(await count(`select 1 from public.clients where document_number = '555'`), 1);
      assert.equal(await count(`select 1 from public.quote_options where dossier_id = $1`, [first.rows[0].id]), 1);
    });
  });

  test("sync_dossier_options: alta, edición y baja atómicas; USD sin TRM bloquea la conversión", async () => {
    await asUser(A.agent, async () => {
      const { rows } = await db.query<{ id: string }>(
        `select public.create_dossier('777', 'Beto', '3017770000', 'Punta Cana', '2027-03-01', '2027-03-06', 2, 0) as id`,
      );
      const dossierId = rows[0].id;
      const opt = await db.query<{ id: string }>(`select id from public.quote_options where dossier_id = $1`, [dossierId]);
      const optionId = opt.rows[0].id;
      const option2 = crypto.randomUUID();
      const svc = (id: string, patch: Record<string, unknown> = {}) => ({
        id,
        providerId: "00000000-0000-4000-8000-000000000003",
        providerName: "Ciclo Viajes",
        serviceType: "HOTEL",
        description: "Hotel",
        bookingReference: "",
        currency: "USD",
        exchangeRate: 4000,
        netCostOriginal: 800,
        salePrice: 3800000,
        paymentDeadline: null,
        isProviderPaid: false,
        ...patch,
      });
      const s1 = crypto.randomUUID();
      const s2 = crypto.randomUUID();
      const sync = (options: unknown) =>
        db.query(`select public.sync_dossier_options($1, $2::jsonb)`, [dossierId, JSON.stringify(options)]);

      await sync([
        { id: optionId, title: "Opción 1", services: [svc(s1), svc(s2, { currency: "COP", exchangeRate: 1, netCostOriginal: 100000, salePrice: 150000 })] },
        { id: option2, title: "Opción 2", services: [] },
      ]);
      const cost = await db.query<{ net_cost: string }>(`select net_cost from public.dossier_services where id = $1`, [s1]);
      assert.equal(Number(cost.rows[0].net_cost), 3_200_000, "net_cost calculado por la base (USD × TRM)");
      assert.equal(await count(`select 1 from public.quote_options where dossier_id = $1`, [dossierId]), 2);

      // Baja de s2 y de la Opción 2; s1 queda sin TRM.
      await sync([{ id: optionId, title: "Opción 1 · Ciclo", services: [svc(s1, { exchangeRate: 0 })] }]);
      assert.equal(await count(`select 1 from public.dossier_services where id = $1`, [s2]), 0);
      assert.equal(await count(`select 1 from public.quote_options where dossier_id = $1`, [dossierId]), 1);

      await assert.rejects(db.query(`select public.convert_quote_to_file($1, $2)`, [dossierId, optionId]), /sin TRM/);
      await sync([{ id: optionId, title: "Opción 1 · Ciclo", services: [svc(s1)] }]);
      await db.query(`select public.convert_quote_to_file($1, $2)`, [dossierId, optionId]);
    });
  });

  test("sync_dossier_options no puede tocar expedientes de otra agencia", async () => {
    await asUser(A.admin, async () => {
      await assert.rejects(
        db.query(`select public.sync_dossier_options($1, '[]'::jsonb)`, [B.dossier]),
        /no encontrado/,
      );
      // Reusar el ID de un servicio de B dentro de un expediente propio no lo secuestra.
      await assert.rejects(
        db.query(`select public.sync_dossier_options($1, $2::jsonb)`, [
          A.dossier,
          JSON.stringify([{ id: A.option1, title: "x", services: [{ id: B.service, serviceType: "TOUR", currency: "COP", providerName: "x" }] }]),
        ]),
      );
    });
    const { rows } = await db.query<{ agency_id: string }>(`select agency_id from public.dossier_services where id = $1`, [B.service]);
    assert.equal(rows[0].agency_id, B.agency);
  });
});

describe("Semáforo del tablero (dashboard_alerts)", () => {
  const D = {
    soon: "aaaaaaaa-0000-4000-8000-0000000001d1",
    later: "aaaaaaaa-0000-4000-8000-0000000001d2",
    optSoon: "aaaaaaaa-0000-4000-8000-0000000001e1",
    optLater: "aaaaaaaa-0000-4000-8000-0000000001e2",
    bDossier: "bbbbbbbb-0000-4000-8000-0000000001d1",
    bOption: "bbbbbbbb-0000-4000-8000-0000000001e1",
  };

  before(async () => {
    // Como superusuario: expedientes ya confirmados con fechas relativas a hoy.
    await db.exec(`
      insert into public.travel_dossiers
        (id, agency_id, agent_id, client_id, dossier_code, destination_title, departure_date, return_date, status, adults_count, children_count) values
        ('${D.soon}',     '${A.agency}', '${A.agent}', '${A.client}', 'EXP-2001', 'Santa Marta', current_date + 1,  current_date + 5,  'CONFIRMED', 2, 1),
        ('${D.later}',    '${A.agency}', '${A.agent}', '${A.client}', 'EXP-2002', 'Madrid',      current_date + 60, current_date + 70, 'CONFIRMED', 2, 0),
        ('${D.bDossier}', '${B.agency}', '${B.admin}', '${B.client}', 'EXP-0002', 'Lima',        current_date + 1,  current_date + 3,  'CONFIRMED', 1, 0);
      insert into public.quote_options (id, agency_id, dossier_id, option_title, is_selected) values
        ('${D.optSoon}',  '${A.agency}', '${D.soon}',     'Opción 1', true),
        ('${D.optLater}', '${A.agency}', '${D.later}',    'Opción 1', true),
        ('${D.bOption}',  '${B.agency}', '${D.bDossier}', 'Opción 1', true);
      insert into public.dossier_services
        (agency_id, quote_option_id, provider_name, service_type, net_cost_original, sale_price, payment_deadline, is_provider_paid) values
        ('${A.agency}', '${D.optSoon}',  'Mayorplus', 'PACKAGE', 2000000, 2500000, now() + interval '10 hours', false),
        ('${A.agency}', '${D.optSoon}',  'Decameron', 'HOTEL',   1000000, 1200000, now() - interval '2 hours',  true),
        ('${A.agency}', '${D.optLater}', 'Iberia',    'FLIGHT',  3000000, 3500000, now() + interval '30 days',  false),
        ('${B.agency}', '${D.bOption}',  'Otro',      'HOTEL',   500000,  700000,  now() + interval '1 hour',   false);
      insert into public.client_payments (agency_id, dossier_id, amount, payment_method) values
        ('${A.agency}', '${D.soon}', 1000000, 'CASH');
    `);
  });

  test("clasifica proveedor ≤24h, saldo de la semana y salidas ≤48h solo de la propia agencia", async () => {
    await asUser(A.agent, async () => {
      const { rows } = await db.query<{ kind: string; dossier_code: string; amount: string | null; pax: number; detail: string | null }>(
        `select kind, dossier_code, amount, pax, detail from public.dashboard_alerts()`,
      );
      const by = (k: string) => rows.filter((r) => r.kind === k);

      assert.deepEqual(by("PROVIDER_DUE").map((r) => [r.dossier_code, r.detail, Number(r.amount)]), [["EXP-2001", "Mayorplus", 2_000_000]]);
      // Venta 3,7 M − abono 1 M; Madrid (sale en 60 días) no entra.
      assert.deepEqual(by("CLIENT_DUE").map((r) => [r.dossier_code, Number(r.amount)]), [["EXP-2001", 2_700_000]]);
      assert.deepEqual(by("DEPARTURE").map((r) => [r.dossier_code, r.pax]), [["EXP-2001", 3]]);
      assert.ok(rows.every((r) => r.dossier_code !== "EXP-0002"));
    });
  });
});

describe("Equipo: invitaciones y gestión de asesores", () => {
  const INVITEE = "aaaaaaaa-0000-4000-8000-0000000002a1";

  test("invitar, aceptar con correo confirmado, desactivar y conservar un ADMIN", async () => {
    await db.exec(`insert into auth.users (id, email) values ('${INVITEE}', 'Nueva.Asesora@agencia-a.co');`);

    // Solo el ADMIN invita, y solo a su agencia.
    const invite = `insert into public.agency_invitations (agency_id, email, full_name, role, commission_rate, invited_by)
                    values ($1, 'nueva.asesora@agencia-a.co', 'Nueva Asesora', 'AGENT', 12, $2) returning id`;
    await asUser(A.agent, async () => {
      await assert.rejects(db.query(invite, [A.agency, A.agent]), /row-level security/);
    });
    await asUser(B.admin, async () => {
      await assert.rejects(db.query(invite, [A.agency, B.admin]), /row-level security/);
    });
    const invitationId = await asUser(A.admin, async () => (await db.query<{ id: string }>(invite, [A.agency, A.admin])).rows[0].id);
    await asUser(B.admin, async () => {
      assert.equal(await count(`select 1 from public.agency_invitations`), 0);
    });

    // Sin correo confirmado no ve ni acepta la invitación.
    await asUser(INVITEE, async () => {
      assert.equal(await count(`select 1 from public.my_onboarding()`), 0);
      await assert.rejects(db.query(`select public.accept_invitation($1)`, [invitationId]), /no encontrada/);
    });
    await db.exec(`update auth.users set email_confirmed_at = now() where id = '${INVITEE}';`);

    await asUser(INVITEE, async () => {
      const { rows } = await db.query<{ kind: string; agency_name: string; commission_rate: string }>(
        `select kind, agency_name, commission_rate from public.my_onboarding()`,
      );
      assert.deepEqual(rows.map((r) => [r.kind, r.agency_name, Number(r.commission_rate)]), [["INVITATION", "Agencia A", 12]]);
      await db.query(`select public.accept_invitation($1)`, [invitationId]);
      await assert.rejects(db.query(`select public.accept_invitation($1)`, [invitationId]), /ya pertenece/);
      const me = await db.query<{ role: string; default_commission_rate: string }>(
        `select role, default_commission_rate from public.agency_users where id = $1`,
        [INVITEE],
      );
      assert.equal(me.rows[0].role, "AGENT");
      assert.equal(Number(me.rows[0].default_commission_rate), 12);
    });

    await asUser(A.admin, async () => {
      // El asesor no puede ajustar su propia tasa; el ADMIN sí.
      await db.query(`update public.agency_users set default_commission_rate = 18, is_active = false where id = $1`, [INVITEE]);
      // Mover a otra agencia o dejarla sin ADMIN activo: rechazado.
      await assert.rejects(db.query(`update public.agency_users set agency_id = $1 where id = $2`, [B.agency, A.agent]));
      await assert.rejects(
        db.query(`update public.agency_users set role = 'AGENT' where id = $1`, [A.admin]),
        /administrador activo/,
      );
    });
    await asUser(A.agent, async () => {
      const r = await db.query(`update public.agency_users set default_commission_rate = 50 where id = $1`, [A.agent]);
      assert.equal(r.affectedRows, 0);
    });
    await asUser(B.admin, async () => {
      const r = await db.query(`update public.agency_users set is_active = false where id = $1`, [A.agent]);
      assert.equal(r.affectedRows, 0);
    });

    // El desactivado pierde acceso y lo sabe.
    await asUser(INVITEE, async () => {
      assert.equal(await count(`select 1 from public.travel_dossiers`), 0);
      const { rows } = await db.query<{ kind: string }>(`select kind from public.my_onboarding()`);
      assert.deepEqual(rows.map((r) => r.kind), ["INACTIVE"]);
    });
  });
});

describe("Configuración de la agencia y logo", () => {
  test("solo el ADMIN edita su agencia y sube logo en su carpeta", async () => {
    await asUser(A.agent, async () => {
      const r = await db.query(`update public.agencies set address = 'x' where id = $1`, [A.agency]);
      assert.equal(r.affectedRows, 0);
      await assert.rejects(
        db.query(`insert into storage.objects (bucket_id, name) values ('agency-logos', $1)`, [`${A.agency}/logo.png`]),
        /row-level security/,
      );
    });
    await asUser(A.admin, async () => {
      const r = await db.query(
        `update public.agencies set address = 'Cra 70 # 1-23', phone = '3001234567', logo_url = 'https://x/logo.png' where id = $1`,
        [A.agency],
      );
      assert.equal(r.affectedRows, 1);
      await assert.rejects(db.query(`update public.agencies set name = '  ' where id = $1`, [A.agency]), /agencies_name_not_blank/);
      // Otra agencia: ni su fila ni su carpeta.
      assert.equal((await db.query(`update public.agencies set address = 'x' where id = $1`, [B.agency])).affectedRows, 0);
      await assert.rejects(
        db.query(`insert into storage.objects (bucket_id, name) values ('agency-logos', $1)`, [`${B.agency}/logo.png`]),
        /row-level security/,
      );
      await db.query(`insert into storage.objects (bucket_id, name) values ('agency-logos', $1)`, [`${A.agency}/logo.png`]);
    });
  });
});

describe("Pagos a proveedores (giros)", () => {
  const SOON = "aaaaaaaa-0000-4000-8000-0000000001d1"; // EXP-2001, confirmado

  test("giros por servicio: validan, recalculan 'pagado' y no se pisan con el autoguardado", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.dossier_services where provider_name = 'Mayorplus' and agency_id = $1 and net_cost_original = 2000000`,
      [A.agency],
    );
    const service = rows[0].id;
    await db.exec(`update public.dossier_services set booking_reference = 'PNR-ZX81' where id = '${service}';`);

    const pay = (amount: number, extra: { currency?: string; dossier?: string; service?: string } = {}) =>
      db.query<{ id: string; booking_reference: string }>(
        `insert into public.provider_payments (agency_id, dossier_id, service_id, currency, amount_original, payment_method, reference)
         values ($1, $2, $3, $4, $5, 'TRANSFER_BANCOLOMBIA', 'TRX-1') returning id, booking_reference`,
        [A.agency, extra.dossier ?? SOON, extra.service ?? service, extra.currency ?? "COP", amount],
      );
    const paidFlag = async () =>
      (await db.query<{ p: boolean }>(`select is_provider_paid as p from public.dossier_services where id = $1`, [service])).rows[0].p;

    await asUser(A.agent, async () => {
      await assert.rejects(pay(2_000_001), /supera el saldo/);
      await assert.rejects(pay(100, { currency: "USD" }), /COP/);
      // Expediente liquidado: bloqueado.
      await assert.rejects(pay(100, { dossier: A.dossier, service: A.service }), /liquidado|activos/);

      const first = await pay(1_500_000);
      assert.equal(first.rows[0].booking_reference, "PNR-ZX81");
      assert.equal(await paidFlag(), false);

      // El autoguardado con un valor viejo no pisa el estado calculado.
      await db.query(`update public.dossier_services set is_provider_paid = true where id = $1`, [service]);
      assert.equal(await paidFlag(), false);

      const second = await pay(500_000);
      assert.equal(await paidFlag(), true);

      await db.query(`delete from public.provider_payments where id = $1`, [second.rows[0].id]);
      assert.equal(await paidFlag(), false);

      // Un servicio con giros no se puede borrar.
      await assert.rejects(db.query(`delete from public.dossier_services where id = $1`, [service]), /foreign key/);
    });

    await asUser(B.admin, async () => {
      assert.equal(await count(`select 1 from public.provider_payments`), 0);
      await assert.rejects(
        db.query(
          `insert into public.provider_payments (agency_id, dossier_id, service_id, currency, amount_original, payment_method)
           values ($1, $2, $3, 'COP', 1, 'CASH')`,
          [B.agency, SOON, service],
        ),
      );
    });
  });
});

describe("Catálogo de proveedores propios", () => {
  test("crear con ficha de contacto, editar, aislar y no borrar si está en uso", async () => {
    const id = await asUser(A.agent, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.providers_catalog (agency_id, name, category, nit, default_currency, payment_deadline_hours,
                                               contact_name, phone, email, bank_details)
         values ($1, 'Receptivo Caribe', 'OPERADOR_LOCAL', '901222333', 'COP', 72,
                 'Sandra', '3005551234', 'reservas@caribe.co', 'Bancolombia ahorros 123-456789-01') returning id`,
        [A.agency],
      );
      await assert.rejects(
        db.query(`insert into public.providers_catalog (agency_id, name, category) values ($1, '   ', 'HOTEL')`, [A.agency]),
        /providers_catalog_name_not_blank/,
      );
      const r = await db.query(`update public.providers_catalog set phone = '3010000000' where id = $1`, [rows[0].id]);
      assert.equal(r.affectedRows, 1);
      return rows[0].id;
    });

    await asUser(B.admin, async () => {
      assert.equal(await count(`select 1 from public.providers_catalog where id = $1`, [id]), 0);
      assert.equal((await db.query(`delete from public.providers_catalog where id = $1`, [id])).affectedRows, 0);
    });

    await asUser(A.agent, async () => {
      await db.query(
        `insert into public.dossier_services (agency_id, quote_option_id, provider_id, provider_name, service_type)
         values ($1, $2, $3, 'Receptivo Caribe', 'TOUR')`,
        [A.agency, "aaaaaaaa-0000-4000-8000-0000000001e2", id],
      );
      await assert.rejects(db.query(`delete from public.providers_catalog where id = $1`, [id]), /foreign key/);
    });
  });
});
