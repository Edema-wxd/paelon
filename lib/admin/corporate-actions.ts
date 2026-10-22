"use server";

import { z } from "zod";

import { adminAction, done, fail, type ActionResult, type ActionState } from "@/lib/admin/action";
import {
  anonymiseCorporateEnquiry,
  changeCorporateStatus,
} from "@/lib/db/queries/corporate-enquiries";
import { corporateStatusEnum } from "@/lib/db/schema";

/**
 * `/admin/corporate-enquiries` workflow actions, built on `adminAction`, which
 * does the session, `can()`, parsing, the audit row and revalidation. Mirrors
 * `lib/admin/bookings-actions.ts` and `lib/admin/contact-actions.ts`.
 *
 * There is no transition graph here (see `changeCorporateStatus`'s comment):
 * the Zod enum is the only validation a status move needs. Audit metadata is
 * the `from`/`to` enum pair `adminAction` already captures — no bespoke
 * `writeAudit` call is needed on top of it.
 */

const CORPORATE_PATH = "/admin/corporate-enquiries";

export type CorporateMessage = { message: string };
export type CorporateResult = ActionResult<CorporateMessage>;
export type CorporateState = ActionState<CorporateMessage>;

const REFUSAL_MESSAGES = {
  not_found: "That enquiry no longer exists.",
};

const enquiryId = z.uuid("That enquiry no longer exists.");

const statusSchema = z.object({
  enquiryId,
  to: z.enum(corporateStatusEnum.enumValues, "Choose a status."),
});

/** Move a corporate enquiry to a new status. Any status may move to any other. */
export const changeCorporateStatusAction = adminAction(
  {
    resource: "corporate_enquiries",
    action: "update",
    schema: statusSchema,
    event: "corporate.status_changed",
    path: CORPORATE_PATH,
  },
  async ({ enquiryId: id, to }) => {
    const result = await changeCorporateStatus(id, to);
    if (!result.ok) return fail(REFUSAL_MESSAGES[result.reason]);

    return done(
      { message: "Status updated." },
      { entityId: id, metadata: { from: result.from, to: result.to } },
    );
  },
);

const anonymiseSchema = z.object({ enquiryId });

/** Erase a corporate enquiry's personal data under the retention policy. Admin-only. */
export const anonymiseCorporateAction = adminAction(
  {
    resource: "corporate_enquiries",
    action: "delete",
    schema: anonymiseSchema,
    event: "corporate.anonymised",
    path: CORPORATE_PATH,
  },
  async ({ enquiryId: id }) => {
    const result = await anonymiseCorporateEnquiry(id);
    if (!result.ok) return fail(REFUSAL_MESSAGES[result.reason]);

    return done({ message: "Personal data erased." }, { entityId: id, metadata: {} });
  },
);
