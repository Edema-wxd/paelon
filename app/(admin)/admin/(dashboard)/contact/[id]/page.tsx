import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AnonymiseForm } from "@/components/admin/anonymise-form";
import { ContactHandledForm } from "@/components/admin/contact-handled-form";
import { NotPermitted } from "@/components/admin/not-permitted";
import { requestIp, writeAudit } from "@/lib/admin/audit";
import { anonymiseContactAction, type ContactMessage } from "@/lib/admin/contact-actions";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getContactSubmissionForAdmin } from "@/lib/db/queries/contact-submissions";

/**
 * One contact submission, for triage. Opening this page writes an audit row —
 * this is the screen that shows a visitor's email, phone and message, so "who
 * looked at this record" is the question an incident review actually asks.
 * Mirrors `bookings/[id]/page.tsx`.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact submission",
  robots: { index: false, follow: false, nocache: true },
};

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value ?? "Not given"}</dd>
    </div>
  );
}

export default async function AdminContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "contact_submissions")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const { id } = await params;
  const detail = await getContactSubmissionForAdmin(id);
  if (!detail) notFound();

  const { submission, locationName, handledByName } = detail;

  // Ids and enum-shaped fields only. Never name, email, phone or message,
  // which is the whole reason this row exists — to record that someone read
  // that content, not to duplicate it.
  await writeAudit({
    userId: user.id,
    action: "contact.viewed",
    entityType: "contact_submissions",
    entityId: submission.id,
    metadata: { subject: submission.subject, handled: submission.handled },
    ip: await requestIp(),
  });

  const canAct = can(user.role, "update", "contact_submissions");
  const canDelete = can(user.role, "delete", "contact_submissions");

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link
          href="/admin/contact"
          className="text-accent underline underline-offset-4 hover:no-underline"
        >
          Back to contact
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-primary">{submission.subject}</h1>
        <p className="text-sm text-muted-foreground">
          {submission.handled ? "Handled" : "Not handled"}
          {submission.handled && handledByName ? ` by ${handledByName}` : ""}
        </p>
      </div>

      {submission.anonymisedAt ? (
        <p className="mt-4 rounded-md border-l-2 border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          This submission&rsquo;s personal data was erased on{" "}
          {formatDate(submission.anonymisedAt)} under the retention policy.
        </p>
      ) : null}

      <section aria-labelledby="submission-heading" className="mt-8">
        <h2 id="submission-heading" className="text-lg font-medium text-primary">
          Submission
        </h2>
        <dl className="mt-4 grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
          <Field label="Name" value={submission.name} />
          <Field label="Email" value={submission.email} />
          <Field label="Phone" value={submission.phone} />
          <Field label="Branch" value={locationName} />
          <Field label="Received" value={formatDateTime(submission.createdAt)} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Message</dt>
            <dd className="mt-0.5 text-sm whitespace-pre-wrap text-foreground">
              {submission.message ?? "Not given"}
            </dd>
          </div>
        </dl>
      </section>

      {canAct ? (
        <section aria-labelledby="handled-heading" className="mt-8">
          <h2 id="handled-heading" className="text-lg font-medium text-primary">
            Handled state
          </h2>
          <div className="mt-4 rounded-xl border border-border bg-white p-4">
            <ContactHandledForm submissionId={submission.id} handled={submission.handled} />
          </div>
        </section>
      ) : null}

      {canDelete && !submission.anonymisedAt ? (
        <section aria-labelledby="erase-heading" className="mt-8">
          <h2 id="erase-heading" className="text-lg font-medium text-primary">
            Retention
          </h2>
          <div className="mt-4 rounded-xl border border-border bg-white p-4">
            <AnonymiseForm<ContactMessage>
              action={anonymiseContactAction}
              hiddenField="submissionId"
              hiddenValue={submission.id}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
