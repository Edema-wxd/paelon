import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");
const sql = neon(url);

const file = "drizzle/0001_constraints_triggers_sequences.sql";
const statements = readFileSync(file, "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)*$/.test(s));

for (const [i, statement] of statements.entries()) {
  const label = statement.split("\n").filter((l) => !l.startsWith("--"))[0]?.slice(0, 70);
  try {
    await sql.query(statement);
    console.log(`ok   ${i + 1}/${statements.length}  ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Already-present constraints are the expected "re-run" case, not a failure.
    const benign = /already exists|duplicate/i.test(message);
    console.log(`${benign ? "skip" : "FAIL"} ${i + 1}/${statements.length}  ${label}\n       ${message}`);
    if (!benign) process.exitCode = 1;
  }
}
