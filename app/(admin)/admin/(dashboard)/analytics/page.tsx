import type { Metadata } from "next";

import { NotPermitted } from "@/components/admin/not-permitted";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env";

/**
 * The analytics dashboard (spec §9 Dashboard integration, §8 `/admin/analytics`).
 *
 * An iframe of a self-hosted Umami share URL, and nothing else. There is no
 * query, no aggregation and no chart here on purpose: re-plotting Umami's
 * numbers in the panel means a second implementation of every metric, and the
 * one it would be compared against is one click away.
 *
 * Admin only — `can()` refuses `analytics` to every other role. A share URL is
 * a bearer link, so the page is also the access control: anyone who can read
 * this page can copy the link out of it and keep it. §9 accepts that, because
 * the stats hold no PII.
 *
 * `frame-src` is widened to the share origin for `/admin` paths only, in
 * `middleware.ts`. The remaining precondition is Umami's side of the handshake
 * — a share page that sends `X-Frame-Options: DENY` or its own restrictive
 * `frame-ancestors` renders blank here no matter what our policy says. Umami's
 * share pages are framable by default; the note below tells whoever sees an
 * empty frame where to look rather than leaving them to guess.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminAnalyticsPage() {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "analytics")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const shareUrl = clientEnv.NEXT_PUBLIC_UMAMI_SHARE_URL;

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary">Analytics</h1>
      <p className="mt-2 max-w-2xl text-base text-foreground/80">
        Traffic and event figures from Umami, the site&rsquo;s self-hosted
        analytics. No cookies are set and no personal data is collected.
      </p>

      {shareUrl ? (
        <>
          <div className="mt-8 overflow-hidden rounded-lg border border-border bg-surface">
            <iframe
              src={shareUrl}
              title="Umami analytics dashboard"
              // Tall enough that Umami's own header, date picker and first
              // chart row are visible without the frame scrolling internally
              // on a laptop.
              className="h-[1400px] w-full border-0"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>

          <p className="mt-4 text-sm text-foreground/70">
            If the panel above is blank, the Umami instance is refusing to be
            framed or the share link has been revoked.{" "}
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              Open the dashboard in a new tab
            </a>
            .
          </p>
        </>
      ) : (
        <p className="mt-8 max-w-2xl rounded-lg border border-border bg-surface px-5 py-4 text-base">
          Analytics is not configured for this environment.{" "}
          <code className="text-sm">NEXT_PUBLIC_UMAMI_SHARE_URL</code> is unset,
          so there is no dashboard to show. Generate a share URL in Umami under
          Websites &rarr; Edit &rarr; Share URL and set it in the environment.
        </p>
      )}
    </div>
  );
}
