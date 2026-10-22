import { z } from "zod";

/**
 * The staff password rule (spec §8 Access, decision A4).
 *
 * Length only, deliberately. Composition rules ("one capital, one symbol") push
 * people towards `Password1!` and are no longer recommended by NIST SP 800-63B
 * or the NCSC; the real protection is argon2id, the per-IP login limit and the
 * account lockout. The check against the email catches the one predictable
 * choice a length rule misses.
 *
 * Takes the email alongside the password because the rule depends on it. The
 * create form has the email in the same submission; a password reset passes the
 * target account's stored email. Used on both client and server, so it must
 * stay free of server imports.
 */

export const PASSWORD_MIN_LENGTH = 12;

/** Upper bound so a megabyte of input is refused rather than hashed. */
export const PASSWORD_MAX_LENGTH = 1024;

/** Local parts shorter than this are too common to be a meaningful match. */
const MIN_LOCAL_PART_MATCH = 3;

export const staffPassword = z
  .object({
    email: z.string().trim(),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, "Password is too long."),
  })
  .superRefine(({ email, password }, ctx) => {
    const localPart = email.split("@")[0]?.toLowerCase() ?? "";
    if (
      localPart.length >= MIN_LOCAL_PART_MATCH &&
      password.toLowerCase().includes(localPart)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password must not contain the email address.",
      });
    }
  });

export type StaffPasswordInput = z.input<typeof staffPassword>;
