"use server";

import { z } from "zod";

import { adminAction, done, fail, type ActionResult, type ActionState } from "@/lib/admin/action";
import {
  anonymiseContactSubmission,
  markHandled,
} from "@/lib/db/queries/contact-submissions";

/**
 * `/admin/contact` workflow actions, built on `adminAction`, which does the
 * session, `can()`, parsing, the audit row and revalidation. Mirrors
 * `lib/admin/bookings-actions.ts`.
 *
 * Audit metadata is ids and booleans only — never `name`, `email`, `phone` or
 * `message`, which is exactly what `writeAudit`'s `stripPii` backstop would
 * strip anyway, but it should never come to that.
 */

const CONTACT_PATH = "/admin/contact";

export type ContactMessage = { message: string };
export type ContactResult = ActionResult<ContactMessage>;
export type ContactState = ActionState<ContactMessage>;

const REFUSAL_MESSAGES = {
  not_found: "That submission no longer exists.",
};

const submissionId = z.uuid("That submission no longer exists.");

const handledSchema = z.object({
  submissionId,
  handled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/** Mark a contact submission handled, or clear that state. */
export const markHandledAction = adminAction(
  {
    resource: "contact_submissions",
    action: "update",
    schema: handledSchema,
    event: "contact.handled_changed",
    path: CONTACT_PATH,
  },
  async ({ submissionId: id, handled }, { user }) => {
    const result = await markHandled(id, user.id, handled);
    if (!result.ok) return fail(REFUSAL_MESSAGES[result.reason]);

    return done(
      { message: handled ? "Marked handled." : "Marked unhandled." },
      { entityId: id, metadata: { handled } },
    );
  },
);

const anonymiseSchema = z.object({ submissionId });

/** Erase a contact submission's personal data under the retention policy. Admin-only. */
export const anonymiseContactAction = adminAction(
  {
    resource: "contact_submissions",
    action: "delete",
    schema: anonymiseSchema,
    event: "contact.anonymised",
    path: CONTACT_PATH,
  },
  async ({ submissionId: id }) => {
    const result = await anonymiseContactSubmission(id);
    if (!result.ok) return fail(REFUSAL_MESSAGES[result.reason]);

    return done({ message: "Personal data erased." }, { entityId: id, metadata: {} });
  },
);
