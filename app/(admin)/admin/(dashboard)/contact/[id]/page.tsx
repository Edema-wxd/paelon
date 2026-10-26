import { ArrowLeft, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AnonymiseForm } from "@/components/admin/anonymise-form";
import { ContactHandledBadge } from "@/components/admin/contact-handled-badge";
import { ContactHandledForm } from "@/components/admin/contact-handled-form";
import { NotPermitted } from "@/components/admin/not-permitted";
import { requestIp, writeAudit } from "@/lib/admin/audit";
import { anonymiseContactAction, type ContactMessage } from "@/lib/admin/contact-actions";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getContactSubmissionForAdmin } from "@/lib/db/queries/contact-submissions";
import { Button } from "@/components/ui/button";

/**
 * One contact submission, for triage. Opening this page writes an audit row —
 * this is the screen that shows a visitor's email, phone and message, so "who
 * looked at this record" is the question an incident review actually asks.
 * Mirrors `bookings/[id]/page.tsx`.
 *
 * Laid out for the job: read the message, reply, mark it handled. The message
 * leads at reading size; the sender sits beside it with the email and phone as
 * `mailto:` / `tel:` links, because the reply happens in the member of staff's
 * own mail client or phone — the site sends no email (no Resend access).
 * Erasing personal data is irreversible and rare, so it sits apart at the foot
 * of the page rather than beside the routine action.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact submission",
  robots: { index: false, follow: false, nocache: true },
};

/** Paelon's clock, whatever region the server runs in. */
const TIME_ZONE = "Africa/Lagos";

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}


/** For fields the erase keeps: absent here means it was never given. */
const KEPT_NOT_GIVEN = <span className="text-muted-foreground">Not given</span>;

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
  // An erased field was given and then removed; "Not given" would misreport it.
  const NOT_GIVEN = (
    <span className="text-muted-foreground">{submission.anonymisedAt ? "Erased" : "Not given"}</span>
  );
  const canDelete = can(user.role, "delete", "contact_submissions");

  const replyHref = submission.email
    ? `mailto:${submission.email}?subject=${encodeURIComponent(`Re: ${submission.subject}`)}`
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/contact"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Contact
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
          {submission.subject}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <ContactHandledBadge handled={submission.handled} />
          <span>
            Received{" "}
            <time dateTime={submission.createdAt.toISOString()}>
              {formatDateTime(submission.createdAt)}
            </time>
          </span>
        </div>
      </header>

      {submission.anonymisedAt ? (
        <p className="mt-6 rounded-md border-l-2 border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
          This submission&rsquo;s personal data was erased on{" "}
          {formatDate(submission.anonymisedAt)} under the retention policy.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="message-heading">
          <h2 id="message-heading" className="sr-only">
            Message
          </h2>
          <div className="rounded-lg border border-border bg-surface p-5 sm:p-6">
            {submission.message ? (
              <p className="max-w-prose text-base leading-relaxed whitespace-pre-wrap text-foreground">
                {submission.message}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {submission.anonymisedAt ? "Erased." : "No message was given."}
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section
            aria-labelledby="sender-heading"
            className="rounded-lg border border-border bg-surface p-5"
          >
            <h2 id="sender-heading" className="text-sm font-semibold text-primary">
              Sender
            </h2>
            <dl className="mt-3 space-y-3">
              <Field label="Name">{submission.name ?? NOT_GIVEN}</Field>
              <Field label="Email">
                {submission.email ? (
                  <a
                    href={`mailto:${submission.email}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {submission.email}
                  </a>
                ) : (
                  NOT_GIVEN
                )}
              </Field>
              <Field label="Phone">
                {submission.phone ? (
                  <a
                    href={`tel:${submission.phone.replace(/\s+/g, "")}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {submission.phone}
                  </a>
                ) : (
                  NOT_GIVEN
                )}
              </Field>
              <Field label="Branch">{locationName ?? KEPT_NOT_GIVEN}</Field>
            </dl>
          </section>

          {canAct ? (
            <section
              aria-labelledby="actions-heading"
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h2 id="actions-heading" className="text-sm font-semibold text-primary">
                Respond
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {replyHref ? (
                  <Button asChild className="w-full">
                    <a href={replyHref}>
                      <Mail aria-hidden />
                      Reply by email
                    </a>
                  </Button>
                ) : null}
                {!replyHref && submission.phone ? (
                  <Button asChild className="w-full">
                    <a href={`tel:${submission.phone.replace(/\s+/g, "")}`}>
                      <Phone aria-hidden />
                      Call {submission.name ?? "the sender"}
                    </a>
                  </Button>
                ) : null}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {submission.handled
                  ? `Handled${handledByName ? ` by ${handledByName}` : ""}${
                      submission.handledAt ? ` on ${formatDate(submission.handledAt)}` : ""
                    }.`
                  : "Mark it handled once you have replied."}
              </p>
              <div className="mt-2">
                <ContactHandledForm submissionId={submission.id} handled={submission.handled} />
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      {canDelete && !submission.anonymisedAt ? (
        <section
          aria-labelledby="erase-heading"
          className="mt-12 border-t border-border pt-6"
        >
          <h2 id="erase-heading" className="text-sm font-semibold text-primary">
            Erase personal data
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Permanently removes the sender&rsquo;s name, contact details and message.
            Use when the retention period ends or the sender asks. This cannot be
            undone.
          </p>
          <div className="mt-3">
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
