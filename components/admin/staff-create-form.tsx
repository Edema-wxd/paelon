"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import { createStaffAction, type StaffState } from "@/lib/auth/user-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type Role } from "@/lib/auth/policy";
import { PASSWORD_MIN_LENGTH, staffPassword } from "@/lib/validation/password";

/**
 * Add a staff account.
 *
 * An admin sets an initial password and passes it on directly. There is
 * no invitation email because no email provider is configured — the site must
 * work with `RESEND_ENABLED=false` (CLAUDE.md), and an invite link that never
 * arrives is a worse experience than being handed a password.
 *
 * The role select carries a description of each role rather than only its name,
 * because nobody should have to remember the policy while granting someone
 * access to patient data. Keep these in step with lib/auth/policy.ts.
 */

const ROLE_HINTS: Record<Role, string> = {
  admin: "Full access, including deleting patient data and managing staff.",
  editor: "Create, edit, publish and remove content. Reads patient enquiries; cannot delete them or see staff.",
  contributor: "Blog posts, authors, FAQs, awards and media only. Edits only what they created; cannot publish.",
};

const ROLE_ORDER: Role[] = ["contributor", "editor", "admin"];

/** The first server message for `field`, rendered under its input. */
function FieldError({ id, messages }: { id: string; messages: string[] | undefined }) {
  const message = messages?.[0];
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

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
  const [state, formAction] = useActionState<StaffState, FormData>(
    async (prev, formData) => {
      // Same schema the server runs, so a short password fails without a round
      // trip. The server check is still the one that counts.
      const password = staffPassword.safeParse({
        email: formData.get("email") ?? "",
        password: formData.get("password") ?? "",
      });
      if (!password.success) {
        const messages = password.error.issues.map((issue) => issue.message);
        return {
          ok: false,
          error: messages[0] ?? "Choose a different password.",
          fields: { password: messages },
        };
      }

      const result = await createStaffAction(prev, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  const fields = state && !state.ok ? state.fields : {};

  /** `aria-describedby` for an input: its hint, plus its error when there is one. */
  function describedBy(name: string, hintId?: string): string | undefined {
    const ids = [hintId, fields[name]?.length ? `staff-${name}-error` : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-border bg-white p-6"
      noValidate
    >
      <h2 className="text-lg font-medium text-primary">Add a staff account</h2>

      <div aria-live="polite" className="mt-4 empty:mt-0">
        {state?.ok ? (
          <p className="rounded-md border-l-2 border-accent bg-secondary px-4 py-3 text-sm text-primary">
            {state.data.message}
          </p>
        ) : null}
        {state && !state.ok ? (
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
          <Input
            id="staff-name"
            name="name"
            required
            autoComplete="off"
            aria-invalid={fields.name?.length ? true : undefined}
            aria-describedby={describedBy("name")}
          />
          <FieldError id="staff-name-error" messages={fields.name} />
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
            aria-invalid={fields.email?.length ? true : undefined}
            aria-describedby={describedBy("email")}
          />
          <FieldError id="staff-email-error" messages={fields.email} />
        </div>

        <div className="space-y-2">
          <label htmlFor="staff-role" className="block text-sm font-medium text-primary">
            Role
          </label>
          <select
            id="staff-role"
            name="role"
            defaultValue="contributor"
            aria-invalid={fields.role?.length ? true : undefined}
            aria-describedby={describedBy("role", "staff-role-hint")}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-base text-foreground"
          >
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <FieldError id="staff-role-error" messages={fields.role} />
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
            aria-invalid={fields.password?.length ? true : undefined}
            aria-describedby={describedBy("password", "staff-password-hint")}
          />
          <FieldError id="staff-password-error" messages={fields.password} />
          <p id="staff-password-hint" className="text-xs text-muted-foreground">
            At least {PASSWORD_MIN_LENGTH} characters, not containing their email
            address. Give it to them directly — it is not emailed.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <SubmitButton />
      </div>
    </form>
  );
}
