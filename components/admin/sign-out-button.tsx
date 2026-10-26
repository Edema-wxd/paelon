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
    // Icon-only to share the sidebar footer with the account name; the label
    // stays in the accessible name and the native tooltip.
    <button
      type="submit"
      disabled={pending}
      title="Sign out"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface hover:text-accent active:scale-[0.94] disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-4" />
      <span className="sr-only">{pending ? "Signing out" : "Sign out"}</span>
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
