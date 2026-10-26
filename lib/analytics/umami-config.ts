import { clientEnv } from "@/lib/env";

/**
 * Whether this build records visits, and what the tracker needs to do it.
 *
 * One answer for the two places that ask: the tracker in the root layout
 * (`components/site/umami-script.tsx`) and the status on `/admin/analytics`.
 * Two copies of the rule drift, and then the admin page says visits are being
 * recorded on a build that ships no tracker.
 */
export interface UmamiConfig {
  src: string;
  websiteId: string;
  /** Passed as `data-domains`: the only hostname whose visits are sent. */
  host: string;
}

/**
 * The tracker's settings, or null when this build tracks nothing.
 *
 * Null unless both variables are set and `NEXT_PUBLIC_SITE_URL` is a public
 * host. `data-domains` keeps Vercel previews — each on a hostname of its own,
 * all carrying the same website id — out of the real figures; a local site URL
 * gets no tracker at all, since `data-domains=localhost` would admit exactly
 * the dev-server reloads it exists to keep out.
 */
export function umamiConfig(): UmamiConfig | null {
  const src = clientEnv.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
  const websiteId = clientEnv.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return null;

  let host: string;
  try {
    host = new URL(clientEnv.NEXT_PUBLIC_SITE_URL).hostname;
  } catch {
    return null;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return null;

  return { src, websiteId, host };
}
