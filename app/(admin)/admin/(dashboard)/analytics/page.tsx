import type { Metadata } from "next";

import { NotPermitted } from "@/components/admin/not-permitted";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { umamiConfig } from "@/lib/analytics/umami-config";
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
 * `frame-src` is widened to the share origin on this path only, in
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

/** One line of the setup checklist: a variable and whether it is set. Never its value. */
function SetupRow({ name, set, purpose }: { name: string; set: boolean; purpose: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <code className="text-xs">{name}</code>
      <span className={set ? "text-xs text-emerald-700" : "text-xs text-amber-800"}>
        {set ? "· set" : "· not set"}
      </span>
      <span className="w-full text-xs text-muted-foreground">{purpose}</span>
    </li>
  );
}

export default async function AdminAnalyticsPage() {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "analytics")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const shareUrl = clientEnv.NEXT_PUBLIC_UMAMI_SHARE_URL;
  // The same answer the tracker in the root layout acts on.
  const tracking = umamiConfig() !== null;

  /*
   * Three states, said plainly. The old note named one variable and told an
   * admin to "set it in the environment" — an instruction for a developer,
   * shown to hospital staff — and said nothing about whether visits were being
   * recorded at all, which is the bigger fact when the tracker is off.
   */
  const status = !tracking
    ? {
        tone: "warn" as const,
        title: "Visits to the website are not being recorded yet.",
        body: "Analytics has not been switched on for this deployment, so there are no figures to show. Ask the developer to finish the Umami setup below.",
      }
    : !shareUrl
      ? {
          tone: "warn" as const,
          title: "Visits are being recorded, but the dashboard is not linked here yet.",
          body: "Ask the developer to add the dashboard’s share link, listed below.",
        }
      : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary">Analytics</h1>
      <p className="mt-2 max-w-2xl text-base text-foreground/80">
        Visits and enquiry figures from Umami, the website&rsquo;s analytics.
        Umami sets no cookies and records no personal data, which is why the
        site needs no cookie banner.
      </p>

      {status ? (
        <div
          role="status"
          className="mt-8 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-5 py-4"
        >
          <p className="text-base font-medium text-amber-900">{status.title}</p>
          <p className="mt-1 text-sm text-amber-900/80">{status.body}</p>
        </div>
      ) : null}

      {shareUrl ? (
        <>
          {!tracking ? (
            <p className="mt-4 max-w-2xl text-sm text-foreground/70">
              The dashboard below is linked, but this deployment is not sending
              it visits, so its figures will not grow.
            </p>
          ) : null}
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
      ) : null}

      {status ? (
        <details className="mt-6 max-w-2xl rounded-lg border border-border bg-surface px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Setup details for the developer
          </summary>
          <ul className="mt-3 space-y-3">
            <SetupRow
              name="NEXT_PUBLIC_UMAMI_SCRIPT_URL"
              set={Boolean(clientEnv.NEXT_PUBLIC_UMAMI_SCRIPT_URL)}
              purpose="The Umami tracker script. With the website id, this is what records visits."
            />
            <SetupRow
              name="NEXT_PUBLIC_UMAMI_WEBSITE_ID"
              set={Boolean(clientEnv.NEXT_PUBLIC_UMAMI_WEBSITE_ID)}
              purpose="This website’s id in Umami."
            />
            <SetupRow
              name="NEXT_PUBLIC_UMAMI_SHARE_URL"
              set={Boolean(shareUrl)}
              purpose="Umami → Websites → Edit → Share URL. Shown on this page."
            />
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Set per environment, then redeploy: these are read when the site is
            built. Nothing is recorded when <code>NEXT_PUBLIC_SITE_URL</code> is
            localhost, and only visits on its host are counted, so previews stay
            out of the figures.
          </p>
        </details>
      ) : null}
    </div>
  );
}
