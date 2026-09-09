"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import { createStaffAction, type StaffActionState } from "@/lib/auth/user-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type Role } from "@/lib/auth/policy";

/**
 * Add a staff account.
 *
 * The super admin sets an initial password and passes it on directly. There is
 * no invitation email because no email provider is configured — the site must
 * work with `RESEND_ENABLED=false` (CLAUDE.md), and an invite link that never
 * arrives is a worse experience than being handed a password.
 *
 * The role select carries a description of each role rather than only its name,
 * because "editor" in the database is "admin" to the team and nobody should have
 * to remember that mapping while granting someone access to patient data.
 */

const ROLE_HINTS: Record<Role, string> = {
  admin: "Full access, including deleting patient data and managing staff.",
  editor: "Edit everything and publish. Cannot delete patient data or manage staff.",
  contributor: "Upload media and draft content. Cannot publish or delete.",
};

const ROLE_ORDER: Role[] = ["contributor", "editor", "admin"];

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      <UserPlus aria-hidden />
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

export function StaffCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<StaffActionState, FormData>(
    async (prev, formData) => {
      const result = await createStaffAction(prev, formData);
      if (result.message) formRef.current?.reset();
      return result;
    },
    {},
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-border bg-white p-6"
      noValidate
    >
      <h2 className="text-lg font-medium text-primary">Add a staff account</h2>

      <div aria-live="polite" className="mt-4 empty:mt-0">
        {state.message ? (
          <p className="rounded-md border-l-2 border-accent bg-secondary px-4 py-3 text-sm text-primary">
            {state.message}
          </p>
        ) : null}
        {state.error ? (
          <p
            role="alert"
            className="rounded-md border-l-2 border-destructive bg-secondary px-4 py-3 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="staff-name" className="block text-sm font-medium text-primary">
            Full name
          </label>
          <Input id="staff-name" name="name" required autoComplete="off" />
        </div>

        <div className="space-y-2">
          <label htmlFor="staff-email" className="block text-sm font-medium text-primary">
            Email address
          </label>
          <Input
            id="staff-email"
            name="email"
            type="email"
            required
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="staff-role" className="block text-sm font-medium text-primary">
            Role
          </label>
          <select
            id="staff-role"
            name="role"
            defaultValue="contributor"
            aria-describedby="staff-role-hint"
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-base text-foreground"
          >
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <ul id="staff-role-hint" className="space-y-1 text-xs text-muted-foreground">
            {ROLE_ORDER.map((role) => (
              <li key={role}>
                <strong className="text-primary">{ROLE_LABELS[role]}:</strong>{" "}
                {ROLE_HINTS[role]}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="staff-password"
            className="block text-sm font-medium text-primary"
          >
            Initial password
          </label>
          <Input
            id="staff-password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            aria-describedby="staff-password-hint"
          />
          <p id="staff-password-hint" className="text-xs text-muted-foreground">
            At least 12 characters. Give it to them directly — it is not emailed.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <SubmitButton />
      </div>
    </form>
  );
}
