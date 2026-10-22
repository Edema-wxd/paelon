import type { Metadata } from "next";

import { NotPermitted } from "@/components/admin/not-permitted";
import { SettingsForm } from "@/components/admin/settings-form";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getSiteSettingsForAdmin } from "@/lib/db/queries/site-settings";

/**
 * Site settings (spec §8, decision C2 option B).
 *
 * Admin only, for read as well as write: the turnaround here is a promise made
 * to every patient who fills in a form, so it is not an editor's call. The page
 * renders the refusal rather than throwing, and the action it submits to
 * refuses for itself through `adminAction` — hiding a form has never stopped
 * anyone POSTing to it.
 *
 * Deliberately narrow. Secrets, integration toggles (`RESEND_ENABLED`) and the
 * emergency line are not here and should not be added: C2 rejected runtime
 * feature flags, and `lib/emergency.ts` is read at build time because the
 * client-side error boundaries cannot query the database. Widening this screen
 * means a migration and a decision, not a new field.
 *
 * `force-dynamic` because a settings screen must never serve a cached read. An
 * operator who saves a value and is shown the old one cannot tell a stale cache
 * from a failed write, and would reasonably try again.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminSettingsPage() {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "site_settings")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const settings = await getSiteSettingsForAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-primary">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Values Paelon can change without a deploy. Everything else — email and
        WhatsApp credentials, the emergency line, the privacy consent version —
        is set per environment and changes by deploy.
      </p>

      {settings === null && (
        <p role="status" className="mt-6 text-sm text-destructive">
          No settings row was found, so the site is showing its placeholder
          values. Saving below creates the row.
        </p>
      )}

      <SettingsForm
        responseTimeHours={settings?.responseTimeHours ?? null}
        whatsappNumber={settings?.whatsappNumber ?? null}
      />

      {settings?.updatedAt && (
        <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          Last changed{" "}
          <time dateTime={settings.updatedAt.toISOString()}>
            {settings.updatedAt.toLocaleString("en-NG", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Africa/Lagos",
            })}
          </time>
          . Every change is recorded in the{" "}
          <a href="/admin/audit" className="text-accent underline underline-offset-4">
            audit log
          </a>
          .
        </p>
      )}
    </div>
  );
}
