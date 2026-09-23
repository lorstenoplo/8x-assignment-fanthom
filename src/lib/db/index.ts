import dns from "node:dns";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Neon's hostname resolves to both A and AAAA records. Node's default DNS
// order can hand undici an IPv6 address first; on machines where the IPv6
// route to Neon is slow or unreachable, that connection attempt eats the
// whole timeout before anything falls back, surfacing as `fetch failed` /
// `ETIMEDOUT`. Forcing IPv4 first avoids that path entirely.
dns.setDefaultResultOrder("ipv4first");

declare global {
  // eslint-disable-next-line no-var
  var __db: NeonHttpDatabase<typeof schema> | undefined;
}

const RETRIES = 14;
const RETRY_DELAY_MS = 150;

/**
 * Diagnosed directly (raw fetches against Neon's HTTP endpoint, bypassing
 * the app entirely, reproduced on two separate machines): outbound
 * connections to Neon's IPs intermittently fail (`ETIMEDOUT` /
 * `ENETUNREACH` / `fetch failed`), with latency also spiking into the
 * seconds even on successful requests. The `ipv4first` DNS ordering above
 * addresses the likely IPv6-route cause; this retry wrapper stays as a
 * second line of defense since a network-level cause can't be fully ruled
 * out from application code. Because failures look attempt-probabilistic
 * rather than one sustained outage, many quick retries beat few
 * long-backoff ones.
 */
function retrying(fn: (...args: never[]) => unknown, thisArg: unknown) {
  return (...args: never[]) => {
    const attempt = (n: number): unknown => {
      const result = Reflect.apply(fn, thisArg, args);
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        return (result as Promise<unknown>).catch((err: unknown) => {
          if (n >= RETRIES) throw err;
          return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)).then(() => attempt(n + 1));
        });
      }
      return result;
    };
    return attempt(0);
  };
}

/**
 * `neon()` returns a callable that's also an object with `.query`/
 * `.transaction` methods — drizzle's neon-http session reads
 * `client.query ?? client`, i.e. it never calls the returned function
 * directly, it calls `.query`. A `Proxy` with only an `apply` trap forwards
 * property access straight to the untouched target by default, so wrapping
 * just `apply` (the original approach here) silently never engaged: every
 * query ran with zero retries. Wrapping `get` for `query`/`transaction` too
 * is what actually puts retry logic on the path drizzle uses.
 */
function withRetry<T extends (...args: never[]) => unknown>(sql: T): T {
  return new Proxy(sql, {
    apply(target, thisArg, args) {
      return retrying(target, thisArg)(...(args as never[]));
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if ((prop === "query" || prop === "transaction") && typeof value === "function") {
        return retrying(value as (...args: never[]) => unknown, target);
      }
      return value;
    },
  });
}

/**
 * Neon's HTTP driver: each query is a single stateless fetch, not a pooled
 * websocket connection. Switched from the pooled `neon-serverless` driver
 * because that pool cached one long-lived websocket in a module-global
 * across dev-server hot reloads, and a connection left stale that way
 * surfaced as an intermittent "Failed query" 500 with no code-level cause.
 * The app never uses interactive transactions (checked), so nothing here
 * needs the pooled driver's extra capability.
 *
 * Lazily constructed: importing this module (e.g. during `next build`,
 * which touches every route file) must not require DATABASE_URL to be set.
 */
function getDb() {
  if (global.__db) return global.__db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in Neon's pooled connection string.",
    );
  }
  // keepalive: false — this sandbox intermittently threw AggregateError
  // "fetch failed" on undici's pooled/reused connections to Neon's
  // IPv6-only endpoint; forcing a fresh connection per request avoided it
  // in testing. Combined with withRetry as a second line of defense.
  global.__db = drizzle({ client: withRetry(neon(url, { fetchOptions: { keepalive: false } })), schema });
  return global.__db;
}

export const db: NeonHttpDatabase<typeof schema> = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export * as schema from "./schema";
