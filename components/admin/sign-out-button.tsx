"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";

import { logoutAction } from "@/lib/auth/actions";

/**
 * Sign out. A form POST rather than a link, because a GET that mutates session
 * state can be triggered by any page that manages to render an image tag
 * pointing at it.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-primary transition-colors hover:bg-secondary disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-4" />
      {pending ? "Signing out" : "Sign out"}
    </button>
  );
}

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton />
    </form>
  );
}
