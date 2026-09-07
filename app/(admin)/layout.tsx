import type { Metadata } from "next";

/**
 * Admin route-group layout.
 *
 * `(admin)` is a route group, so this sits inside `app/layout.tsx` and inherits
 * the skip link and `<body>` — but deliberately none of the marketing chrome.
 * The back office is a different product from the public site and should not
 * wear its header, footer or sticky booking bar.
 *
 * `noindex, nofollow` here covers every admin page at once. `robots.ts` already
 * disallows `/admin`, but a robots rule is a request and a meta tag is a
 * directive, and an admin login form in a search index is not a mistake worth
 * making twice.
 *
 * This layout does not authenticate. `/admin/login` lives under it and must
 * stay reachable signed out; the protected shell is
 * `admin/(dashboard)/layout.tsx`.
 */

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Paelon Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-svh bg-secondary">{children}</div>;
}
