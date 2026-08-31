import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

/**
 * Applies committed migrations. This is the production path — `drizzle-kit
 * push` is for local iteration only and must never run against production
 * (backend spec §22).
 *
 * Uses the unpooled connection: migrations take advisory locks and a pooler
 * can hand successive statements to different backends.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL_UNPOOLED (or DATABASE_URL) must be set.");
  }

  const db = drizzle(neon(url));
  await migrate(db, { migrationsFolder: "./drizzle" });
  process.stdout.write(
    `${JSON.stringify({ level: "info", event: "db.migrate.complete" })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      event: "db.migrate.failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exit(1);
});
