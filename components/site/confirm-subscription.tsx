"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * The explicit "Confirm" press behind the emailed link.
 *
 * Confirming on page load would let email scanners and link prefetchers
 * subscribe people who never clicked, so the page only carries the token and
 * the person presses the button, which POSTs to `/api/newsletter/confirm`. On
 * success it navigates to `/newsletter/confirmed` — POST → redirect, so a
 * refresh never re-submits.
 */
export function ConfirmSubscription({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/newsletter/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        router.push("/newsletter/confirmed");
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      const message =
        body && typeof body === "object" && "error" in body
          ? (body.error as { message?: string }).message
          : undefined;

      setError(message ?? "We could not confirm your subscription. Please try again.");
    } catch {
      setError("We could not reach the server. Please try again.");
    }

    setPending(false);
  }

  return (
    <div>
      <Button
        type="button"
        variant="accent"
        size="pill"
        onClick={confirm}
        disabled={pending}
        className="w-full sm:w-auto sm:min-w-50"
      >
        {pending ? "Confirming…" : "Confirm my subscription"}
      </Button>
      <div aria-live="polite" className="mt-4 text-sm text-destructive">
        {error ? <p>{error}</p> : null}
      </div>
    </div>
  );
}
