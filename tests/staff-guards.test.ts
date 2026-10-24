import { describe, expect, it } from "vitest";

import {
  canChangeRole,
  canDeactivate,
  type StaffChangeContext,
} from "@/lib/auth/staff-guards";

const base: StaffChangeContext = {
  actorId: "actor",
  targetId: "target",
  targetRole: "editor",
  activeSuperAdmins: 2,
};

describe("canChangeRole", () => {
  it("allows an admin to change someone else's role", () => {
    expect(canChangeRole(base, "admin").ok).toBe(true);
    expect(canChangeRole(base, "contributor").ok).toBe(true);
  });

  it("refuses a self role change even with other admins around", () => {
    const result = canChangeRole({ ...base, targetId: "actor" }, "admin");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/your own role/i);
  });

  it("refuses demoting the last admin", () => {
    const result = canChangeRole(
      { ...base, targetRole: "admin", activeSuperAdmins: 1 },
      "editor",
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/only admin/i);
  });

  it("allows demoting an admin when another one remains", () => {
    expect(
      canChangeRole({ ...base, targetRole: "admin", activeSuperAdmins: 2 }, "editor").ok,
    ).toBe(true);
  });

  it("allows a no-op re-save of the last admin's own role by someone else", () => {
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

  it("refuses deactivating the last admin", () => {
    const result = canDeactivate({
      ...base,
      targetRole: "admin",
      activeSuperAdmins: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("allows deactivating an admin when another remains", () => {
    expect(
      canDeactivate({ ...base, targetRole: "admin", activeSuperAdmins: 2 }).ok,
    ).toBe(true);
  });
});
