import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit runs outside Next.js, so it reads .env.local itself.
 *
 * Uses the UNPOOLED connection: migrations hold long-lived sessions and take
 * advisory locks, which a pooled connection handles badly. Falls back to
 * DATABASE_URL when unpooled is not configured.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED (or DATABASE_URL) must be set to run drizzle-kit.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
