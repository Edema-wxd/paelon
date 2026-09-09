import type { Metadata } from "next";

import { StaffCreateForm } from "@/components/admin/staff-create-form";
import { StaffList } from "@/components/admin/staff-list";
import { NotPermitted } from "@/components/admin/not-permitted";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { listStaffAccounts } from "@/lib/db/queries/users";

/**
 * Staff accounts and role assignment.
 *
 * Readable by a super admin or an admin, manageable only by a super admin —
 * `can(role, "update", "users")` is false for `editor`, so an admin sees who has
 * access without being able to grant themselves more of it.
 *
 * `force-dynamic` because account state decides who can sign in. A cached page
 * that still shows a deactivated colleague as active is the one stale read in
 * this panel that actually matters.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminStaffPage() {
  const user = await requireAdminUser();

  // A page renders a "no" rather than throwing one. `requireCan` still throws in
  // the server actions this page submits to, which is where a 403 belongs.
  if (!can(user.role, "read", "users")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const accounts = await listStaffAccounts();

  const canManage = can(user.role, "update", "users");
  const active = accounts.filter((account) => account.deletedAt === null);
  const superAdmins = active.filter((account) => account.role === "admin").length;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-primary">Staff</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {active.length} active {active.length === 1 ? "account" : "accounts"},{" "}
        {superAdmins} super {superAdmins === 1 ? "admin" : "admins"}. Deactivating
        an account keeps its history in the audit log; it does not erase it.
      </p>

      {/*
        A single super admin is a real operational risk: they cannot change their
        own role or deactivate themselves, and nobody else can do it for them.
        Said once, here, rather than as an error after someone gets stuck.
      */}
      {canManage && superAdmins < 2 ? (
        <p className="mt-4 rounded-md border-l-2 border-accent bg-white px-4 py-3 text-sm text-primary">
          There is only one super admin. Promote a second one so account recovery
          does not depend on a single person.
        </p>
      ) : null}

      {canManage ? (
        <div className="mt-8">
          <StaffCreateForm />
        </div>
      ) : (
        <p className="mt-8 rounded-md border-l-2 border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          You can see who has access. Only a super admin can add accounts or
          change roles.
        </p>
      )}

      <section aria-labelledby="staff-heading" className="mt-10">
        <h2 id="staff-heading" className="text-lg font-medium text-primary">
          Accounts
        </h2>
        <div className="mt-4">
          <StaffList
            accounts={accounts}
            currentUserId={user.id}
            canManage={canManage}
          />
        </div>
      </section>
    </div>
  );
}
