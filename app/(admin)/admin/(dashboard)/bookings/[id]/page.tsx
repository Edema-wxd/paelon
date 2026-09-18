import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BookingAssignForm } from "@/components/admin/booking-assign-form";
import { BookingNotesForm } from "@/components/admin/booking-notes-form";
import { BookingStatusForm } from "@/components/admin/booking-status-form";
import { NotPermitted } from "@/components/admin/not-permitted";
import { SERVICE_FAMILY_LABELS, TIME_WINDOW_LABELS } from "@/components/booking/types";
import { requestIp, writeAudit } from "@/lib/admin/audit";
import { BOOKING_STATUS_LABELS } from "@/lib/admin/booking-view";
import { isBackwardTransition, nextStatuses } from "@/lib/booking/status";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getBookingForAdmin, listAssignableUsers } from "@/lib/db/queries/bookings";

/**
 * One booking, with its timeline and the controls that move it (spec §8).
 *
 * Opening this page writes an audit row. §8 logs each open of a booking detail
 * page and not list views, because this is the screen that shows a patient's
 * phone number, date of birth and reason for visit — "who looked at this
 * record" is the question an incident review actually asks.
 *
 * Only `editor` and `admin` can read bookings at all, which is exactly who §8
 * lets see `reason_for_visit`. It is rendered here and nowhere else: never in
 * the list, never in a log line, never in audit metadata.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking",
  robots: { index: false, follow: false, nocache: true },
};

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminUser();

  if (!can(user.role, "read", "bookings")) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const { id } = await params;
  const detail = await getBookingForAdmin(id);
  if (!detail) notFound();

  const { booking, locationName, serviceName, assigneeName, history } = detail;

  // Ids and the reference only. Never the patient's details, which are the
  // thing this row exists to say someone looked at.
  await writeAudit({
    userId: user.id,
    action: "booking.viewed",
    entityType: "bookings",
    entityId: booking.id,
    metadata: { reference: booking.reference, status: booking.status },
    ip: await requestIp(),
  });

  const canAct = can(user.role, "update", "bookings");
  const staff = canAct ? await listAssignableUsers() : [];
  const options = nextStatuses(booking.status, user.role);
  const backward = options.filter((status) =>
    isBackwardTransition(booking.status, status),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm">
        <Link
          href="/admin/bookings"
          className="text-accent underline underline-offset-4 hover:no-underline"
        >
          Back to bookings
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-primary">{booking.reference}</h1>
        <p className="text-sm text-muted-foreground">
          {BOOKING_STATUS_LABELS[booking.status]} ·{" "}
          {assigneeName ? `Assigned to ${assigneeName}` : "Unassigned"}
        </p>
      </div>

      {booking.anonymisedAt ? (
        <p className="mt-4 rounded-md border-l-2 border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          This booking&rsquo;s personal data was erased on{" "}
          {formatDate(booking.anonymisedAt)} under the retention policy.
        </p>
      ) : null}

      <section aria-labelledby="request-heading" className="mt-8">
        <h2 id="request-heading" className="text-lg font-medium text-primary">
          The request
        </h2>
        <dl className="mt-4 grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
          <Field label="Branch" value={locationName} />
          <Field
            label="Service"
            value={serviceName ?? SERVICE_FAMILY_LABELS[booking.serviceFamily]}
          />
          <Field label="Preferred date" value={formatDate(booking.preferredDate)} />
          <Field
            label="Preferred time"
            value={`${TIME_WINDOW_LABELS[booking.preferredTimeWindow]} (indicative)`}
          />
          <Field label="Received" value={formatDateTime(booking.createdAt)} />
          <Field label="Source" value={booking.source} />
        </dl>
      </section>

      <section aria-labelledby="patient-heading" className="mt-8">
        <h2 id="patient-heading" className="text-lg font-medium text-primary">
          Patient
        </h2>
        <dl className="mt-4 grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
          <Field label="Name" value={booking.patientName} />
          <Field label="Phone" value={booking.patientPhone} />
          <Field label="Email" value={booking.patientEmail} />
          <Field
            label="Date of birth"
            value={booking.patientDob ? formatDate(booking.patientDob) : null}
          />
          <Field
            label="Existing patient"
            value={booking.existingPatient ? "Yes" : "No"}
          />
          <Field label="HMO plan" value={booking.hmoPlan} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Reason for visit</dt>
            <dd className="mt-0.5 text-sm whitespace-pre-wrap text-foreground">
              {booking.reasonForVisit ?? "Not given"}
            </dd>
          </div>
          <Field
            label="NDPR consent"
            value={`${booking.consentNdpr ? "Given" : "Not given"} · ${formatDateTime(booking.consentGivenAt)} · ${booking.consentTextVersion}`}
          />
          <Field
            label="Marketing consent"
            value={booking.consentMarketing ? "Given" : "Not given"}
          />
        </dl>
      </section>

      {canAct ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="status-heading">
            <h2 id="status-heading" className="text-lg font-medium text-primary">
              Status
            </h2>
            <div className="mt-4 rounded-xl border border-border bg-white p-4">
              <BookingStatusForm
                bookingId={booking.id}
                current={booking.status}
                options={options}
                backward={backward}
              />
            </div>
          </section>

          <section aria-labelledby="assign-heading">
            <h2 id="assign-heading" className="text-lg font-medium text-primary">
              Assignment
            </h2>
            <div className="mt-4 rounded-xl border border-border bg-white p-4">
              <BookingAssignForm
                bookingId={booking.id}
                assignedToUserId={booking.assignedToUserId}
                staff={staff}
              />
            </div>
          </section>
        </div>
      ) : null}

      <section aria-labelledby="notes-heading" className="mt-8">
        <h2 id="notes-heading" className="text-lg font-medium text-primary">
          Internal notes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff only. Never shown to the patient.
        </p>
        <div className="mt-4 rounded-xl border border-border bg-white p-4">
          {canAct ? (
            <BookingNotesForm bookingId={booking.id} notes={booking.internalNotes} />
          ) : (
            <p className="text-sm whitespace-pre-wrap text-foreground">
              {booking.internalNotes || "No notes yet."}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="timeline-heading" className="mt-8">
        <h2 id="timeline-heading" className="text-lg font-medium text-primary">
          Timeline
        </h2>
        <ol className="mt-4 space-y-3">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-border bg-white p-4 text-sm"
            >
              <p className="text-primary">
                {entry.fromStatus
                  ? `${BOOKING_STATUS_LABELS[entry.fromStatus]} → ${BOOKING_STATUS_LABELS[entry.toStatus]}`
                  : `Booking received as ${BOOKING_STATUS_LABELS[entry.toStatus]}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(entry.changedAt)} ·{" "}
                {entry.changedByName ?? "The website"}
              </p>
              {entry.note ? (
                <p className="mt-2 whitespace-pre-wrap text-foreground">{entry.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
