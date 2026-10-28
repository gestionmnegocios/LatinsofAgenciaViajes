import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;
let client: BrowserClient | undefined;

/**
 * Cliente Supabase (singleton) para componentes cliente. Usa solo la llave
 * publicable: el aislamiento entre agencias lo garantiza la RLS
 * (`supabase/migrations/`), no el frontend.
 */
export function getSupabase(): BrowserClient {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
