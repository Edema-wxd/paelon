import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";

export const runtime = "nodejs";

/** Never cached — a cached health check reports the past. */
export const dynamic = "force-dynamic";

/**
 * Health check (backend spec §13).
 *
 * No auth, no PII, one cheap DB ping. Used by uptime monitoring and, more
 * importantly, to verify the self-hosting migration when it happens.
 *
 * Returns 503 when the database is down so a monitor sees a failure status
 * rather than having to parse the body.
 */
export async function GET() {
  const ts = new Date().toISOString();

  try {
    await db().execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up", ts });
  } catch {
    // The error is deliberately not included: a driver message can carry the
    // database host and user.
    return NextResponse.json({ ok: false, db: "down", ts }, { status: 503 });
  }
}
