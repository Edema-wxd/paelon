import Link from "next/link";

import { getLocations, getPrimaryLocation, toTelHref } from "@/lib/content";

/**
 * Global footer.
 *
 * Spec §14 requires the NDPR Data Protection Officer contact here, plus links
 * to the privacy policy and terms on every page.
 */

const QUICK_LINKS = [
  { label: "Clinical Accreditation", href: "/about" },
  { label: "Patient Portal", href: "/contact" },
  { label: "Medical Records", href: "/contact" },
  { label: "Careers", href: "/contact" },
] as const;

const PATIENT_SUPPORT_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Contact Information", href: "/contact" },
  { label: "Find a Doctor", href: "/services" },
] as const;

export function Footer() {
  const location = getPrimaryLocation();
  const locations = getLocations();

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-360 px-4 py-16 sm:px-6 lg:px-25">
        <div className="grid gap-12 lg:grid-cols-4">
          <div>
            <p className="text-2xl">Paelon Memorial</p>
            <p className="mt-6 max-w-75 text-base text-primary-foreground/85">
              Dedicated to providing expert medical care with a human touch.
              Your health and comfort are our primary concerns.
            </p>
          </div>

          <nav aria-labelledby="footer-quick-links">
            <h2 id="footer-quick-links" className="text-xl">
              Quick Links
            </h2>
            {/*
              TODO(design): the export lists Patient Portal, Medical Records and
              Careers here, but spec §17 puts a patient portal, EMR integration
              and a careers page explicitly out of scope for v1. These point at
              /contact rather than to pages that will not exist. Francis to
              confirm whether they are dropped from the footer for launch.
            */}
            <ul className="mt-6 space-y-3">
              {QUICK_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="rounded-md text-base text-primary-foreground/85 underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-patient-support">
            <h2 id="footer-patient-support" className="text-xl">
              Patient Support
            </h2>
            <ul className="mt-6 space-y-3">
              {PATIENT_SUPPORT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="rounded-md text-base text-primary-foreground/85 underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-xl">Emergency Contact</h2>
            {location ? (
              <div className="mt-6 rounded-md bg-accent p-5 text-accent-foreground">
                <p className="text-base">24/7 Hotline</p>
                {/*
                  TODO(seed): +234 1234 5678 comes from the Figma export and
                  reads as a placeholder. A wrong emergency number on a hospital
                  site is a safety issue — confirm before launch.
                */}
                <a
                  href={toTelHref(location.emergency_line)}
                  className="mt-3 block rounded-md text-base underline-offset-4 hover:underline"
                >
                  {location.emergency_line}
                </a>
                <address className="mt-3 text-base not-italic">
                  {location.address_line_1}, {location.city}, {location.state}.
                </address>
              </div>
            ) : null}
          </div>
        </div>

        {locations.length > 0 ? (
          <nav aria-labelledby="footer-branches" className="mt-16">
            <h2 id="footer-branches" className="text-xl">
              Our Branches
            </h2>
            {/* TODO(seed): only Victoria Island is seeded; .env.example implies
                four branches. See seed/README.md. */}
            <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              {locations.map((branch) => (
                <li key={branch.id}>
                  <Link
                    href={`/locations/${branch.slug}`}
                    className="rounded-md text-base text-primary-foreground/85 underline-offset-4 hover:underline"
                  >
                    {branch.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="mt-16 border-t border-primary-foreground/20 pt-8">
          {/*
            TODO(seed): NDPR requires a named Data Protection Officer contact
            in the footer (spec §14, open question in §18). No contact has been
            supplied, so the requirement is stated rather than faked with an
            address that does not resolve.
          */}
          <p className="text-sm text-primary-foreground/85">
            Data Protection Officer contact pending — required before launch
            under the NDPR.
          </p>
          <p className="mt-3 text-sm text-primary-foreground/85">
            © {new Date().getFullYear()} Paelon Memorial Hospital. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
