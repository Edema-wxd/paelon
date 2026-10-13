#!/usr/bin/env node
/**
 * Apply a hand-written migration statement by statement.
 *
 * `drizzle-kit push` cannot be scripted here: it stops to ask whether
 * `awards.logo` became `awards.logo_id` and aborts on "Interactive prompts
 * require a TTY terminal" when its output is piped. `drizzle-kit migrate` is
 * not an option either — the databases were built with `push`, so
 * `drizzle.__drizzle_migrations` is empty and a migrate run would start again
 * from 0000 and collide with every existing object.
 *
 * So migrations 0001, 0002 and 0003 were each applied by hand, with a
 * throwaway copy of the same twenty-line script. This is that script, kept.
 *
 * Re-runnable on purpose. Every statement that fails because the object it
 * creates is already there is reported as `skip`, not `FAIL`, so running it
 * against a database that is half-migrated finishes the job rather than
 * refusing to start. Anything else is a real error and sets a non-zero exit
 * code, having already applied the statements before it — Postgres DDL is not
 * transactional across the whole file here, which is exactly why the output
 * names every statement.
 *
 * It does NOT write to `drizzle.__drizzle_migrations`. Recording a migration
 * as run is a claim about a database's history, and these databases have none
 * to speak of; `drizzle/meta/_journal.json` is the record that matters for
 * diffing.
 *
 * Usage:
 *   npm run db:apply -- drizzle/0003_site_settings.sql
 *
 * Against production or preview, pass their connection string explicitly
 * rather than editing .env.local:
 *   DATABASE_URL='<prod url>' npm run db:apply -- drizzle/0003_site_settings.sql
 *
 * Requires DATABASE_URL. Prints one line per statement and a summary.
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

import { neon } from "@neondatabase/serverless";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [file, ...rest] = process.argv.slice(2);

if (!file || rest.length > 0) {
  fail("Usage: npm run db:apply -- <path/to/migration.sql>");
}

if (!process.env.DATABASE_URL) {
  fail(
    "DATABASE_URL is not set. Add it to .env.local, then run with:\n" +
      "  node --env-file=.env.local scripts/apply-sql-migration.mjs <file>",
  );
}

let source;
try {
  source = await readFile(file, "utf8");
} catch (error) {
  fail(`${file}: ${error instanceof Error ? error.message : String(error)}`);
}

/**
 * Split on drizzle's own statement separator, dropping comment-only chunks.
 *
 * A chunk that is nothing but `--` lines is the file's prose, not SQL, and
 * sending it to Postgres is an error rather than a no-op.
 */
const statements = source
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(
    (statement) =>
      statement.length > 0 && !/^(--[^\n]*\n?)*$/.test(statement),
  );

if (statements.length === 0) {
  fail(`${file}: no SQL statements found. Is this a migration file?`);
}

const sql = neon(process.env.DATABASE_URL);

/**
 * True when the database could not be reached, as opposed to rejecting the SQL.
 *
 * Worth separating: an unreachable database makes every remaining statement
 * fail for the same reason, and a wall of FAIL lines reads like a broken
 * migration rather than a broken connection.
 */
function isConnectionError(message) {
  return /Error connecting to database|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(
    message,
  );
}

// Preflight, so an unreachable database is one clear line before anything runs.
try {
  await sql`select 1`;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(
    `Could not reach the database, so nothing was applied.\n  ${message}\n` +
      "Check DATABASE_URL and that the Neon branch is awake.",
  );
}

// `succeeded` rather than `applied`: a re-run of a migration written with
// `IF NOT EXISTS` and `ON CONFLICT DO NOTHING` reports success without
// changing anything, and Postgres sends that back as a notice the driver does
// not surface. Counting those as "applied" would overstate what happened.
let succeeded = 0;
let skipped = 0;
let failed = 0;

for (const [index, statement] of statements.entries()) {
  // The first non-comment line is enough to recognise a statement in the log.
  const label =
    statement
      .split("\n")
      .find((line) => !line.trimStart().startsWith("--"))
      ?.trim()
      .slice(0, 70) ?? "";
  const position = `${index + 1}/${statements.length}`;

  try {
    await sql.query(statement);
    succeeded += 1;
    process.stdout.write(`ok   ${position}  ${label}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The expected re-run case: the object this statement creates exists.
    const benign = /already exists|duplicate/i.test(message);

    if (benign) {
      skipped += 1;
      process.stdout.write(`skip ${position}  ${label}\n`);
      continue;
    }

    failed += 1;
    process.stderr.write(`FAIL ${position}  ${label}\n       ${message}\n`);

    // The connection died mid-run. Every statement after this one would fail
    // identically, so stop and leave the count honest about where it got to.
    if (isConnectionError(message)) {
      process.stderr.write(
        "Lost the database connection; stopping here rather than failing the rest.\n",
      );
      break;
    }
  }
}

process.stdout.write(
  `\n${file}: ${succeeded} succeeded, ${skipped} already present, ${failed} failed\n`,
);
process.exit(failed > 0 ? 1 : 0);
