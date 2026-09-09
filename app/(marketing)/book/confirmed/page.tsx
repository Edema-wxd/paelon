import { CalendarCheck, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { isBookingReference } from "@/lib/booking/reference";
import { getPrimaryLocation, toTelHref, toWhatsAppHref } from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { RESPONSE_TIME_PROMISE } from "@/lib/response-time";

/**
 * `noindex` because the page is per-submission and carries a booking reference
 * in the query string. `app/robots.ts` blocks the path as well; the two are
 * belt and braces, since a crawler that reaches the URL from elsewhere never
 * reads robots rules for a page it already has.
 */
export const metadata: Metadata = {
  title: "Appointment request received",
  description:
    "Your appointment request has reached Paelon Memorial Hospital. Here is your reference and what happens next.",
  robots: { index: false, follow: false },
};

/** Pre-populated WhatsApp greeting (spec §10). */
const WHATSAPP_GREETING =
  "Hello Paelon Memorial Hospital, I have just requested an appointment.";

/**
 * `/book/confirmed` (master spec §7, conversion baseline item 1).
 *
 * Reached only by the wizard's POST → redirect, so a refresh re-renders this
 * page instead of resubmitting the booking. It restates what happens next, the
 * same response-time promise shown beside the submit button, and the two ways
 * to reach the hospital sooner.
 */
export default async function BookingConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const reference = raw && isBookingReference(raw) ? raw : null;

  const location = await getPrimaryLocation();

  const whatsappHref = toWhatsAppHref(
    location?.whatsapp ?? clientEnv.NEXT_PUBLIC_WHATSAPP_NUMBER,
    WHATSAPP_GREETING,
  );

  return (
    <div className="mx-auto max-w-360 px-4 py-10 sm:px-6 lg:px-25 lg:py-16">
      <Breadcrumbs
        trail={[
          { label: "Book an appointment", href: "/book" },
          { label: "Request received" },
        ]}
      />

      <div className="mx-auto mt-8 max-w-3xl">
        <p className="flex items-center gap-2 text-base font-medium text-accent">
          <CalendarCheck className="size-5" aria-hidden />
          Request received
        </p>

        <h1 className="mt-4 text-4xl font-bold uppercase text-primary lg:text-5xl">
          Thank you — we have your request
        </h1>

        {reference ? (
          <div className="mt-8 rounded-xl border border-border bg-surface p-6">
            <p className="text-sm text-muted-foreground">
              Your booking reference
            </p>
            <p className="mt-1 text-2xl font-medium tracking-wide">
              {reference}
            </p>
            <p className="mt-3 text-base">
              We have emailed this to you. Quote it if you call or message us
              about this appointment.
            </p>
          </div>
        ) : (
          // A missing or malformed reference means someone reached this page
          // directly. The request may still be real, so this says what is known
          // rather than claiming a booking that may not exist.
          <div className="mt-8 rounded-xl border border-border bg-surface p-6">
            <p className="text-base">
              We do not have a booking reference to show on this page. If you
              have just submitted a request, check your email — the reference is
              in your confirmation. If nothing arrives, call us and we will
              check.
            </p>
          </div>
        )}

        <h2 className="mt-12 text-2xl text-primary">What happens next</h2>
        <ol className="mt-4 space-y-3 text-base">
          <li>
            A member of our team reviews your request and checks availability at
            the branch you chose.
          </li>
          <li>
            We call you on the number you gave us to agree a time.{" "}
            {RESPONSE_TIME_PROMISE}
          </li>
          <li>
            Once you confirm, the appointment is booked and we will remind you
            before the day.
          </li>
        </ol>
        <p className="mt-4 text-base text-muted-foreground">
          This is a request, not a confirmed appointment. Nothing is fixed until
          we have spoken to you.
        </p>

        {location ? (
          <>
            <h2 className="mt-12 text-2xl text-primary">
              Need us sooner?
            </h2>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                <a
                  href={toTelHref(location.phone)}
                  className="rounded-md text-base underline-offset-4 hover:underline"
                >
                  Call {location.name} on {location.phone}
                </a>
              </li>
              {whatsappHref ? (
                <li className="flex items-start gap-3">
                  <MessageCircle
                    className="mt-0.5 size-5 shrink-0 text-accent"
                    aria-hidden
                  />
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md text-base underline-offset-4 hover:underline"
                  >
                    Message us on WhatsApp
                  </a>
                </li>
              ) : null}
            </ul>

            {/* TODO(seed): the emergency number is still a Figma placeholder
                (seed/README.md). A wrong emergency number on a hospital site is
                a safety issue, not a snag. */}
            <div className="mt-8 rounded-lg bg-accent p-6 text-accent-foreground">
              <h3 className="text-xl uppercase tracking-[0.08em]">Emergency</h3>
              <p className="mt-2 text-base text-accent-foreground/85">
                Do not wait for our call if something is urgent. Our emergency
                line is answered 24 hours a day.
              </p>
              <a
                href={toTelHref(location.emergency_line)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent-foreground px-6 py-3 text-base font-medium text-accent"
              >
                <Phone className="size-5" aria-hidden />
                Call {location.emergency_line}
              </a>
            </div>
          </>
        ) : null}

        {/* Conversion baseline item 1: one onward link, not a menu. */}
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
