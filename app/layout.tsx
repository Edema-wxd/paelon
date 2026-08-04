import type { Metadata } from "next";

import "@/styles/globals.css";

// TODO(brand): swap to next/font/local with the Neo Tech .woff2 files (weights
// 400/500/600/700, display: 'swap') once they are delivered. Until then the
// fallback stack from the spec applies via --font-sans in globals.css.

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Paelon Memorial Hospital",
    template: "%s · Paelon Memorial Hospital",
  },
  description:
    "Paelon Memorial Hospital — family healthcare, women and children's health, and specialist care in Lagos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-black focus:outline focus:outline-2 focus:outline-offset-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
