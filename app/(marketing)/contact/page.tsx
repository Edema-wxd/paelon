import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BranchCard } from "@/components/site/branch-card";
import { ContactForm } from "@/components/site/contact-form";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { PendingNote } from "@/components/site/pending-note";
import {
  formatAddress,
  getLocations,
  getPrimaryLocation,
  toDirectionsHref,
  toTelHref,
  toWhatsAppHref,
} from "@/lib/content";
import { clientEnv } from "@/lib/env";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

const description =
  "Send Paelon Memorial Hospital an enquiry, or reach a branch directly by phone, WhatsApp or email.";

export const metadata: Metadata = {
  title: "Contact us",
  description,
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    url: new URL("/contact", siteUrl).toString(),
    siteName: "Paelon Memorial Hospital",
    title: "Contact us | Paelon Memorial Hospital",
    description,
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact us | Paelon Memorial Hospital",
    description,
    images: TWITTER_IMAGES,
  },
};

/*
 * TODO(seed): contact@paelonmemorial.com is transcribed from the Figma export,
 * not from confirmed hospital data — the same provenance as the phone numbers
 * in seed/locations.json. It has no home in the schema (spec §5 `locations` has
 * no email column and there is no site-settings table in Phase 1), so it sits
 * inline here, the way the homepage stats sit inline in `about-preview.tsx`.
 * Confirm the address reaches a monitored inbox before launch.
 */
const CONTACT_EMAIL = "contact@paelonmemorial.com";

/** Pre-populated WhatsApp greeting (spec §10). */
const WHATSAPP_GREETING = "Hello Paelon Memorial Hospital, I have a question.";

export default function ContactPage() {
  const locations = getLocations();
  const primary = getPrimaryLocation();

  // The branch's own number wins; the site-wide number is the fallback so the
  // link still works before per-branch WhatsApp numbers are seeded.
  const whatsappHref = toWhatsAppHref(
    primary?.whatsapp ?? clientEnv.NEXT_PUBLIC_WHATSAPP_NUMBER,
    WHATSAPP_GREETING,
  );

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Contact us",
        item: new URL("/contact", siteUrl).toString(),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from a literal above, so there is no untrusted input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* The export's maroon band, centred copy and all. */}
      <section className="bg-accent text-accent-foreground">
        <div className="mx-auto max-w-360 px-4 py-14 text-center sm:px-6 lg:px-25 lg:py-20">
          <h1 className="text-4xl font-bold uppercase lg:text-6xl">
            Contact us
          </h1>
          {/*
            The export sets lorem ipsum here. CLAUDE.md forbids inventing
            content about Paelon, so this is deliberately operational copy
            only — no claimed response time, no service claims.
          */}
          <p className="mx-auto mt-6 max-w-4xl text-lg text-accent-foreground/85">
            Questions about an appointment, a bill or a branch? Send us a
            message and we will reply by email — or reach us directly using the
            details below.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-360 px-4 py-14 sm:px-6 lg:px-25 lg:py-20">
        {/* 575 / 641 of the export's 1240px content width, rather than an even
            split. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,575fr)_minmax(0,641fr)]">
          <section
            aria-labelledby="contact-form-heading"
            /*
              TODO(design): the export fills this panel with #F6C3CE, a blush
              pink that is not in the spec §4 palette (still an empty
              placeholder block). Rendered in `--secondary` rather than adding
              an unapproved brand colour to the theme. Francis to confirm
              whether the pink joins the palette.
            */
            className="rounded-xl bg-secondary p-6 lg:p-10"
          >
            <h2 id="contact-form-heading" className="text-3xl text-primary">
              Send us a message
            </h2>
            <div className="mt-8">
              <ContactForm
                branches={locations.map(({ slug, name }) => ({ slug, name }))}
              />
            </div>
          </section>

          <section aria-labelledby="get-in-touch-heading" className="lg:p-10">
            <p className="text-xl uppercase tracking-[0.18em] text-accent">
              Contact us
            </p>
            <h2
              id="get-in-touch-heading"
              className="mt-4 text-3xl uppercase text-primary"
            >
              Get in touch
            </h2>
            <p className="mt-6 max-w-2xl text-base">
              Reach the hospital directly, or use the form if you would rather
              write to us.
            </p>

            {primary ? (
              <ul className="mt-8 space-y-5">
                <li className="flex items-start gap-3">
                  <MapPin
                    className="mt-0.5 size-6 shrink-0 text-accent"
                    aria-hidden
                  />
                  <span className="text-base">
                    <span className="sr-only">Address: </span>
                    <address className="not-italic">
                      Paelon Memorial Hospital, {formatAddress(primary)}.
                    </address>
                    <a
                      href={toDirectionsHref(primary)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block rounded-md font-medium text-accent underline underline-offset-4"
                    >
                      Get directions to {primary.name}
                    </a>
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <Mail
                    className="mt-0.5 size-6 shrink-0 text-accent"
                    aria-hidden
                  />
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="rounded-md text-base underline-offset-4 hover:underline"
                  >
                    <span className="sr-only">Email: </span>
                    {CONTACT_EMAIL}
                  </a>
                </li>

                <li className="flex items-start gap-3">
                  <Phone
                    className="mt-0.5 size-6 shrink-0 text-accent"
                    aria-hidden
                  />
                  <a
                    href={toTelHref(primary.phone)}
                    className="rounded-md text-base underline-offset-4 hover:underline"
                  >
                    <span className="sr-only">Phone: </span>
                    {primary.phone}
                  </a>
                </li>

                {/* Spec §6 asks for a WhatsApp deep link here. No number is
                    seeded and NEXT_PUBLIC_WHATSAPP_NUMBER is empty until the
                    WhatsApp Business provider is chosen (spec §18), so the row
                    appears the moment either lands rather than linking
                    somewhere that fails on tap. */}
                {whatsappHref ? (
                  <li className="flex items-start gap-3">
                    <MessageCircle
                      className="mt-0.5 size-6 shrink-0 text-accent"
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
            ) : (
              <div className="mt-8 max-w-xl">
                {/* TODO(seed): no branch is published, so there is nothing to
                    show here. See seed/README.md. */}
                <PendingNote>
                  Our contact details are not published yet. Use the form and we
                  will get back to you.
                </PendingNote>
              </div>
            )}

            {/*
              Spec §6: the emergency line gets its own visually distinct block.
              It is deliberately the loudest thing in this column — someone in
              an emergency must not have to read past a form to find a number.
            */}
            {primary ? (
              <div className="mt-10 rounded-lg bg-accent p-6 text-accent-foreground">
                <h3 className="text-xl uppercase tracking-[0.08em]">
                  Emergency
                </h3>
                <p className="mt-2 text-base text-accent-foreground/85">
                  Our emergency line is answered 24 hours a day. Do not use the
                  form for anything urgent.
                </p>
                {/* TODO(seed): the emergency number is a Figma placeholder —
                    see seed/README.md. A wrong emergency number on a hospital
                    site is a safety issue, not a snag. */}
                <a
                  href={toTelHref(primary.emergency_line)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent-foreground px-6 py-3 text-base font-medium text-accent"
                >
                  <Phone className="size-5" aria-hidden />
                  Call {primary.emergency_line}
                </a>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {/*
        The export puts a full-width photograph here. Swapped for the branch
        directory snapshot spec §6 requires on this template: no contact
        photography has been delivered (seed/README.md), and a labelled
        placeholder in this slot would be a 400px hole where a required section
        belongs.
      */}
      {locations.length > 0 ? (
        <section
          aria-labelledby="contact-branches-heading"
          className="mx-auto max-w-360 px-4 pb-14 sm:px-6 lg:px-25 lg:pb-20"
        >
          <h2 id="contact-branches-heading" className="text-3xl text-primary">
            Reach a branch directly
          </h2>
          <ul className="mt-8 grid gap-8 lg:grid-cols-2">
            {locations.map((location) => (
              <li
                key={location.id}
                className={locations.length === 1 ? "lg:col-span-2" : ""}
              >
                <BranchCard location={location} />
              </li>
            ))}
          </ul>
          <p className="mt-10 text-base text-muted-foreground">
            Every branch, with directions and opening hours, is on the{" "}
            <Link
              href="/locations"
              className="rounded-md font-medium text-accent underline underline-offset-4"
            >
              branches page
            </Link>
            .
          </p>
        </section>
      ) : null}

      <NewsletterSignup />
    </>
  );
}
