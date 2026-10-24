import { beforeEach, describe, expect, it, vi } from "vitest";

import { TESTIMONIAL_AVATAR } from "@/lib/admin/resources/testimonials";
import type { AdminUser } from "@/lib/auth/session";

/**
 * What the testimonial actions write to the audit log.
 *
 * A testimonial is a real patient's words plus a record of what they agreed to,
 * so two edits are not ordinary content edits: turning consent on or off, and
 * changing the wording of the quote. Both must leave evidence of the before and
 * the after, and for the quote that evidence is the wording itself — D4,
 * 2026-10-23: a consent dispute is answered by reading what the patient said
 * and what it was changed to, which the SHA-256 digest this used to record
 * could not do. `lib/admin/audit.ts` documents it as the one place the log
 * deliberately holds personal data, and the retention that follows from it.
 *
 * The database, the session, the cache and the audit writer are mocked: this is
 * a test of the wiring, and the consent filter on the public side is proved
 * against a real database in `tests/integration/content.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  writeAuditEntry: vi.fn(),
  isSlugTaken: vi.fn(),
  getContentOwner: vi.fn(),
  getContentById: vi.fn(),
  createContentWithRelations: vi.fn(),
  updateContentWithRelations: vi.fn(),
  softDeleteContent: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/db/queries/users", () => ({ writeAuditEntry: mocks.writeAuditEntry }));
vi.mock("@/lib/db/queries/media", () => ({ setMediaAlt: vi.fn() }));
vi.mock("@/lib/db/queries/content-crud", () => ({
  isSlugTaken: mocks.isSlugTaken,
  getContentOwner: mocks.getContentOwner,
  getContentById: mocks.getContentById,
  createContentWithRelations: mocks.createContentWithRelations,
  updateContentWithRelations: mocks.updateContentWithRelations,
  softDeleteContent: mocks.softDeleteContent,
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const actions = await import("@/lib/admin/resource-actions");

const ROW_ID = "9c1f2a3b-4d5e-4f60-8a71-b2c3d4e5f607";

/** Deliberately not a real patient's words — see the header of the schema suite. */
const ORIGINAL_QUOTE = "Placeholder quote text, entered as given.";
const EDITED_QUOTE = "Placeholder quote text, entered as given today.";


function user(role: AdminUser["role"] = "admin"): AdminUser {
  return { id: "actor-1", name: "Staff", email: "staff@example.test", role, roleLabel: role };
}

/** A complete, valid submission. Overrides replace single entries. */
function form(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string> = {
    id: ROW_ID,
    patientName: "A Patient",
    slug: "a-patient",
    nameFormat: "initials",
    quote: ORIGINAL_QUOTE,
    dateGiven: "2026-01-05",
    serviceId: "",
    locationId: "",
    order: "1",
    // The image controls, as a browser submits them with nothing chosen.
    [TESTIMONIAL_AVATAR.id]: "",
    [TESTIMONIAL_AVATAR.alt]: "",
  };

  const data = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    // `null` removes a field, which is how an unticked checkbox submits.
    if (value !== null) data.append(key, value);
  }
  return data;
}

function auditMetadata(): Record<string, unknown> {
  const call = mocks.writeAuditEntry.mock.calls[0]?.[0] as
    | { metadata: Record<string, unknown> }
    | undefined;
  if (!call) throw new Error("no audit row was written");
  return call.metadata;
}

/** The row as it stood before the edit. */
function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: ROW_ID,
    slug: "a-patient",
    quote: ORIGINAL_QUOTE,
    consentGiven: false,
    published: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminUser.mockResolvedValue(user());
  mocks.isSlugTaken.mockResolvedValue(false);
  mocks.getContentOwner.mockResolvedValue({ createdByUserId: "actor-1" });
  mocks.getContentById.mockResolvedValue(existing());
  mocks.updateContentWithRelations.mockResolvedValue({ id: ROW_ID });
  mocks.createContentWithRelations.mockResolvedValue({ id: ROW_ID });
});

describe("testimonial audit trail", () => {
  it("records consent before and after when it is granted", async () => {
    const result = await actions.updateTestimonialAction(
      null,
      form({ consentGiven: "on", published: "on" }),
    );

    expect(result.ok).toBe(true);
    expect(auditMetadata()).toMatchObject({
      consent_given_before: false,
      consent_given_after: true,
    });
  });

  it("records consent before and after when it is withdrawn", async () => {
    mocks.getContentById.mockResolvedValue(existing({ consentGiven: true }));

    await actions.updateTestimonialAction(null, form({ published: "on" }));

    expect(auditMetadata()).toMatchObject({
      consent_given_before: true,
      consent_given_after: false,
    });
  });

  it("records the quote change in the patient's own words, both sides", async () => {
    await actions.updateTestimonialAction(
      null,
      form({ quote: EDITED_QUOTE, published: "on" }),
    );

    const metadata = auditMetadata();
    expect(metadata.quote_before).toBe(ORIGINAL_QUOTE);
    expect(metadata.quote_after).toBe(EDITED_QUOTE);
  });

  it("keeps the quote out of `stripPii`'s reach", async () => {
    await actions.updateTestimonialAction(
      null,
      form({ quote: EDITED_QUOTE, published: "on" }),
    );

    // The wording is the evidence D4 asked for, so the PII backstop must not
    // be taught to recognise `quote` as a personal-data key.
    expect(auditMetadata()).toHaveProperty("quote_after", EDITED_QUOTE);
  });

  it("says nothing about a column that did not change", async () => {
    await actions.updateTestimonialAction(null, form({ published: "on" }));

    const metadata = auditMetadata();
    expect(metadata).not.toHaveProperty("quote_before");
    expect(metadata).not.toHaveProperty("consent_given_before");
  });

  it("records the opening consent state on a create, with no before", async () => {
    const create = form({ id: null, consentGiven: "on", published: "on" });
    const result = await actions.createTestimonialAction(null, create);

    expect(result.ok).toBe(true);
    expect(auditMetadata()).toMatchObject({
      consent_given_before: null,
      consent_given_after: true,
      quote_before: null,
      quote_after: ORIGINAL_QUOTE,
    });
  });
});

describe("consent is never a side effect", () => {
  it("does not grant consent when a row is published", async () => {
    await actions.updateTestimonialAction(null, form({ published: "on" }));

    const [, , values] = mocks.updateContentWithRelations.mock.calls[0] as [
      unknown,
      string,
      Record<string, unknown>,
    ];
    expect(values.published).toBe(true);
    expect(values.consentGiven).toBe(false);
  });

  it("does not withdraw consent when a row is unpublished", async () => {
    mocks.getContentById.mockResolvedValue(existing({ consentGiven: true }));

    await actions.updateTestimonialAction(
      null,
      form({ consentGiven: "on", published: null }),
    );

    const [, , values] = mocks.updateContentWithRelations.mock.calls[0] as [
      unknown,
      string,
      Record<string, unknown>,
    ];
    expect(values.published).toBe(false);
    expect(values.consentGiven).toBe(true);
  });
});
