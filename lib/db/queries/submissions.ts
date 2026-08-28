import { db } from "@/lib/db/client";
import {
  contactSubmissions,
  corporateEnquiries,
  type ContactSubmission,
  type CorporateEnquiry,
} from "@/lib/db/schema";

/**
 * Contact and corporate submission writes.
 *
 * Never cached and never read publicly — these hold personal data.
 */

export async function createContactSubmission(
  values: typeof contactSubmissions.$inferInsert,
): Promise<ContactSubmission> {
  const rows = await db().insert(contactSubmissions).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error("Contact submission insert returned no row");
  return row;
}

export async function createCorporateEnquiry(
  values: typeof corporateEnquiries.$inferInsert,
): Promise<CorporateEnquiry> {
  const rows = await db().insert(corporateEnquiries).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error("Corporate enquiry insert returned no row");
  return row;
}
