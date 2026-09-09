"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { ROLE_LABELS, type Role } from "@/lib/auth/policy";
import { staffRowAction, type StaffActionState } from "@/lib/auth/user-actions";
import type { StaffAccount } from "@/lib/db/queries/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The staff list, one editable row per account.
 *
 * `canManage` decides whether the controls render; every action re-checks on the
 * server, so a row rendered read-only is not what makes it read-only.
 *
 * The guards that stop a super admin removing the last super admin, or editing
 * their own role, live in `lib/auth/staff-guards.ts` and report through the same
 * `aria-live` region as everything else. They are not duplicated here — a client
 * copy of a rule is a copy that drifts.
 */

const ROLE_ORDER: Role[] = ["contributor", "editor", "admin"];

function Pending({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return <>{pending ? "Working…" : children}</>;
}

function formatDate(value: Date | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StaffRow({
  account,
  isSelf,
  canManage,
}: {
  account: StaffAccount;
  isSelf: boolean;
  canManage: boolean;
}) {
  const [resetting, setResetting] = useState(false);
  const [state, formAction] = useActionState<StaffActionState, FormData>(
    async (prev, formData) => {
      const result = await staffRowAction(prev, formData);
      if (result.message) setResetting(false);
      return result;
    },
    {},
  );

  const isLocked =
    account.lockedUntil !== null && new Date(account.lockedUntil) > new Date();
  const isActive = account.deletedAt === null;

  return (
    <li className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium text-primary">
            {account.name}
            {isSelf ? (
              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">{account.email}</p>
        </div>

        {/*
          Status as words, not a coloured dot — colour is never the sole state
          indicator (CLAUDE.md accessibility gates).
        */}
        <p className="text-sm">
          {!isActive ? (
            <span className="text-muted-foreground">Deactivated</span>
          ) : isLocked ? (
            <span className="text-destructive">
              Locked after {account.failedAttempts} failed sign-ins
            </span>
          ) : (
            <span className="text-muted-foreground">
              Last signed in {formatDate(account.lastLoginAt)}
            </span>
          )}
        </p>
      </div>

      <div aria-live="polite" className="mt-3 empty:mt-0">
        {state.message ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-primary">
            {state.message}
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <form action={formAction} className="flex items-end gap-2">
            <input type="hidden" name="intent" value="role" />
            <input type="hidden" name="userId" value={account.id} />
            <div className="space-y-1">
              <label
                htmlFor={`role-${account.id}`}
                className="block text-xs text-muted-foreground"
              >
                Role
              </label>
              <select
                id={`role-${account.id}`}
                name="role"
                defaultValue={account.role}
                disabled={isSelf}
                className="h-10 rounded-md border border-input bg-white px-3 text-sm text-foreground disabled:opacity-60"
              >
                {ROLE_ORDER.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={isSelf}>
              <Pending>Save role</Pending>
            </Button>
          </form>

          {isLocked ? (
            <form action={formAction}>
              <input type="hidden" name="intent" value="unlock" />
              <input type="hidden" name="userId" value={account.id} />
              <Button type="submit" variant="outline" size="sm">
                <Pending>Clear lockout</Pending>
              </Button>
            </form>
          ) : null}

          <form action={formAction}>
            <input
              type="hidden"
              name="intent"
              value={isActive ? "deactivate" : "reactivate"}
            />
            <input type="hidden" name="userId" value={account.id} />
            <Button
              type="submit"
              variant={isActive ? "destructive" : "outline"}
              size="sm"
              disabled={isSelf}
            >
              <Pending>{isActive ? "Deactivate" : "Reactivate"}</Pending>
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setResetting((open) => !open)}
            aria-expanded={resetting}
            aria-controls={`reset-${account.id}`}
          >
            Set password
          </Button>
        </div>
      ) : null}

      {canManage && resetting ? (
        <form
          id={`reset-${account.id}`}
          action={formAction}
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4"
        >
          <input type="hidden" name="intent" value="password" />
          <input type="hidden" name="userId" value={account.id} />
          <div className="space-y-1">
            <label
              htmlFor={`password-${account.id}`}
              className="block text-xs text-muted-foreground"
            >
              New password (at least 12 characters)
            </label>
            <Input
              id={`password-${account.id}`}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="w-64"
            />
          </div>
          <Button type="submit" size="sm">
            <Pending>Set password</Pending>
          </Button>
        </form>
      ) : null}
    </li>
  );
}

export function StaffList({
  accounts,
  currentUserId,
  canManage,
}: {
  accounts: StaffAccount[];
  currentUserId: string;
  canManage: boolean;
}) {
  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white px-6 py-10 text-center text-sm text-muted-foreground">
        No staff accounts yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {accounts.map((account) => (
        <StaffRow
          key={account.id}
          account={account}
          isSelf={account.id === currentUserId}
          canManage={canManage}
        />
      ))}
    </ul>
  );
}
