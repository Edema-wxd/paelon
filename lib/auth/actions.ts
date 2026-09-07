"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/lib/auth/config";

/**
 * Server actions for the login form.
 *
 * Kept out of `config.ts` because that module is imported by server components
 * that must not carry a `"use server"` boundary, and out of the form component
 * because a server action is a public POST endpoint — it validates its own input
 * rather than trusting the client that rendered it.
 */

export interface LoginState {
  /** Shown above the form. Always generic; the specifics go to the audit log. */
  error?: string;
}

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/**
 * Only same-origin absolute paths are accepted as a post-login destination.
 *
 * `//evil.example` is a protocol-relative URL that browsers treat as absolute,
 * so a leading-slash check alone is not enough — this is the open-redirect that
 * turns an admin login into a credible phishing page on your own domain.
 */
function safeRedirect(next: string | undefined): string {
  if (!next) return "/admin";
  if (!next.startsWith("/") || next.startsWith("//")) return "/admin";
  return next;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeRedirect(parsed.data.next),
    });
  } catch (error) {
    // A successful signIn throws a redirect, which must reach Next untouched.
    if (error instanceof AuthError) {
      return {
        error:
          "Those details did not match an active account. After five failed attempts an account is locked for 15 minutes.",
      };
    }
    throw error;
  }

  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/admin/login" });
}
