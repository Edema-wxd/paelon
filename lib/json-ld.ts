/**
 * JSON for a `<script type="application/ld+json">` block, safe to inline.
 *
 * `JSON.stringify` does not escape `<`, so a value containing `</script>` ends
 * the block early and whatever follows runs as HTML — and these blocks carry
 * admin-edited content: FAQ answers, blog titles, service and doctor names.
 * Anyone with an editor account could have put a script on every public page
 * that showed their text. Escaping `<`, `>` and `&` as `<`-style unicode
 * escapes keeps the JSON identical once parsed while giving the HTML parser
 * nothing to end the element on. U+2028 and U+2029 are escaped too: valid in
 * JSON, they are line terminators to older JavaScript parsers.
 *
 * Every JSON-LD block on the site goes through this. A bare `JSON.stringify`
 * inside `dangerouslySetInnerHTML` is a bug.
 */

/** Characters that must not appear raw inside an inline script. */
const UNSAFE = new RegExp("[<>&\\u2028\\u2029]", "g");

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(
    UNSAFE,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
