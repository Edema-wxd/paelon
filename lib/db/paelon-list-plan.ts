/**
 * What `add-paelon-list.ts` changes, as data and pure functions so it can be
 * tested without a database.
 *
 * The source is the list Paelon supplied on 2026-11-02: phone lines, services
 * and specialists. `seed/` already carries it. This is the subset of that seed
 * edit the live database needs, chosen so that nothing an editor has written
 * in the admin panel since is overwritten:
 *
 *  - rows that do not exist yet are inserted;
 *  - an existing row's field is written only when it is empty, or when the
 *    stored value is contained in the new one (a specialty list Paelon has
 *    since extended);
 *  - anything else is reported and left alone.
 *
 * The slugs are listed explicitly rather than "every seed row missing from the
 * database", so a row an editor deliberately removed is not brought back.
 */

/** Services added from Paelon's list. Values come from `seed/services.json`. */
export const NEW_SERVICE_SLUGS = [
  "general-surgery",
  "executive-health-checks",
  "emergency-care",
  "urgent-care",
  "radiology",
  "laboratory",
  "pharmacy",
  "physiotherapy",
  "orthopaedics",
  "psychiatry",
  "cardiology",
  "haematology",
  "ent",
  "dermatology",
  "nephrology",
  "neurology",
  "urology",
  "rheumatology",
] as const;

/** Clinicians added from Paelon's list. Values come from `seed/doctors.json`. */
export const NEW_DOCTOR_SLUGS = ["adebimpe-abudu", "lovina-ekpo"] as const;

/** Existing clinicians whose specialties Paelon's list extends. */
export const SPECIALTY_DOCTOR_SLUGS = [
  "ngozi-onyia",
  "micheal-talabi",
  "paulyn-nwaukwa",
] as const;

/** The branch whose WhatsApp is the appointment line. */
export const WHATSAPP_LOCATION_SLUG = "victoria-island";

/** Paelon's appointment line, for calls and WhatsApp. */
export const APPOINTMENT_WHATSAPP = "+234 912 512 0020";

/** Same matcher `lib/content.ts` uses for an unwritten seed value. */
const SEED_SENTINEL = /^TODO\(seed\)/;

/** True when a stored text value is empty or an unwritten seed placeholder. */
export function isEmptyText(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "" || SEED_SENTINEL.test(value);
}

export type NewRowDecision =
  | { kind: "insert" }
  /** A live row already has the slug: someone created it, so it is left alone. */
  | { kind: "exists" }
  /**
   * A soft-deleted row holds the slug. The slug index covers deleted rows, so
   * an insert would fail, and restoring it is an editor's decision.
   */
  | { kind: "deleted" };

/** Whether a slug from Paelon's list still needs a row. */
export function decideNewRow(
  existing: { deletedAt: Date | null } | undefined,
): NewRowDecision {
  if (!existing) return { kind: "insert" };
  return existing.deletedAt ? { kind: "deleted" } : { kind: "exists" };
}

export type SpecialtyDecision =
  | { kind: "set"; value: string[] }
  | { kind: "unchanged" }
  /** The stored list holds something Paelon's list does not: an editor's change. */
  | { kind: "edited" };

/**
 * Extend a clinician's specialties with Paelon's list.
 *
 * Written only when every stored specialty is also on the new list, so the
 * write adds and never removes. The stored order is kept, with the missing
 * entries appended in the list's order.
 */
export function mergeSpecialties(
  current: readonly string[],
  wanted: readonly string[],
): SpecialtyDecision {
  const has = (list: readonly string[], value: string) =>
    list.some((item) => item.trim().toLowerCase() === value.trim().toLowerCase());

  const missing = wanted.filter((value) => !has(current, value));
  if (missing.length === 0) return { kind: "unchanged" };
  if (!current.every((value) => has(wanted, value))) return { kind: "edited" };
  return { kind: "set", value: [...current, ...missing] };
}

export type FillDecision =
  | { kind: "set"; value: string }
  | { kind: "unchanged" }
  /** Already holds a different value: an editor's, so it stays. */
  | { kind: "edited"; current: string };

/** Fill a text field only when it is empty. Digits are compared, not spacing. */
export function fillIfEmpty(current: string | null, wanted: string): FillDecision {
  if (isEmptyText(current)) return { kind: "set", value: wanted };
  const digits = (value: string) => value.replace(/\D/g, "");
  if (digits(current ?? "") === digits(wanted)) return { kind: "unchanged" };
  return { kind: "edited", current: current ?? "" };
}

/**
 * Orders for new rows, appended after whatever the table holds now.
 *
 * Editors reorder in the admin panel, so the seed file's absolute positions
 * may collide with or jump ahead of rows that were moved. Appending keeps
 * their order and keeps the new rows in the list's order.
 */
export function appendedOrders(currentMax: number | null, count: number): number[] {
  const start = (currentMax ?? 0) + 1;
  return Array.from({ length: count }, (_, index) => start + index);
}
