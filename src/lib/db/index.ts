import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
  var __db: NeonDatabase<typeof schema> | undefined;
}

/**
 * Lazily constructed: importing this module (e.g. during `next build`, which
 * touches every route file) must not require DATABASE_URL to be set. The
 * error only fires the first time a query actually runs.
 */
function getDb() {
  if (global.__db) return global.__db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in Neon's pooled connection string.",
    );
  }
  global.__dbPool ??= new Pool({ connectionString: url });
  global.__db = drizzle({ client: global.__dbPool, schema });
  return global.__db;
}

export const db: NeonDatabase<typeof schema> = new Proxy({} as NeonDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export * as schema from "./schema";
