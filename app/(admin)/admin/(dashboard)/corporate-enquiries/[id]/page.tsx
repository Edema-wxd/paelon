import { ArrowLeft, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AnonymiseForm } from "@/components/admin/anonymise-form";
import { CorporateStatusBadge } from "@/components/admin/corporate-status-badge";
import { CorporateStatusForm } from "@/components/admin/corporate-status-form";
import { NotPermitted } from "@/components/admin/not-permitted";
import { requestIp, writeAudit } from "@/lib/admin/audit";
import { anonymiseCorporateAction, type CorporateMessage } from "@/lib/admin/corporate-actions";
import { CORPORATE_COMPANY_SIZE_LABELS } from "@/lib/admin/corporate-view";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getCorporateEnquiryForAdmin } from "@/lib/db/queries/corporate-enquiries";
import { Button } from "@/components/ui/button";

/**
 * One corporate enquiry. Opening this page writes an audit row — this is the
 * screen that shows the contact's email, phone and requirements, so "who
 * looked at this record" is the question an incident review actually asks.
 * Mirrors `bookings/[id]/page.tsx` and `contact/[id]/page.tsx`.
 *
 * Same layout as the contact detail: what the company asked for leads; who to
 * reply to sits beside it with `mailto:` / `tel:` links (the site sends no
 * email); the pipeline is one click per stage; erasing personal data sits
 * apart at the foot because it cannot be undone.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corporate enquiry",
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

function telHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

export default async function AdminCorporateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "corporate_enquiries")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const { id } = await params;
  const enquiry = await getCorporateEnquiryForAdmin(id);
  if (!enquiry) notFound();

  // Ids and enum-shaped fields only. Never the contact's name, email, phone
  // or requirements.
  await writeAudit({
    userId: user.id,
    action: "corporate.viewed",
    entityType: "corporate_enquiries",
    entityId: enquiry.id,
    metadata: { status: enquiry.status, company_size: enquiry.companySize },
    ip: await requestIp(),
  });

  const canAct = can(user.role, "update", "corporate_enquiries");
  // An erased field was given and then removed; "Not given" would misreport it.
  const NOT_GIVEN = (
    <span className="text-muted-foreground">{enquiry.anonymisedAt ? "Erased" : "Not given"}</span>
  );
  const canDelete = can(user.role, "delete", "corporate_enquiries");

  const replyHref = enquiry.contactEmail
    ? `mailto:${enquiry.contactEmail}?subject=${encodeURIComponent(
        `Re: ${enquiry.companyName} corporate enquiry`,
      )}`
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/corporate-enquiries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Corporate enquiries
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
          {enquiry.companyName}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <CorporateStatusBadge status={enquiry.status} />
          <span>
            Received{" "}
            <time dateTime={enquiry.createdAt.toISOString()}>
              {formatDateTime(enquiry.createdAt)}
            </time>
          </span>
        </div>
      </header>

      {enquiry.anonymisedAt ? (
        <p className="mt-6 rounded-md border-l-2 border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
          This enquiry&rsquo;s personal data was erased on{" "}
          {formatDate(enquiry.anonymisedAt)} under the retention policy.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <section aria-labelledby="requirements-heading">
            <h2 id="requirements-heading" className="text-sm font-semibold text-primary">
              What they need
            </h2>
            <div className="mt-2 rounded-lg border border-border bg-surface p-5 sm:p-6">
              {enquiry.requirements ? (
                <p className="max-w-prose text-base leading-relaxed whitespace-pre-wrap text-foreground">
                  {enquiry.requirements}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {enquiry.anonymisedAt ? "Erased." : "No requirements were given."}
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="company-heading">
            <h2 id="company-heading" className="text-sm font-semibold text-primary">
              Company
            </h2>
            <dl className="mt-2 grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-3">
              <Field label="Size">{CORPORATE_COMPANY_SIZE_LABELS[enquiry.companySize]}</Field>
              <Field label="Sector">{enquiry.sector ?? KEPT_NOT_GIVEN}</Field>
              <Field label="Current provider">{enquiry.currentProvider ?? KEPT_NOT_GIVEN}</Field>
            </dl>
          </section>
        </div>

        <aside className="space-y-6">
          <section
            aria-labelledby="contact-heading"
            className="rounded-lg border border-border bg-surface p-5"
          >
            <h2 id="contact-heading" className="text-sm font-semibold text-primary">
              Contact
            </h2>
            <dl className="mt-3 space-y-3">
              <Field label="Name">{enquiry.contactName ?? NOT_GIVEN}</Field>
              <Field label="Email">
                {enquiry.contactEmail ? (
                  <a
                    href={`mailto:${enquiry.contactEmail}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {enquiry.contactEmail}
                  </a>
                ) : (
                  NOT_GIVEN
                )}
              </Field>
              <Field label="Phone">
                {enquiry.contactPhone ? (
                  <a
                    href={telHref(enquiry.contactPhone)}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {enquiry.contactPhone}
                  </a>
                ) : (
                  NOT_GIVEN
                )}
              </Field>
            </dl>
            {replyHref ? (
              <Button asChild className="mt-4 w-full">
                <a href={replyHref}>
                  <Mail aria-hidden />
                  Reply by email
                </a>
              </Button>
            ) : enquiry.contactPhone ? (
              <Button asChild className="mt-4 w-full">
                <a href={telHref(enquiry.contactPhone)}>
                  <Phone aria-hidden />
                  Call {enquiry.contactName ?? "the contact"}
                </a>
              </Button>
            ) : null}
          </section>

          {canAct ? (
            <section
              aria-labelledby="status-heading"
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h2 id="status-heading" className="text-sm font-semibold text-primary">
                Pipeline
              </h2>
              <div className="mt-3">
                <CorporateStatusForm enquiryId={enquiry.id} current={enquiry.status} />
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      {canDelete && !enquiry.anonymisedAt ? (
        <section aria-labelledby="erase-heading" className="mt-12 border-t border-border pt-6">
          <h2 id="erase-heading" className="text-sm font-semibold text-primary">
            Erase personal data
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Permanently removes the contact&rsquo;s name, email, phone and the
            requirements they wrote. Company details are kept for reporting. Use
            when the retention period ends or the contact asks. This cannot be
            undone.
          </p>
          <div className="mt-3">
            <AnonymiseForm<CorporateMessage>
              action={anonymiseCorporateAction}
              hiddenField="enquiryId"
              hiddenValue={enquiry.id}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
