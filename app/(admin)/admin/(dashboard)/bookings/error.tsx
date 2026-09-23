"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the bookings queue.
 *
 * Scoped to this route rather than falling through to the site's `error.tsx`,
 * which is branded for patients and offers a phone number for urgent care —
 * the wrong answer for a member of staff whose filter query just failed.
 *
 * The error message is never rendered. A failure in this subtree comes from the
 * query layer, so `error.message` can carry SQL, a fragment of a connection
 * string, or a patient identifier out of a `WHERE` clause. `digest` is safe: it
 * is a hash Next puts in the server log beside the real stack.
 *
 * Nothing is logged from here. This is a client boundary, and the server has
 * already logged the cause.
 */
export default function BookingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-primary">
        The bookings queue did not load
      </h1>
      <p className="mt-4 text-base text-foreground/80">
        Nothing has been lost — this is a problem reading the queue, not a
        problem with the bookings themselves. Patient requests are still
        arriving and are still stored.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/admin"
          className="text-sm text-accent underline underline-offset-4 hover:no-underline"
        >
          Back to the overview
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-8 text-sm text-muted-foreground">
          If it keeps happening, quote reference{" "}
          <code className="font-mono text-primary">{error.digest}</code>.
        </p>
      ) : null}
    </div>
  );
}
