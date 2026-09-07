import { cn } from "@/lib/utils";

interface RouteLoaderProps {
  /**
   * What is being fetched. Read out by assistive tech and shown on screen, so
   * it should name the destination ("Loading branches"), not the mechanism.
   */
  label?: string;
  /** Supporting line under the label. Pass `null` to drop it. */
  description?: React.ReactNode;
  className?: string;
}

/**
 * The site's navigation loader — what fills `<main>` while a route's server
 * component is still resolving.
 *
 * Every marketing page is a server component reading `/seed/*.json`, so a
 * navigation is a round trip with nothing on screen until it lands. On a slow
 * Lagos mobile connection that reads as a dead tap. This gives the click an
 * immediate acknowledgement without pulling any JavaScript to the client: it is
 * a server component, and the motion is two Tailwind built-ins
 * (`animate-spin`, `animate-pulse`) — no new keyframes, no config change, no
 * client bundle cost on a boundary whose whole job is to appear before the
 * bundle does.
 *
 * The eyebrow styling matches `error.tsx` and `not-found-content.tsx` on
 * purpose, so the three interstitial states read as one family.
 *
 * `min-h` holds the viewport below the sticky header, so the footer does not
 * ride up and slam back down when the real page arrives — the loader must not
 * be the thing that spends the 0.05 CLS budget (spec §13).
 *
 * Accessibility: `role="status"` with `aria-live="polite"` announces the label
 * once, without interrupting whatever the user is already hearing. The ring is
 * `aria-hidden` — it carries no information the label does not. Under
 * `prefers-reduced-motion` the global rule in `styles/globals.css` freezes both
 * animations after one iteration; the ring settles into a static maroon-on-sand
 * arc and the text carries the meaning on its own, which is why the state is
 * never signalled by motion alone.
 */
export function RouteLoader({
  label = "Loading",
  description = "One moment while we bring up the page.",
  className,
}: RouteLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[calc(100svh-5rem)] flex-col items-center justify-center gap-6 px-4 py-24 text-center lg:min-h-[calc(100svh-6.5rem)]",
        className,
      )}
    >
      {/* Decorative. The ring is the brand's two neutrals with a maroon head,
          which is the same colour logic as the accent rules elsewhere. */}
      <span
        aria-hidden
        className="size-12 animate-spin rounded-full border-4 border-secondary border-t-accent"
      />

      <p className="text-sm font-medium tracking-[0.2em] text-primary uppercase">
        {label}
      </p>

      {description ? (
        <p className="max-w-sm text-base text-muted-foreground">{description}</p>
      ) : null}

      {/* Two rails standing in for the page's headline and body block. Enough
          to suggest the shape that is coming without pretending to be a
          skeleton of any particular template. */}
      <div aria-hidden className="mt-2 w-full max-w-sm space-y-3">
        <div className="mx-auto h-2 w-2/3 animate-pulse rounded-full bg-secondary" />
        <div className="mx-auto h-2 w-1/3 animate-pulse rounded-full bg-secondary" />
      </div>
    </div>
  );
}
