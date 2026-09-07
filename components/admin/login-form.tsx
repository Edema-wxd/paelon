"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin sign-in form.
 *
 * A client component only because it needs `useActionState` for the pending and
 * error states; the credential check itself never leaves the server.
 *
 * The error message is the same whatever went wrong — unknown email, wrong
 * password, locked account — so the form cannot be used to discover which
 * addresses are real staff accounts.
 */

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="pill" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 aria-hidden className="animate-spin" />
          Signing in
        </>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {/*
        `aria-live` so the error is announced when it replaces the previous
        render, and `role="alert"` so it interrupts — a failed login is worth
        interrupting for. Rendered as a region that exists only when there is
        something to say, which is why the wrapper is conditional rather than
        permanently present and empty.
      */}
      {state.error ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-md border-l-2 border-destructive bg-white px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-primary">
          Email address
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="bg-white"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-primary"
        >
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="bg-white"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
