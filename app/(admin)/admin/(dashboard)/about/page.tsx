import type { Metadata } from "next";
import Link from "next/link";

import { AboutForm } from "@/components/admin/about-form";
import { NotPermitted } from "@/components/admin/not-permitted";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getAboutForAdmin } from "@/lib/db/queries/about";
import { SectionsEditor } from "@/components/admin/sections-editor";
import { sectionPickableMedia } from "@/lib/admin/section-media";
import { saveAboutSectionsAction } from "@/lib/admin/sections-actions";
import { getSectionsForEditor } from "@/lib/db/queries/sections";

/**
 * About page copy (migration 0005).
 *
 * The prose that was `content/about.json` until 2026-10-22. The two parts of
 * `/about` that are rows — the leadership team and the awards timeline — are
 * edited in `/admin/doctors` and `/admin/awards`, and the note below says so,
 * because "where do I add a consultant" is the first question this screen
 * raises.
 *
 * Editors as well as admins, per the `about_content` policy entry: this is
 * editorial content, unlike `/admin/settings`, where the turnaround is a
 * promise made to every patient. The page renders the refusal rather than
 * throwing, and the action it submits to refuses for itself — hiding a form
 * has never stopped anyone POSTing to it.
 *
 * `force-dynamic`, like settings: an editor who saves and is shown the old
 * copy cannot tell a stale cache from a failed write.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About page",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminAboutPage() {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "about_content")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const about = await getAboutForAdmin();

  const sections = await getSectionsForEditor({ page: "about" });
  const sectionMedia = await sectionPickableMedia(sections);


  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-primary">About page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The prose on{" "}
        <Link href="/about" className="text-accent underline underline-offset-4">
          /about
        </Link>
        . The leadership team comes from{" "}
        <Link
          href="/admin/doctors"
          className="text-accent underline underline-offset-4"
        >
          Doctors
        </Link>{" "}
        and the timeline from{" "}
        <Link
          href="/admin/awards"
          className="text-accent underline underline-offset-4"
        >
          Awards
        </Link>
        , not from this screen. Every section is optional — the page renders
        only what is written — but publishing needs the first five.
      </p>

      {about === null && (
        <p role="status" className="mt-6 text-sm text-destructive">
          No About row was found, so the page is rendering as unwritten. Saving
          below creates the row.
        </p>
      )}

      <AboutForm
        values={{
          published: about?.published ?? false,
          placeholder: about?.placeholder ?? false,
          intro: about?.intro ?? "",
          motto: about?.motto ?? "",
        }}
      />

      <div className="mt-8">
        <SectionsEditor
          initialSections={sections}
          media={sectionMedia}
          save={saveAboutSectionsAction}
          target={{}}
          pageName="the About page, between the intro and the leadership team"
        />
      </div>

      {about?.updatedAt && (
        <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          Last changed{" "}
          <time dateTime={about.updatedAt.toISOString()}>
            {about.updatedAt.toLocaleString("en-NG", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Africa/Lagos",
            })}
          </time>
          . Every change is recorded in the{" "}
          <Link
            href="/admin/audit"
            className="text-accent underline underline-offset-4"
          >
            audit log
          </Link>
          .
        </p>
      )}
    </div>
  );
}
