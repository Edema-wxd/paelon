import { describe, expect, it } from "vitest";

import { staffPassword } from "@/lib/validation/password";

const EMAIL = "kemi@paelon.test";

function check(password: string, email = EMAIL) {
  return staffPassword.safeParse({ email, password });
}

function firstMessage(password: string, email = EMAIL): string | undefined {
  const result = check(password, email);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("staffPassword — accepts", () => {
  it("a long passphrase", () => {
    expect(check("correct horse battery staple").success).toBe(true);
  });

  it("exactly 12 characters", () => {
    expect(check("twelvechars!").success).toBe(true);
  });

  it("exactly 1024 characters", () => {
    expect(check("x".repeat(1024)).success).toBe(true);
  });

  it("lowercase letters only — no composition rules", () => {
    expect(check("onlylowercaseletters").success).toBe(true);
  });

  it("a local part too short to be a meaningful match", () => {
    expect(check("ab-long-enough-password", "ab@paelon.test").success).toBe(true);
  });

  it("the domain appearing in the password", () => {
    expect(check("paelon-staff-passphrase").success).toBe(true);
  });
});

describe("staffPassword — rejects", () => {
  it("an empty password", () => {
    expect(check("").success).toBe(false);
  });

  it("11 characters", () => {
    expect(firstMessage("elevenchars")).toMatch(/at least 12 characters/i);
  });

  it("1025 characters, rather than hashing it", () => {
    expect(firstMessage("x".repeat(1025))).toMatch(/too long/i);
  });

  it("a password containing the email local part", () => {
    expect(firstMessage("kemi-is-my-password")).toMatch(/email address/i);
  });

  it("the local part in a different case", () => {
    expect(firstMessage("my-name-is-KEMI-ok")).toMatch(/email address/i);
  });

  it("reports the local-part issue against the password field", () => {
    const result = check("kemi-is-my-password");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["password"]);
  });

  it("a non-string password", () => {
    expect(staffPassword.safeParse({ email: EMAIL, password: 123456789012 }).success).toBe(
      false,
    );
  });
});
