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

/**
 * One corporate enquiry. Opening this page writes an audit row — this is the
 * screen that shows the contact's email, phone and requirements, so "who
 * looked at this record" is the question an incident review actually asks.
 * Mirrors `bookings/[id]/page.tsx` and `contact/[id]/page.tsx`.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corporate enquiry",
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
  const canDelete = can(user.role, "delete", "corporate_enquiries");

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link
          href="/admin/corporate-enquiries"
          className="text-accent underline underline-offset-4 hover:no-underline"
        >
          Back to corporate enquiries
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-primary">{enquiry.companyName}</h1>
        <CorporateStatusBadge status={enquiry.status} />
      </div>

      {enquiry.anonymisedAt ? (
        <p className="mt-4 rounded-md border-l-2 border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          This enquiry&rsquo;s personal data was erased on{" "}
          {formatDate(enquiry.anonymisedAt)} under the retention policy.
        </p>
      ) : null}

      <section aria-labelledby="company-heading" className="mt-8">
        <h2 id="company-heading" className="text-lg font-medium text-primary">
          Company
        </h2>
        <dl className="mt-4 grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
          <Field label="Company size" value={CORPORATE_COMPANY_SIZE_LABELS[enquiry.companySize]} />
          <Field label="Sector" value={enquiry.sector} />
          <Field label="Current provider" value={enquiry.currentProvider} />
          <Field label="Received" value={formatDateTime(enquiry.createdAt)} />
        </dl>
      </section>

      <section aria-labelledby="contact-heading" className="mt-8">
        <h2 id="contact-heading" className="text-lg font-medium text-primary">
          Contact
        </h2>
        <dl className="mt-4 grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
          <Field label="Name" value={enquiry.contactName} />
          <Field label="Email" value={enquiry.contactEmail} />
          <Field label="Phone" value={enquiry.contactPhone} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Requirements</dt>
            <dd className="mt-0.5 text-sm whitespace-pre-wrap text-foreground">
              {enquiry.requirements || "Not given"}
            </dd>
          </div>
        </dl>
      </section>

      {canAct ? (
        <section aria-labelledby="status-heading" className="mt-8">
          <h2 id="status-heading" className="text-lg font-medium text-primary">
            Status
          </h2>
          <div className="mt-4 rounded-xl border border-border bg-white p-4">
            <CorporateStatusForm enquiryId={enquiry.id} current={enquiry.status} />
          </div>
        </section>
      ) : null}

      {canDelete && !enquiry.anonymisedAt ? (
        <section aria-labelledby="erase-heading" className="mt-8">
          <h2 id="erase-heading" className="text-lg font-medium text-primary">
            Retention
          </h2>
          <div className="mt-4 rounded-xl border border-border bg-white p-4">
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
