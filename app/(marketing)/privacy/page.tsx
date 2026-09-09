import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocumentView } from "@/components/site/legal-document";
import { getLegalDocument } from "@/lib/legal";
import { clientEnv } from "@/lib/env";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";

const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;

const description =
  "How Paelon Memorial Hospital handles personal information collected through this website.";

export async function generateMetadata(): Promise<Metadata> {
  const document = await getLegalDocument("privacy");

  return {
    title: document?.title ?? "Privacy Policy",
    description,
    alternates: { canonical: "/privacy" },
    /*
     * Placeholder text must never reach the index. Spec §11 wants every page
     * indexable, but a privacy policy nobody has reviewed ranking for "paelon
     * privacy" would be read as the hospital's actual commitments. This lifts
     * itself the moment `published` flips — see content/legal/README.md.
     */
    ...(document?.published ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "article",
      url: new URL("/privacy", siteUrl).toString(),
      siteName: "Paelon Memorial Hospital",
      title: "Privacy Policy | Paelon Memorial Hospital",
      description,
      images: OG_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: "Privacy Policy | Paelon Memorial Hospital",
      description,
      images: TWITTER_IMAGES,
    },
  };
}

export default async function PrivacyPage() {
  const document = await getLegalDocument("privacy");

  // Unreachable while content/legal/privacy.json exists — the schema parse at
  // module load would have failed the build first. Kept so the page degrades to
  // a 404 rather than a crash if the file is ever removed.
  if (!document) notFound();

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: document.title,
        item: new URL("/privacy", siteUrl).toString(),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from a literal and validated content, so there is no
        // untrusted input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <LegalDocumentView document={document} />
    </>
  );
}
