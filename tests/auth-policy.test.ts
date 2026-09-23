import { describe, expect, it } from "vitest";

import {
  assertCan,
  assertCanOnRow,
  can,
  canOnRow,
  ForbiddenError,
  ROLE_LABELS,
  SENSITIVE_RESOURCES,
  type Action,
  type OwnedRow,
  type Resource,
  type Role,
} from "@/lib/auth/policy";

const ROLES: Role[] = ["admin", "editor", "contributor"];
const ACTIONS: Action[] = ["read", "create", "update", "delete", "publish"];

const CLINICAL: Resource[] = ["services", "doctors", "locations", "hmos", "testimonials"];
const EDITORIAL: Resource[] = ["authors", "blog_posts", "awards", "faqs"];
const PATIENT_DATA: Resource[] = [
  "bookings",
  "contact_submissions",
  "corporate_enquiries",
  "newsletter_subscribers",
];
const ALL: Resource[] = [...CLINICAL, ...EDITORIAL, ...PATIENT_DATA, "media", "users", "audit_log", "analytics"];

type Grants = Record<Resource, readonly Action[]>;

const EVERYTHING = ACTIONS;
const NOTHING: readonly Action[] = [];

/**
 * The expected answer of `can()` for every role × resource, written out by hand
 * from spec §8 Roles and decisions B1–B3 rather than derived from the policy's
 * own sets — a matrix computed from the code under test proves nothing.
 */
const EXPECTED: Record<Role, Grants> = {
  admin: {
    services: EVERYTHING,
    doctors: EVERYTHING,
    locations: EVERYTHING,
    hmos: EVERYTHING,
    testimonials: EVERYTHING,
    authors: EVERYTHING,
    blog_posts: EVERYTHING,
    awards: EVERYTHING,
    faqs: EVERYTHING,
    bookings: EVERYTHING,
    contact_submissions: EVERYTHING,
    corporate_enquiries: EVERYTHING,
    newsletter_subscribers: EVERYTHING,
    media: EVERYTHING,
    users: EVERYTHING,
    audit_log: ["read"],
    analytics: ["read"],
  },
  editor: {
    services: EVERYTHING,
    doctors: EVERYTHING,
    locations: EVERYTHING,
    hmos: EVERYTHING,
    testimonials: EVERYTHING,
    authors: EVERYTHING,
    blog_posts: EVERYTHING,
    awards: EVERYTHING,
    faqs: EVERYTHING,
    bookings: ["read", "update"],
    contact_submissions: ["read", "update"],
    corporate_enquiries: ["read", "update"],
    newsletter_subscribers: ["read", "update"],
    media: EVERYTHING,
    users: NOTHING,
    audit_log: NOTHING,
    analytics: NOTHING,
  },
  contributor: {
    services: NOTHING,
    doctors: NOTHING,
    locations: NOTHING,
    hmos: NOTHING,
    testimonials: NOTHING,
    // `update` here is "on some rows" — narrowed by canOnRow below.
    authors: ["read", "create", "update"],
    blog_posts: ["read", "create", "update"],
    awards: ["read", "create", "update"],
    faqs: ["read", "create", "update"],
    bookings: NOTHING,
    contact_submissions: NOTHING,
    corporate_enquiries: NOTHING,
    newsletter_subscribers: NOTHING,
    media: ["read", "create", "update", "delete"],
    users: NOTHING,
    audit_log: NOTHING,
    analytics: NOTHING,
  },
};

describe("can — full matrix", () => {
  for (const role of ROLES) {
    for (const resource of ALL) {
      for (const action of ACTIONS) {
        const expected = EXPECTED[role][resource].includes(action);
        it(`${role} ${expected ? "may" : "may not"} ${action} ${resource}`, () => {
          expect(can(role, action, resource)).toBe(expected);
        });
      }
    }
  }
});

describe("can — invariants", () => {
  it("lets only admin delete a sensitive resource", () => {
    expect([...SENSITIVE_RESOURCES].sort()).toEqual([...PATIENT_DATA, "users"].sort());
    for (const resource of SENSITIVE_RESOURCES) {
      expect(can("admin", "delete", resource), resource).toBe(true);
      expect(can("editor", "delete", resource), resource).toBe(false);
      expect(can("contributor", "delete", resource), resource).toBe(false);
    }
  });

  it("never lets a contributor publish or delete content", () => {
    for (const resource of [...CLINICAL, ...EDITORIAL]) {
      expect(can("contributor", "publish", resource), resource).toBe(false);
      expect(can("contributor", "delete", resource), resource).toBe(false);
    }
  });

  it("keeps the audit log unwritable by every role", () => {
    for (const role of ROLES) {
      for (const action of ["create", "update", "delete", "publish"] as Action[]) {
        expect(can(role, action, "audit_log"), `${role}:${action}`).toBe(false);
      }
    }
  });
});

describe("can — deny by default", () => {
  it("refuses a role that is not in the enum, on every action and resource", () => {
    // Casting past the type is the point: this guards the runtime path a
    // tampered session cookie would take.
    for (const role of ["root", "", "Admin", "super_admin"] as unknown as Role[]) {
      for (const resource of ALL) {
        for (const action of ACTIONS) {
          expect(can(role, action, resource), `${role}:${action}:${resource}`).toBe(false);
        }
      }
    }
  });
});

describe("canOnRow — ownership", () => {
  const ME = "7b0c0b8e-0000-4000-8000-000000000001";
  const THEM = "7b0c0b8e-0000-4000-8000-000000000002";

  const mine: OwnedRow = { createdByUserId: ME };
  const theirs: OwnedRow = { createdByUserId: THEM };
  const unowned: OwnedRow = { createdByUserId: null };
  const myUpload: OwnedRow = { uploadedBy: ME };
  const theirUpload: OwnedRow = { uploadedBy: THEM };

  const contributor = { id: ME, role: "contributor" as const };

  it("lets a contributor update editorial rows they created, and no others", () => {
    for (const resource of EDITORIAL) {
      expect(canOnRow(contributor, "update", resource, mine), resource).toBe(true);
      expect(canOnRow(contributor, "update", resource, theirs), resource).toBe(false);
      expect(canOnRow(contributor, "update", resource, unowned), resource).toBe(false);
      expect(canOnRow(contributor, "update", resource, {}), resource).toBe(false);
    }
  });

  it("lets a contributor read and create editorial rows regardless of owner", () => {
    for (const resource of EDITORIAL) {
      for (const row of [mine, theirs, unowned, {}]) {
        expect(canOnRow(contributor, "read", resource, row), resource).toBe(true);
        expect(canOnRow(contributor, "create", resource, row), resource).toBe(true);
      }
    }
  });

  it("never lets a contributor publish or delete an editorial row, even their own", () => {
    for (const resource of EDITORIAL) {
      expect(canOnRow(contributor, "publish", resource, mine), resource).toBe(false);
      expect(canOnRow(contributor, "delete", resource, mine), resource).toBe(false);
    }
  });

  it("checks media ownership through uploaded_by, not created_by_user_id", () => {
    for (const action of ["update", "delete"] as Action[]) {
      expect(canOnRow(contributor, action, "media", myUpload), action).toBe(true);
      expect(canOnRow(contributor, action, "media", theirUpload), action).toBe(false);
      expect(canOnRow(contributor, action, "media", { uploadedBy: null }), action).toBe(false);
      // A content-style owner column on a media row is not ownership.
      expect(canOnRow(contributor, action, "media", mine), action).toBe(false);
    }
    expect(canOnRow(contributor, "read", "media", theirUpload)).toBe(true);
    expect(canOnRow(contributor, "create", "media", {})).toBe(true);
    expect(canOnRow(contributor, "publish", "media", myUpload)).toBe(false);
  });

  it("does not let ownership widen what can() denies", () => {
    for (const resource of [...CLINICAL, ...PATIENT_DATA, "users", "audit_log"] as Resource[]) {
      for (const action of ACTIONS) {
        expect(canOnRow(contributor, action, resource, mine), `${action}:${resource}`).toBe(false);
      }
    }
  });

  it("refuses a contributor with an empty id, even on an unowned row", () => {
    const blank = { id: "", role: "contributor" as const };
    expect(canOnRow(blank, "update", "blog_posts", { createdByUserId: "" })).toBe(false);
    expect(canOnRow(blank, "update", "blog_posts", unowned)).toBe(false);
    expect(canOnRow(blank, "delete", "media", { uploadedBy: "" })).toBe(false);
  });

  it("matches can() exactly for admin and editor, whoever owns the row", () => {
    for (const role of ["admin", "editor"] as const) {
      const user = { id: ME, role };
      for (const resource of ALL) {
        for (const action of ACTIONS) {
          for (const row of [mine, theirs, unowned, theirUpload, {}]) {
            expect(canOnRow(user, action, resource, row), `${role}:${action}:${resource}`).toBe(
              can(role, action, resource),
            );
          }
        }
      }
    }
  });

  it("refuses an unknown role even on its own row", () => {
    expect(canOnRow({ id: ME, role: "root" as Role }, "update", "blog_posts", mine)).toBe(false);
  });
});

describe("assertCan / assertCanOnRow", () => {
  it("return silently when permitted", () => {
    expect(() => assertCan("admin", "delete", "bookings")).not.toThrow();
    expect(() =>
      assertCanOnRow({ id: "u1", role: "contributor" }, "update", "blog_posts", {
        createdByUserId: "u1",
      }),
    ).not.toThrow();
  });

  it("throw a 403 ForbiddenError that does not name a role", () => {
    const attempts = [
      () => assertCan("contributor", "delete", "bookings"),
      () =>
        assertCanOnRow({ id: "u1", role: "contributor" }, "update", "blog_posts", {
          createdByUserId: "u2",
        }),
    ];
    for (const attempt of attempts) {
      try {
        attempt();
        expect.unreachable("expected ForbiddenError");
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).status).toBe(403);
        // The message must not leak which role would have been sufficient.
        expect((error as ForbiddenError).message).not.toMatch(/admin|editor|contributor/i);
      }
    }
  });
});

describe("ROLE_LABELS", () => {
  it("labels every role by its enum name (B1)", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role].toLowerCase()).toBe(role);
    }
  });
});
