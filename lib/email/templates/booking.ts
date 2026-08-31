import type { EmailMessage } from "@/lib/email/send";

import { definitionList, definitionText, esc, p, wrapHtml } from "./layout";

/**
 * Booking emails.
 *
 * Neither template includes `reason_for_visit`. It is free-text symptom data —
 * health data, the most sensitive NDPR category — and per Francis's decision it
 * stays in the database, where access is controlled, rather than propagating
 * into inboxes, mail archives, and backups. Branch staff read it on the Phase 2
 * admin record.
 */

export interface BookingEmailData {
  reference: string;
  locationName: string;
  serviceName: string | null;
  serviceFamilyLabel: string;
  preferredDate: string;
  preferredTimeWindowLabel: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  existingPatient: boolean;
  hmoName: string | null;
  hmoPlan: string | null;
}

/**
 * Confirmation to the patient.
 *
 * The copy must not imply a confirmed slot: Phase 1 has no availability check,
 * so this is an acknowledged *request* (master spec §17).
 */
export function bookingPatientEmail(
  data: BookingEmailData,
  contactPhone: string,
): EmailMessage {
  const details: [string, string][] = [
    ["Reference", data.reference],
    ["Branch", data.locationName],
    ["Service", data.serviceName ?? data.serviceFamilyLabel],
    ["Preferred date", data.preferredDate],
    ["Preferred time", data.preferredTimeWindowLabel],
  ];

  const bodyHtml = [
    p(`Hello ${esc(data.patientName)},`),
    p(
      "Thank you for your appointment request. We have received it and a member of our team will contact you within 4 business hours during clinic hours to confirm a time.",
    ),
    definitionList(details),
    p(
      `This is a request, not a confirmed appointment. If you need us sooner, please call <strong>${esc(contactPhone)}</strong>.`,
    ),
  ].join("");

  const text = [
    `Hello ${data.patientName},`,
    "",
    "Thank you for your appointment request. We have received it and a member of our team will contact you within 4 business hours during clinic hours to confirm a time.",
    "",
    definitionText(details),
    "",
    "This is a request, not a confirmed appointment.",
    `If you need us sooner, please call ${contactPhone}.`,
    "",
    "Paelon Memorial Hospital",
  ].join("\n");

  return {
    to: data.patientEmail,
    subject: `Your appointment request — ${data.reference}`,
    html: wrapHtml({ title: "Appointment request received", bodyHtml }),
    text,
  };
}

/** Notification to the branch inbox. */
export function bookingBranchEmail(
  data: BookingEmailData,
  to: string,
): EmailMessage {
  const details: [string, string][] = [
    ["Reference", data.reference],
    ["Branch", data.locationName],
    ["Service", data.serviceName ?? data.serviceFamilyLabel],
    ["Preferred date", data.preferredDate],
    ["Preferred time", data.preferredTimeWindowLabel],
    ["Patient", data.patientName],
    ["Phone", data.patientPhone],
    ["Email", data.patientEmail],
    ["Existing patient", data.existingPatient ? "Yes" : "No"],
    ["HMO", data.hmoName ?? "None / paying privately"],
    ...(data.hmoPlan ? ([["HMO plan", data.hmoPlan]] as [string, string][]) : []),
  ];

  const bodyHtml = [
    p("<strong>New appointment request from the website.</strong>"),
    definitionList(details),
    p(
      "The patient's stated reason for visit is recorded against this booking in the system and is deliberately not included in this email.",
    ),
    p("Please contact the patient within 4 business hours."),
  ].join("");

  const text = [
    "New appointment request from the website.",
    "",
    definitionText(details),
    "",
    "The patient's stated reason for visit is recorded against this booking in the system and is deliberately not included in this email.",
    "",
    "Please contact the patient within 4 business hours.",
  ].join("\n");

  return {
    to,
    subject: `New booking ${data.reference} — ${data.locationName}`,
    html: wrapHtml({ title: "New appointment request", bodyHtml }),
    text,
    replyTo: data.patientEmail,
  };
}
