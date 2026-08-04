import type { Metadata } from "next";

import { AboutPreview } from "@/components/site/about-preview";
import { ForPatriciaBlock } from "@/components/site/for-patricia-block";
import { FooterCtaPair } from "@/components/site/footer-cta-pair";
import { HeroSection } from "@/components/site/hero-section";
import { HmoAccessSection } from "@/components/site/hmo-access-section";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { RecentBlogCard } from "@/components/site/recent-blog-card";
import { ServicesGrid } from "@/components/site/services-grid";
import { TestimonialsSection } from "@/components/site/testimonials-section";
import { TrustRibbon } from "@/components/site/trust-ribbon";
import { getPrimaryLocation } from "@/lib/content";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Expertly Human Healthcare",
  description:
    "Paelon Memorial Hospital provides family healthcare, paediatrics, obstetrics and gynaecology, fertility and general practice care in Lagos.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Paelon Memorial Hospital",
    title: "Paelon Memorial Hospital — Expertly Human Healthcare",
    description:
      "Family-centered medical care in Lagos, from paediatrics to fertility and general practice.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Paelon Memorial Hospital — Expertly Human Healthcare",
    description:
      "Family-centered medical care in Lagos, from paediatrics to fertility and general practice.",
  },
};

export default function HomePage() {
  const location = getPrimaryLocation();

  /**
   * MedicalOrganization JSON-LD (spec §11).
   *
   * TODO(seed): no logo, sameAs profiles, or verified opening hours are
   * available yet, so they are omitted rather than guessed — invalid
   * structured data is worse than absent structured data.
   */
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "MedicalOrganization",
    name: "Paelon Memorial Hospital",
    url: siteUrl,
    description:
      "Family-centered medical care in Lagos, from paediatrics to fertility and general practice.",
    ...(location
      ? {
          telephone: location.phone,
          address: {
            "@type": "PostalAddress",
            streetAddress: location.address_line_1,
            addressLocality: location.city,
            addressRegion: location.state,
            addressCountry: location.country,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from a literal above, so there is no untrusted input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />

      <HeroSection />
      <TrustRibbon />
      <ServicesGrid />
      <ForPatriciaBlock />
      <AboutPreview />
      <HmoAccessSection />
      <TestimonialsSection />
      <RecentBlogCard />
      <NewsletterSignup />
      <FooterCtaPair />
    </>
  );
}
