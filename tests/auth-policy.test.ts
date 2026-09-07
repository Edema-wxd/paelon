import { describe, expect, it } from "vitest";

import {
  assertCan,
  can,
  ForbiddenError,
  ROLE_LABELS,
  SENSITIVE_RESOURCES,
  type Action,
  type Resource,
  type Role,
} from "@/lib/auth/policy";

const ROLES: Role[] = ["admin", "editor", "contributor"];

const CONTENT: Resource[] = [
  "services",
  "doctors",
  "locations",
  "hmos",
  "testimonials",
  "authors",
  "blog_posts",
  "awards",
  "faqs",
];

const PATIENT_DATA: Resource[] = [
  "bookings",
  "contact_submissions",
  "corporate_enquiries",
  "newsletter_subscribers",
];

const ALL: Resource[] = [...CONTENT, ...PATIENT_DATA, "media", "users", "audit_log"];
const ACTIONS: Action[] = ["read", "create", "update", "delete", "publish"];

describe("can — super admin (admin)", () => {
  it("may do anything to any resource", () => {
    for (const resource of ALL) {
      for (const action of ACTIONS) {
        // The audit log is append-only for everyone, including a super admin.
        const expected = resource === "audit_log" ? action === "read" : true;
        expect(can("admin", action, resource), `${action}:${resource}`).toBe(
          expected,
        );
      }
    }
  });
});

describe("can — admin (editor)", () => {
  it("may delete non-sensitive resources", () => {
    for (const resource of ["hmos", "authors", "blog_posts", "awards", "faqs", "media"] as Resource[]) {
      expect(can("editor", "delete", resource), resource).toBe(true);
    }
  });

  it("may not delete any sensitive resource", () => {
    for (const resource of SENSITIVE_RESOURCES) {
      expect(can("editor", "delete", resource), resource).toBe(false);
    }
  });

  it("may still read and edit sensitive resources it cannot delete", () => {
    for (const resource of [...PATIENT_DATA, "services", "testimonials"] as Resource[]) {
      expect(can("editor", "read", resource), resource).toBe(true);
      expect(can("editor", "update", resource), resource).toBe(true);
    }
  });

  it("may read users but never create, re-role or delete them", () => {
    expect(can("editor", "read", "users")).toBe(true);
    for (const action of ["create", "update", "delete", "publish"] as Action[]) {
      expect(can("editor", action, "users"), action).toBe(false);
    }
  });
});

describe("can — media personnel (contributor)", () => {
  it("may manage the media library but not publish through it", () => {
    for (const action of ["read", "create", "update", "delete"] as Action[]) {
      expect(can("contributor", action, "media"), action).toBe(true);
    }
    expect(can("contributor", "publish", "media")).toBe(false);
  });

  it("may draft and edit editorial content but never publish or delete it", () => {
    for (const resource of ["blog_posts", "authors", "faqs", "awards"] as Resource[]) {
      expect(can("contributor", "read", resource), resource).toBe(true);
      expect(can("contributor", "create", resource), resource).toBe(true);
      expect(can("contributor", "update", resource), resource).toBe(true);
      expect(can("contributor", "publish", resource), resource).toBe(false);
      expect(can("contributor", "delete", resource), resource).toBe(false);
    }
  });

  it("cannot see patient-submitted data at all", () => {
    for (const resource of PATIENT_DATA) {
      for (const action of ACTIONS) {
        expect(can("contributor", action, resource), `${action}:${resource}`).toBe(
          false,
        );
      }
    }
  });

  it("cannot touch clinical content or user accounts", () => {
    for (const resource of ["services", "doctors", "locations", "testimonials", "users"] as Resource[]) {
      for (const action of ACTIONS) {
        expect(can("contributor", action, resource), `${action}:${resource}`).toBe(
          false,
        );
      }
    }
  });
});

describe("can — audit log", () => {
  it("is readable only by a super admin and writable by nobody", () => {
    expect(can("admin", "read", "audit_log")).toBe(true);
    expect(can("editor", "read", "audit_log")).toBe(false);
    expect(can("contributor", "read", "audit_log")).toBe(false);
    for (const role of ROLES) {
      for (const action of ["create", "update", "delete", "publish"] as Action[]) {
        expect(can(role, action, "audit_log"), `${role}:${action}`).toBe(false);
      }
    }
  });
});

describe("can — deny by default", () => {
  it("refuses a role that is not in the enum", () => {
    // Casting past the type is the point: this guards the runtime path a
    // tampered session cookie would take.
    expect(can("root" as Role, "read", "services")).toBe(false);
    expect(can("" as Role, "delete", "bookings")).toBe(false);
  });
});

describe("assertCan", () => {
  it("returns silently when permitted", () => {
    expect(() => assertCan("admin", "delete", "bookings")).not.toThrow();
  });

  it("throws ForbiddenError carrying a 403 when not", () => {
    expect(() => assertCan("contributor", "delete", "bookings")).toThrow(
      ForbiddenError,
    );
    try {
      assertCan("contributor", "delete", "bookings");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).status).toBe(403);
      // The message must not leak which role would have been sufficient.
      expect((error as ForbiddenError).message).not.toMatch(/admin|editor|contributor/);
    }
  });
});

describe("ROLE_LABELS", () => {
  it("labels every role in the enum", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});
