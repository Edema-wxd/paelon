"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Error boundary for the FAQs screens. Mirrors `bookings/error.tsx`. */
export default function FaqsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-primary">
        FAQs did not load
      </h1>
      <p className="mt-4 text-base text-foreground/80">
        Nothing has been lost. This is a problem reading the faqs, not a
        problem with the content itself — the live site is unaffected.
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
