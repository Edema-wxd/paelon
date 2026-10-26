import type { Metadata } from "next";

import { AboutPreview } from "@/components/site/about-preview";
import { FaqSection } from "@/components/site/faq-section";
import { ForPatriciaBlock } from "@/components/site/for-patricia-block";
import { FooterCtaPair } from "@/components/site/footer-cta-pair";
import { HeroSection } from "@/components/site/hero-section";
import { HmoAccessSection } from "@/components/site/hmo-access-section";
import { NewsletterPopup } from "@/components/site/newsletter-popup";
import { NewsletterSignup } from "@/components/site/newsletter-signup";
import { RecentBlogCard } from "@/components/site/recent-blog-card";
import { ServicesGrid } from "@/components/site/services-grid";
import { TestimonialsSection } from "@/components/site/testimonials-section";
import { TrustRibbon } from "@/components/site/trust-ribbon";
import { getFaqs, getPrimaryLocation } from "@/lib/content";
import {
  medicalOrganizationLd,
  OG_IMAGES,
  TWITTER_IMAGES,
} from "@/lib/seo";
import { serializeJsonLd } from "@/lib/json-ld";

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
    title: "Paelon Memorial Hospital | Expertly Human Healthcare",
    description:
      "Family-centered medical care in Lagos, from paediatrics to fertility and general practice.",
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Paelon Memorial Hospital | Expertly Human Healthcare",
    description:
      "Family-centered medical care in Lagos, from paediatrics to fertility and general practice.",
    images: TWITTER_IMAGES,
  },
};

export default async function HomePage() {
  const [location, faqs] = await Promise.all([getPrimaryLocation(), getFaqs("general")]);

  // `MedicalOrganization` per spec §11, shared with /about so the two cannot
  // drift. See `medicalOrganizationLd` for what is deliberately omitted.
  const organizationLd = medicalOrganizationLd(siteUrl, location);

  return (
    <>
      <script
        type="application/ld+json"
        // serializeJsonLd escapes `<` and friends: values here include admin-edited content.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationLd) }}
      />

      {/*
        Ground sequence. Each section owns its background, and no two adjacent
        sections may share one — without that rule the page ran two pairs
        together (services into "For Patricia", HMOs into testimonials) and
        each pair read as a single over-long block with a stray heading in the
        middle of it.

          hero        cream (veil over the photo)
          ribbon      navy
          services    white
          patricia    navy
          about       white
          hmo         cream   · white card
          testimonials white   · secondary cards
          blog        cream   · white card
          newsletter  white   · navy panel
          footer cta  cream
          footer      navy

        Cards invert against their section, so changing a section ground means
        changing the cards inside it too. Check both neighbours before moving
        anything here.
      */}
      <HeroSection />
      <TrustRibbon />
      <ServicesGrid />
      <ForPatriciaBlock />
      <AboutPreview />
      <HmoAccessSection />
      <TestimonialsSection />
      {/* "General" FAQs (CLAUDE.md baseline item 3). Renders nothing when
          none are published. */}
      <FaqSection faqs={faqs} headingId="home-faq-heading" />
      <RecentBlogCard />
      <NewsletterSignup />
      {/* Opens when the visitor scrolls to here — the end of the page. */}
      <NewsletterPopup />
      <FooterCtaPair />
    </>
  );
}
