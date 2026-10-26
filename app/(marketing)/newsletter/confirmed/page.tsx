import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/site/breadcrumbs";

/** `noindex`, and `/newsletter/` is disallowed in `app/robots.ts` too. */
export const metadata: Metadata = {
  title: "Subscription confirmed",
  description:
    "You are subscribed to the Paelon Memorial Hospital newsletter. Here is what to expect.",
  robots: { index: false, follow: false },
};

/**
 * `/newsletter/confirmed` (master spec §6, conversion baseline item 1).
 *
 * Reached from `/newsletter/confirm` after the double opt-in press, by
 * POST → redirect. No response-time promise: a newsletter signup asks the
 * hospital for nothing, so there is no reply to time.
 */
export default function NewsletterConfirmedPage() {
  return (
    <div className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-25 lg:py-16">
      <Breadcrumbs trail={[{ label: "Subscription confirmed" }]} />

      <div className="mx-auto mt-8 max-w-3xl">
        <p className="flex items-center gap-2 text-base font-medium text-accent">
          <CheckCircle2 className="size-5" aria-hidden />
          Subscribed
        </p>

        <h1 className="mt-4 text-4xl font-bold uppercase text-primary lg:text-5xl">
          Welcome to the Paelon community
        </h1>

        <p className="mt-6 text-base">
          Your subscription is confirmed. You will receive wellness tips,
          hospital updates and health alerts by email.
        </p>

        <h2 className="mt-12 text-2xl text-primary">What happens next</h2>
        <p className="mt-4 text-base">
          Updates will arrive at the address you confirmed. If you change your
          mind, you can opt out at any time.
          {/* TODO(seed): name the unsubscribe route and the send cadence once
              the newsletter's first issue and its unsubscribe page exist. */}
        </p>

        <p className="mt-12 text-base">
          <Link
            href="/blog"
            className="rounded-md font-medium text-accent underline underline-offset-4"
          >
            Read our latest health articles
          </Link>
        </p>
      </div>
    </div>
  );
}
