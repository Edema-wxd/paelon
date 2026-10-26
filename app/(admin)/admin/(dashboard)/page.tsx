import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { BookingStatusBadge } from "@/components/admin/booking-status-badge";
import { ContactHandledBadge } from "@/components/admin/contact-handled-badge";
import { BOOKING_STATUS_LABELS } from "@/lib/admin/booking-view";
import { can } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  getBookingQuickStats,
  getInboxCounts,
  listRecentBookings,
  listRecentContactSubmissions,
  OPEN_BOOKING_STATUSES,
  OPEN_CORPORATE_STATUSES,
} from "@/lib/db/queries/dashboard";
import type { BookingStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * Admin overview (spec §8 dashboard).
 *
 * Built to answer one question on arrival: what is waiting on someone? The
 * "Needs attention" row comes first and every tile links to its queue already
 * filtered, so the overview is a launch point rather than a report. The
 * booking pipeline and the two recent lists follow.
 *
 * Every block is gated on `can()` for its own resource, so a role that cannot
 * read bookings never sees a booking count, patient name or reference — not
 * even a zero. All queries fire together via `Promise.all`, and none is cached
 * across requests (booking and contact data are personal and mutable). The
 * inbox counts are shared with the layout's sidebar badges through `cache()`.
 */

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false, nocache: true },
};

/** The working path a booking moves along, then the two ways it can leave it. */
const PIPELINE: BookingStatus[] = ["new", "contacted", "confirmed", "completed"];
const EXITS: BookingStatus[] = ["no_show", "cancelled"];

/** Paelon's clock, whatever region the server runs in. */
const TIME_ZONE = "Africa/Lagos";

function statusQuery(statuses: readonly string[]): string {
  return statuses.map((status) => `status=${status}`).join("&");
}

function formatReceived(value: Date): string {
  return value.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

export default async function AdminOverviewPage() {
  const user = await requireAdminUser();

  const canReadBookings = can(user.role, "read", "bookings");
  const canReadContact = can(user.role, "read", "contact_submissions");
  const canReadCorporate = can(user.role, "read", "corporate_enquiries");

  const [counts, recentBookings, bookingStats, recentContact] = await Promise.all([
    getInboxCounts(canReadBookings, canReadContact, canReadCorporate),
    canReadBookings ? listRecentBookings() : Promise.resolve(null),
    canReadBookings ? getBookingQuickStats() : Promise.resolve(null),
    canReadContact ? listRecentContactSubmissions() : Promise.resolve(null),
  ]);

  const today = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  });

  const attention = [
    counts.newBookings !== null && {
      label: "New bookings to contact",
      value: counts.newBookings,
      href: "/admin/bookings?status=new",
    },
    bookingStats && {
      label: "Open bookings with no owner",
      value: bookingStats.unassigned,
      href: `/admin/bookings?assignee=unassigned&${statusQuery(OPEN_BOOKING_STATUSES)}`,
    },
    counts.openContact !== null && {
      label: "Contact messages to answer",
      value: counts.openContact,
      href: "/admin/contact?handled=false",
    },
    counts.openCorporate !== null && {
      label: "Open corporate enquiries",
      value: counts.openCorporate,
      href: `/admin/corporate-enquiries?${statusQuery(OPEN_CORPORATE_STATUSES)}`,
    },
  ].filter((tile): tile is { label: string; value: number; href: string } => Boolean(tile));

  const firstName = (user.name || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <p className="text-sm text-muted-foreground">{today}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-primary">
          {firstName ? `Welcome back, ${firstName}` : "Overview"}
        </h1>
      </header>

      {attention.length > 0 ? (
        <section aria-labelledby="attention-heading" className="mt-8">
          <h2 id="attention-heading" className="text-base font-semibold text-primary">
            Needs attention
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {attention.map((tile) => (
              <li key={tile.href}>
                <AttentionTile {...tile} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bookingStats ? (
        <section aria-labelledby="pipeline-heading" className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="pipeline-heading" className="text-base font-semibold text-primary">
              Booking pipeline
            </h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-primary tabular-nums">
                {bookingStats.newLast7Days}
              </span>{" "}
              received in the last 7 days
            </p>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
            <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
              {[...PIPELINE, ...EXITS].map((status) => (
                <PipelineStage
                  key={status}
                  status={status}
                  value={bookingStats.byStatus[status] ?? 0}
                  muted={EXITS.includes(status)}
                />
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {recentBookings ? (
        <section aria-labelledby="recent-bookings-heading" className="mt-10">
          <SectionHeader
            id="recent-bookings-heading"
            title="Recent bookings"
            href="/admin/bookings"
            linkLabel="All bookings"
          />
          {recentBookings.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 sm:px-4 font-medium">Reference</th>
                    <th scope="col" className="px-3 py-2.5 sm:px-4 font-medium">Patient</th>
                    <th scope="col" className="hidden px-3 py-2.5 sm:px-4 font-medium md:table-cell">Branch</th>
                    <th scope="col" className="hidden px-3 py-2.5 sm:px-4 font-medium sm:table-cell">Received</th>
                    <th scope="col" className="px-3 py-2.5 sm:px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentBookings.map((booking) => (
                    <tr key={booking.id} className="transition-colors duration-150 hover:bg-secondary/50">
                      <td className="px-3 py-2.5 sm:px-4 whitespace-nowrap">
                        <Link
                          href={`/admin/bookings/${booking.id}`}
                          className="font-medium text-accent tabular-nums underline-offset-4 hover:underline"
                        >
                          {booking.reference}
                        </Link>
                      </td>
                      <td className="max-w-48 truncate px-3 py-2.5 sm:px-4 text-primary">
                        {booking.patientName ?? "Unnamed patient"}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:px-4 text-muted-foreground md:table-cell">
                        {booking.locationName}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:px-4 whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                        <time dateTime={booking.createdAt.toISOString()}>
                          {formatReceived(booking.createdAt)}
                        </time>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4">
                        <BookingStatusBadge status={booking.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyNote>No bookings yet. They appear here as patients book online.</EmptyNote>
          )}
        </section>
      ) : null}

      {recentContact ? (
        <section aria-labelledby="recent-contact-heading" className="mt-10">
          <SectionHeader
            id="recent-contact-heading"
            title="Recent contact messages"
            href="/admin/contact"
            linkLabel="All contact messages"
          />
          {recentContact.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {recentContact.map((submission) => (
                <li
                  key={submission.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 sm:px-4 text-sm"
                >
                  <Link
                    href={`/admin/contact/${submission.id}`}
                    className="min-w-0 flex-1 basis-full truncate font-medium text-accent underline-offset-4 hover:underline sm:basis-0"
                  >
                    {submission.subject}
                  </Link>
                  <span className="text-primary">{submission.name ?? "Anonymous"}</span>
                  <time
                    dateTime={submission.createdAt.toISOString()}
                    className="text-muted-foreground tabular-nums"
                  >
                    {formatReceived(submission.createdAt)}
                  </time>
                  <ContactHandledBadge handled={submission.handled} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>No contact messages yet.</EmptyNote>
          )}
        </section>
      ) : null}
    </div>
  );
}

function AttentionTile({ label, value, href }: { label: string; value: number; href: string }) {
  const clear = value === 0;

  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full flex-col justify-between gap-4 rounded-lg border bg-surface p-4 transition-[border-color,transform] duration-150 ease-out active:scale-[0.98]",
        clear ? "border-border" : "border-accent/30 hover:border-accent",
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-end justify-between">
        {clear ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <CheckCircle2 aria-hidden className="size-4 text-emerald-700" />
            All clear
          </span>
        ) : (
          <span className="text-3xl font-semibold text-primary tabular-nums">{value}</span>
        )}
        <ArrowRight
          aria-hidden
          className="size-4 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-accent"
        />
      </span>
    </Link>
  );
}

function PipelineStage({
  status,
  value,
  muted,
}: {
  status: BookingStatus;
  value: number;
  muted: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className={cn("text-xs", muted ? "text-muted-foreground" : "text-primary")}>
        <Link
          href={`/admin/bookings?status=${status}`}
          className="underline-offset-4 hover:underline"
        >
          {BOOKING_STATUS_LABELS[status]}
        </Link>
      </dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          value === 0 ? "text-muted-foreground" : "text-primary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SectionHeader({
  id,
  title,
  href,
  linkLabel,
}: {
  id: string;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-base font-semibold text-primary">
        {title}
      </h2>
      <Link
        href={href}
        className="text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
