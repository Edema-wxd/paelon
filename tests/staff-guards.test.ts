import { describe, expect, it } from "vitest";

import {
  canChangeRole,
  canDeactivate,
  validatePassword,
  type StaffChangeContext,
} from "@/lib/auth/staff-guards";

const base: StaffChangeContext = {
  actorId: "actor",
  targetId: "target",
  targetRole: "editor",
  activeSuperAdmins: 2,
};

describe("canChangeRole", () => {
  it("allows a super admin to change someone else's role", () => {
    expect(canChangeRole(base, "admin").ok).toBe(true);
    expect(canChangeRole(base, "contributor").ok).toBe(true);
  });

  it("refuses a self role change even with other super admins around", () => {
    const result = canChangeRole({ ...base, targetId: "actor" }, "admin");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/your own role/i);
  });

  it("refuses demoting the last super admin", () => {
    const result = canChangeRole(
      { ...base, targetRole: "admin", activeSuperAdmins: 1 },
      "editor",
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/only super admin/i);
  });

  it("allows demoting a super admin when another one remains", () => {
    expect(
      canChangeRole({ ...base, targetRole: "admin", activeSuperAdmins: 2 }, "editor").ok,
    ).toBe(true);
  });

  it("allows a no-op re-save of the last super admin's own role by someone else", () => {
    expect(
      canChangeRole({ ...base, targetRole: "admin", activeSuperAdmins: 1 }, "admin").ok,
    ).toBe(true);
  });
});

describe("canDeactivate", () => {
  it("allows deactivating another account", () => {
    expect(canDeactivate(base).ok).toBe(true);
  });

  it("refuses self-deactivation", () => {
    const result = canDeactivate({ ...base, targetId: "actor" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/your own account/i);
  });

  it("refuses deactivating the last super admin", () => {
    const result = canDeactivate({
      ...base,
      targetRole: "admin",
      activeSuperAdmins: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("allows deactivating a super admin when another remains", () => {
    expect(
      canDeactivate({ ...base, targetRole: "admin", activeSuperAdmins: 2 }).ok,
    ).toBe(true);
  });
});

describe("validatePassword", () => {
  it("accepts a long passphrase", () => {
    expect(validatePassword("correct horse battery staple", "kemi@paelon.test").ok).toBe(
      true,
    );
  });

  it("rejects anything under 12 characters", () => {
    expect(validatePassword("short", "kemi@paelon.test").ok).toBe(false);
    expect(validatePassword("elevenchars", "kemi@paelon.test").ok).toBe(false);
    expect(validatePassword("twelvechars!", "kemi@paelon.test").ok).toBe(true);
  });

  it("rejects a password containing the email local part", () => {
    const result = validatePassword("kemi-is-my-password", "kemi@paelon.test");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/email address/i);
  });

  it("ignores a local part too short to be meaningful", () => {
    expect(validatePassword("ab-long-enough-password", "ab@paelon.test").ok).toBe(true);
  });

  it("rejects an absurdly long password rather than hashing it", () => {
    expect(validatePassword("x".repeat(2000), "kemi@paelon.test").ok).toBe(false);
  });
});
