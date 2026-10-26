import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { ConfirmSubscription } from "@/components/site/confirm-subscription";
import { newsletterTokenSchema } from "@/lib/validation/newsletter";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  description:
    "Confirm that you would like to receive the Paelon Memorial Hospital newsletter.",
  robots: { index: false, follow: false },
};

/**
 * `/newsletter/confirm?token=…` — the target of the link in the double opt-in
 * email. Carries the token and asks for one explicit press; it never confirms
 * on load (see `ConfirmSubscription`). A missing or malformed token is refused
 * here, before it reaches the API.
 */
export default async function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const parsed = newsletterTokenSchema.safeParse({
    token: Array.isArray(token) ? token[0] : token,
  });

  return (
    <div className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-25 lg:py-16">
      <Breadcrumbs trail={[{ label: "Confirm your subscription" }]} />

      <div className="mx-auto mt-8 max-w-3xl">
        {parsed.success ? (
          <>
            <h1 className="text-4xl font-bold uppercase text-primary lg:text-5xl">
              One last step
            </h1>
            <p className="mt-6 text-base">
              Press the button to confirm that you would like to receive the
              Paelon Memorial Hospital newsletter.
            </p>
            <div className="mt-8">
              <ConfirmSubscription token={parsed.data.token} />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-bold uppercase text-primary lg:text-5xl">
              This link is not valid
            </h1>
            <p className="mt-6 text-base">
              The confirmation link is incomplete. Open the link from your
              email again, or{" "}
              <Link
                href="/#newsletter-heading"
                className="rounded-md font-medium text-accent underline underline-offset-4"
              >
                sign up again
              </Link>{" "}
              to get a fresh one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
