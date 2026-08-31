/**
 * 301 redirects from the old WordPress site.
 *
 * TODO(francis): the old URL list is an outstanding item (master spec §18).
 * Nothing is invented here — a guessed redirect is worse than none, because it
 * silently sends real traffic and inbound links to the wrong page and hides the
 * 404s that would otherwise reveal the problem.
 *
 * When the list arrives, add entries below. Rules:
 *  - `source` is the old path, no origin, no trailing slash.
 *  - `destination` is the new path.
 *  - Permanent (301) unless the old URL genuinely still exists elsewhere.
 *  - One entry per old URL; do not chain redirects.
 *
 * These are consumed by `next.config.ts` so they are handled at the edge,
 * before any React work happens.
 */

export interface Redirect {
  source: string;
  destination: string;
  permanent: boolean;
}

export const REDIRECTS: Redirect[] = [
  // TODO(francis): populate from the old WordPress URL export.
];

/** Shape `REDIRECTS` for `next.config.ts`. */
export function redirectsForNextConfig(): Redirect[] {
  return REDIRECTS;
}
