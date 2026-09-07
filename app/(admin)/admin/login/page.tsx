import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/login-form";
import { getAdminUser } from "@/lib/auth/session";

/**
 * Admin sign-in.
 *
 * Deliberately outside the protected shell in `(dashboard)/layout.tsx` — a
 * login page behind an auth check is a redirect loop.
 *
 * Carries no branding beyond the wordmark and says nothing about which hospital
 * systems sit behind it. There is no "forgot password" link because there is no
 * reset flow yet; a super admin resets a password with `npm run admin:passwd`.
 */

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in: go where they were headed rather than showing a form
  // that would only bounce them.
  const user = await getAdminUser();
  const { next } = await searchParams;

  if (user) {
    redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
  }

  return (
    <main id="main" className="flex min-h-svh items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-primary">Paelon Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to manage site content and media.
        </p>

        <div className="mt-8">
          <LoginForm next={next} />
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Staff access only. Every sign-in is recorded.
        </p>
      </div>
    </main>
  );
}
