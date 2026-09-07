import { toTelHref } from "@/lib/phone";

/**
 * The emergency line, resolved without touching the database.
 *
 * Every other surface on the site reads `locations.emergency_line` through
 * `lib/content.ts`. The error boundaries cannot: `app/error.tsx` and
 * `app/global-error.tsx` are client components, and a fallback that needs a
 * query to render is useless in exactly the case where the query is why the
 * page failed.
 *
 * So the number is inlined at build time from `NEXT_PUBLIC_EMERGENCY_LINE`.
 * `process.env` is read directly here rather than through `lib/env.ts` for the
 * same reason the boundaries avoid the database — `clientEnv` parses at import
 * time, and a throw inside the fallback turns a recoverable page error into a
 * blank screen. The var is still declared in `clientSchema` so a bad value is
 * caught at boot rather than discovered on an error page. Next inlines the
 * literal member access below, so nothing is read at runtime.
 *
 * Keep this equal to the primary branch's `emergency_line` in
 * `seed/locations.json`.
 */

/**
 * TODO(seed): +234 1234 5678 is the Figma placeholder carried by the footer,
 * the 404 and `seed/locations.json`. A wrong emergency number on a hospital
 * site is a safety issue, not a snag — confirm with Francis, then set
 * `NEXT_PUBLIC_EMERGENCY_LINE` and update the seed row.
 *
 * It is a constant rather than a `null` fallback deliberately: an error page
 * with no number on it is worse than one showing the same placeholder the rest
 * of the site already shows.
 */
const FALLBACK_EMERGENCY_LINE = "+234 1234 5678";

const configured = process.env.NEXT_PUBLIC_EMERGENCY_LINE?.trim();

/** Display form, spaced as it is written everywhere else on the site. */
export const EMERGENCY_LINE: string = configured || FALLBACK_EMERGENCY_LINE;

/** `tel:` href for the same number. */
export const EMERGENCY_TEL_HREF: string = toTelHref(EMERGENCY_LINE);

/** True when the number came from configuration rather than the placeholder. */
export const EMERGENCY_LINE_IS_CONFIRMED: boolean = Boolean(configured);
