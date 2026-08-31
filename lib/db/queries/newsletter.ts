import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db, dbTx } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema";

/**
 * Newsletter persistence.
 *
 * Every function here is written so the caller can return an identical response
 * for a new and an existing address — see the enumeration note on
 * `upsertSubscriber`.
 */

export interface UpsertResult {
  /** True when a confirmation email should be sent. */
  needsConfirmation: boolean;
  /** Raw confirm token, present only when `needsConfirmation` is true. */
  confirmToken?: string;
}

/**
 * Create or refresh a subscriber.
 *
 * `ON CONFLICT (email) DO UPDATE` rather than select-then-insert: the latter
 * races two concurrent signups for the same address into a unique violation.
 *
 * An already-confirmed subscriber gets no new token and no second email, but
 * the *caller* still returns the same success response — the endpoint must not
 * become an oracle that reveals who is on the list.
 */
export async function upsertSubscriber(input: {
  email: string;
  name: string | null;
  consentNdpr: boolean;
  consentTextVersion: string;
  confirmTokenHash: string;
  confirmExpiresAt: Date;
  unsubscribeTokenHash: string;
}): Promise<{ alreadyConfirmed: boolean }> {
  const rows = await db()
    .insert(newsletterSubscribers)
    .values({
      email: input.email,
      name: input.name,
      consentNdpr: input.consentNdpr,
      consentTextVersion: input.consentTextVersion,
      confirmTokenHash: input.confirmTokenHash,
      confirmExpiresAt: input.confirmExpiresAt,
      unsubscribeTokenHash: input.unsubscribeTokenHash,
    })
    .onConflictDoUpdate({
      target: newsletterSubscribers.email,
      set: {
        // Re-issue a confirmation token only while unconfirmed. Re-subscribing
        // after unsubscribing clears `unsubscribed_at`, which is the intent of
        // signing up again.
        confirmTokenHash: sql`case when ${newsletterSubscribers.confirmedAt} is null
          then excluded.confirm_token_hash else ${newsletterSubscribers.confirmTokenHash} end`,
        confirmExpiresAt: sql`case when ${newsletterSubscribers.confirmedAt} is null
          then excluded.confirm_expires_at else ${newsletterSubscribers.confirmExpiresAt} end`,
        name: sql`coalesce(excluded.name, ${newsletterSubscribers.name})`,
        unsubscribedAt: null,
      },
    })
    .returning({ confirmedAt: newsletterSubscribers.confirmedAt });

  return { alreadyConfirmed: rows[0]?.confirmedAt !== null };
}

/**
 * Confirm a subscription by token hash.
 *
 * Transactional and single-use: the token is cleared in the same statement that
 * sets `confirmed_at`, so a replayed link cannot confirm twice, and a
 * prefetching email client racing a real click cannot produce two confirmations.
 */
export async function confirmByTokenHash(
  tokenHash: string,
): Promise<{ confirmed: boolean }> {
  const client = dbTx();

  return client.transaction(async (tx) => {
    const rows = await tx
      .update(newsletterSubscribers)
      .set({
        confirmedAt: new Date(),
        confirmTokenHash: null,
        confirmExpiresAt: null,
      })
      .where(
        and(
          eq(newsletterSubscribers.confirmTokenHash, tokenHash),
          isNull(newsletterSubscribers.confirmedAt),
          gt(newsletterSubscribers.confirmExpiresAt, new Date()),
        ),
      )
      .returning({ id: newsletterSubscribers.id });

    return { confirmed: rows.length > 0 };
  });
}

/** Unsubscribe by token hash. Idempotent — a second click is not an error. */
export async function unsubscribeByTokenHash(
  tokenHash: string,
): Promise<{ found: boolean }> {
  const rows = await db()
    .update(newsletterSubscribers)
    .set({ unsubscribedAt: new Date() })
    .where(eq(newsletterSubscribers.unsubscribeTokenHash, tokenHash))
    .returning({ id: newsletterSubscribers.id });

  return { found: rows.length > 0 };
}
