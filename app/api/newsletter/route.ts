import { NextResponse } from "next/server";

import { newsletterSchema } from "@/lib/validation/newsletter";

/**
 * Newsletter signup handler.
 *
 * Server-side validation is the source of truth; the client form runs the same
 * schema only for UX. Field-level errors are returned so the form can surface
 * them without a second round of guessing.
 *
 * TODO(phase1): persistence is not wired. The `newsletter_subscribers` table
 * in spec §5 needs the Drizzle schema and a Neon connection, neither of which
 * exists yet — that is its own task, not a side effect of the homepage. Double
 * opt-in via Resend (spec §10) also depends on RESEND_ENABLED and must no-op
 * cleanly when it is false. Until then this validates and accepts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = newsletterSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Please check the details you entered.",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  // TODO(phase1): insert into `newsletter_subscribers` with double_opt_in and
  // dispatch the confirmation email once the DB and Resend wiring land.

  return NextResponse.json({ ok: true }, { status: 202 });
}
