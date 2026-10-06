import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { getSiteSettings } from "@/lib/content";
import { responseTimePromise } from "@/lib/response-time";

/**
 * `noindex` because the page carries no content of its own beyond a per-visit
 * confirmation. `app/robots.ts` disallows the path too — belt and braces, for
 * a crawler that reaches the URL from somewhere other than robots rules.
 */
export const metadata: Metadata = {
  title: "Message sent",
  description:
    "Your message has reached Paelon Memorial Hospital. Here is what happens next.",
  robots: { index: false, follow: false },
};

/**
 * `/contact/thank-you` (master spec §6, conversion baseline item 1).
 *
 * Reached by the contact form's POST → redirect, so a refresh never
 * re-submits the enquiry. An inline toast alone is not a thank-you page —
 * this restates what happens next, repeats the same response-time promise
 * shown beside the form's submit button, and offers one onward link.
 */
export default async function ContactThankYouPage() {
  const { response_time_hours } = await getSiteSettings();
  const promise = responseTimePromise(response_time_hours);

  return (
    <div className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-25 lg:py-16">
      <Breadcrumbs
        trail={[{ label: "Contact us", href: "/contact" }, { label: "Message sent" }]}
      />

      <div className="mx-auto mt-8 max-w-3xl">
        <p className="flex items-center gap-2 text-base font-medium text-accent">
          <CheckCircle2 className="size-5" aria-hidden />
          Message sent
        </p>

        <h1 className="mt-4 text-4xl font-bold uppercase text-primary lg:text-5xl">
          Thank you — we have your message
        </h1>

        <p className="mt-6 text-base">
          We have emailed you a copy of what you sent. {promise}
        </p>

        <h2 className="mt-12 text-2xl text-primary">What happens next</h2>
        <ol className="mt-4 space-y-3 text-base">
          <li>A member of our team reads your message and directs it to the right person.</li>
          <li>
            We reply to the email address you gave us. {promise}
          </li>
          <li>If your enquiry needs a call, we will use the phone number you gave us.</li>
        </ol>

        <p className="mt-12 text-base">
          <Link
            href="/locations"
            className="rounded-md font-medium text-accent underline underline-offset-4"
          >
            Find your branch, with directions and opening hours
          </Link>
        </p>
      </div>
    </div>
  );
}
