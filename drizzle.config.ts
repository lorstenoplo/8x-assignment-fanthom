import { config as loadEnv } from "dotenv";
// Next.js reads .env.local; plain `dotenv/config` only reads .env, so load
// both here (first file wins) or drizzle-kit sees no connection string.
loadEnv({ path: [".env.local", ".env"] });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
});
