/**
 * Hand-written email templates (backend spec §10).
 *
 * No `@react-email/components`: it is not on master spec §2's approved list,
 * five transactional messages do not justify a dependency, and hospital
 * transactional mail should be plain and robust across old clients anyway.
 *
 * House rules for every template here:
 *  - a plain-text alternative alongside the HTML, always;
 *  - no external images and no tracking pixels (NDPR — master spec §14);
 *  - inline styles only, since email clients strip <style> blocks;
 *  - an unsubscribe link on anything marketing-flavoured.
 */

/**
 * Escape interpolated values for HTML.
 *
 * Every template runs user-supplied text through this. Patient names and
 * message bodies reach these templates directly, and an unescaped `<` in a
 * name would break the markup at best and inject at worst.
 */
export function esc(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRAND_NAVY = "#223645";
const BRAND_BG = "#f9f7f2";

/** Wrap body markup in the shared shell. `bodyHtml` must already be escaped. */
export function wrapHtml(options: {
  title: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:Helvetica,Arial,sans-serif;color:#111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
<tr><td>
<p style="margin:0 0 24px;font-size:18px;font-weight:bold;color:${BRAND_NAVY};">Paelon Memorial Hospital</p>
${options.bodyHtml}
</td></tr>
</table>
${
  options.footerHtml
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;padding:16px 32px;">
<tr><td style="font-size:12px;color:#555;line-height:1.5;">${options.footerHtml}</td></tr>
</table>`
    : ""
}
</td></tr>
</table>
</body>
</html>`;
}

/** A paragraph of already-escaped HTML. */
export function p(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${html}</p>`;
}

/** A label/value list. Values are escaped here; labels are template-authored. */
export function definitionList(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:#555;vertical-align:top;">${esc(label)}</td>` +
        `<td style="padding:6px 0;font-size:14px;color:#111;"><strong>${esc(value)}</strong></td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${cells}</table>`;
}

/** Render a label/value list as plain text. */
export function definitionText(rows: [string, string][]): string {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}
