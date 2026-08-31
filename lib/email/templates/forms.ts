import type { EmailMessage } from "@/lib/email/send";

import { definitionList, definitionText, esc, p, wrapHtml } from "./layout";

/** Acknowledgement to someone who used the contact form. */
export function contactReceiptEmail(data: {
  name: string;
  email: string;
  subject: string;
}): EmailMessage {
  const bodyHtml = [
    p(`Hello ${esc(data.name)},`),
    p(
      `We have received your message about &ldquo;${esc(data.subject)}&rdquo; and will reply as soon as we can.`,
    ),
    p("If your matter is urgent or clinical, please call us instead."),
  ].join("");

  return {
    to: data.email,
    subject: "We have received your message",
    html: wrapHtml({ title: "We have received your message", bodyHtml }),
    text: [
      `Hello ${data.name},`,
      "",
      `We have received your message about "${data.subject}" and will reply as soon as we can.`,
      "",
      "If your matter is urgent or clinical, please call us instead.",
      "",
      "Paelon Memorial Hospital",
    ].join("\n"),
  };
}

/** Internal notification for a corporate healthcare enquiry. */
export function corporateNotificationEmail(
  data: {
    companyName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    companySizeLabel: string;
    sector: string;
    currentProvider: string | null;
    requirements: string;
  },
  to: string,
): EmailMessage {
  const details: [string, string][] = [
    ["Company", data.companyName],
    ["Contact", data.contactName],
    ["Email", data.contactEmail],
    ["Phone", data.contactPhone],
    ["Company size", data.companySizeLabel],
    ["Sector", data.sector],
    ["Current provider", data.currentProvider ?? "Not stated"],
  ];

  const bodyHtml = [
    p("<strong>New corporate healthcare enquiry.</strong>"),
    definitionList(details),
    p(`<strong>Requirements</strong><br>${esc(data.requirements)}`),
  ].join("");

  return {
    to,
    subject: `Corporate enquiry: ${data.companyName}`,
    html: wrapHtml({ title: "New corporate enquiry", bodyHtml }),
    text: [
      "New corporate healthcare enquiry.",
      "",
      definitionText(details),
      "",
      "Requirements:",
      data.requirements,
    ].join("\n"),
    replyTo: data.contactEmail,
  };
}

/**
 * Double opt-in confirmation.
 *
 * The link is a GET to a confirmation *page* carrying the token, not to an
 * endpoint that confirms on load. Email clients and security scanners prefetch
 * links, which would silently confirm subscriptions nobody clicked; the page
 * asks for an explicit button press, which POSTs.
 */
export function newsletterConfirmEmail(data: {
  email: string;
  name: string | null;
  confirmUrl: string;
}): EmailMessage {
  const bodyHtml = [
    p(data.name ? `Hello ${esc(data.name)},` : "Hello,"),
    p(
      "Please confirm you would like to receive the Paelon Memorial Hospital newsletter.",
    ),
    `<p style="margin:0 0 20px;"><a href="${esc(data.confirmUrl)}" style="display:inline-block;background:#a02b3e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:15px;">Confirm subscription</a></p>`,
    p(
      `If the button does not work, open this link:<br><span style="word-break:break-all;">${esc(data.confirmUrl)}</span>`,
    ),
    p("If you did not request this, you can ignore this email. Nothing will happen."),
  ].join("");

  return {
    to: data.email,
    subject: "Confirm your newsletter subscription",
    html: wrapHtml({
      title: "Confirm your subscription",
      bodyHtml,
      footerHtml:
        "You received this because someone entered this address on paelonmemorial.com. No further email will be sent unless you confirm.",
    }),
    text: [
      data.name ? `Hello ${data.name},` : "Hello,",
      "",
      "Please confirm you would like to receive the Paelon Memorial Hospital newsletter by opening this link:",
      data.confirmUrl,
      "",
      "If you did not request this, you can ignore this email. Nothing will happen.",
    ].join("\n"),
  };
}
