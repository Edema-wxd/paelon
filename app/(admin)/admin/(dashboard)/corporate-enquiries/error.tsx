"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the corporate enquiries queue. Mirrors
 * `bookings/error.tsx` and `contact/error.tsx`.
 */
export default function CorporateEnquiriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-primary">
        The corporate enquiries queue did not load
      </h1>
      <p className="mt-4 text-base text-foreground/80">
        Nothing has been lost — this is a problem reading the queue, not a
        problem with the enquiries themselves. Enquiries are still arriving
        and are still stored.
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
