/**
 * A post-login `next` value, reduced to a same-origin path, or `null`.
 *
 * A prefix check is not enough. Browsers read `/\evil.example` as
 * `//evil.example`, and strip tabs and newlines before parsing, so
 * `/\t/evil.example` lands in the same place — each of which turns an admin
 * login into a credible phishing page on the hospital's own domain. Parsing
 * against a throwaway origin and keeping the result only if the origin
 * survived catches every spelling the browser would, instead of the ones
 * someone thought of.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;

  const base = "http://same-origin.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return null;
  }

  if (url.origin !== base) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
