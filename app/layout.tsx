import type { Metadata } from "next";
import localFont from "next/font/local";

import { UmamiScript } from "@/components/site/umami-script";
import { OG_IMAGES, TWITTER_IMAGES } from "@/lib/seo";
import "@/styles/globals.css";

/**
 * Neo Tech, the brand face (spec §4), self-hosted from `/public/fonts/`.
 *
 * Only the faces the site sets: 400, 500 and 700 upright, and 400 italic for
 * `<em>`, blockquotes and the legal pages' notes. Neo Tech has no 600, so
 * `font-semibold` resolves to the 700 file by the CSS matching rules rather
 * than a synthesised bold. Bold italic is never rendered (the Markdown editor
 * cannot combine them), so it is not shipped.
 *
 * Exposed as `--font-neo-tech` on `<html>`, which `--font-sans` in
 * `styles/globals.css` puts first. The size-adjusted Arial fallback next/font
 * generates keeps the swap from shifting layout (CLS budget, §13).
 *
 * Not preloaded. A preload is per `localFont` call, so it would cover all four
 * files at high priority, and on the homepage they queued ahead of the hero
 * image that is the LCP element: Lighthouse mobile medians on production
 * (2026-11-03) were LCP 2.75s preloaded against 2.03s without the fonts, over
 * the 2.0s budget. Unpreloaded, the files are fetched as soon as the CSS that
 * declares them is parsed, and the fallback holds the layout until they swap.
 */
const neoTech = localFont({
  src: [
    { path: "../public/fonts/neo-tech-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/neo-tech-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/neo-tech-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/neo-tech-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-neo-tech",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Paelon Memorial Hospital",
    template: "%s · Paelon Memorial Hospital",
  },
  description:
    "Paelon Memorial Hospital: family healthcare, women and children's health, and specialist care in Lagos.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Paelon Memorial Hospital",
    title: "Paelon Memorial Hospital",
    description:
      "Paelon Memorial Hospital: family healthcare, women and children's health, and specialist care in Lagos.",
    images: OG_IMAGES,
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: "Paelon Memorial Hospital",
    description:
      "Paelon Memorial Hospital: family healthcare, women and children's health, and specialist care in Lagos.",
    images: TWITTER_IMAGES,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={neoTech.variable}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-black focus:outline focus:outline-2 focus:outline-offset-2"
        >
          Skip to content
        </a>
        {children}
        {/* Analytics (spec §9). Last in the body and afterInteractive, so it
            cannot delay first paint. */}
        <UmamiScript />
      </body>
    </html>
  );
}
