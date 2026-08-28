import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers (master spec §14, backend spec §18).
 *
 * Runs on the Edge runtime, so it must stay fast and must not touch the
 * database. Phase 2's admin guard will read the session cookie's *presence*
 * here and do real authorisation server-side in the route.
 */

/**
 * CSP is shipped in **report-only** first (backend spec §18).
 *
 * A strict CSP that blocks a real script is a broken site, and the only honest
 * way to find those cases is to observe violations on real traffic before
 * enforcing. Flip `CSP_ENFORCE` to true once the report endpoint has been quiet
 * across every template — not before.
 */
const CSP_ENFORCE = false;

/**
 * Build the policy for one request.
 *
 * `nonce` is generated per request and passed down via a request header so
 * Next.js can attach it to its own inline bootstrap scripts. `'unsafe-inline'`
 * on `script-src` would defeat the entire point of the policy, so it is not
 * used; modern browsers ignore `'unsafe-inline'` when a nonce is present, and
 * `'strict-dynamic'` lets Next's bootstrap load its chunks.
 *
 * `style-src 'unsafe-inline'` is retained: Tailwind and Next both inject inline
 * styles, and there is no nonce path for them today. This is the standard,
 * accepted exception — inline *styles* are a far smaller surface than inline
 * scripts.
 *
 * TODO(francis): the location-page map provider is undecided (backend spec
 * §18/§25) and no map origin is allowlisted here. This is deliberate — adding a
 * Google Maps embed would set third-party cookies and undermine master spec
 * §14's "no cookie banner required" position. A static map image plus a "get
 * directions" link avoids the CSP entry, the performance budget cost, and the
 * cookie-consent question together.
 */
function contentSecurityPolicy(nonce: string): string {
  const umami = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
  const umamiOrigin = umami ? safeOrigin(umami) : null;

  const directives: string[] = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${umamiOrigin ? ` ${umamiOrigin}` : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://utfs.io https://*.ufs.sh`,
    `font-src 'self'`,
    `connect-src 'self'${umamiOrigin ? ` ${umamiOrigin}` : ""}`,
    // frame-src is intentionally 'none' in Phase 1. Phase 2's /admin/analytics
    // embeds Umami and will need its origin added here.
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}

/** Origin of a URL, or null if it is unparseable — never throw in middleware. */
function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest): NextResponse {
  // crypto.randomUUID is available on the Edge runtime and is cheap enough to
  // run per request.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set(
    CSP_ENFORCE
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only",
    csp,
  );

  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );

  return response;
}

export const config = {
  /**
   * Everything except Next's own static output and image optimiser. Static
   * assets do not need a CSP and running middleware on them is wasted latency
   * on every page load.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2)$).*)",
  ],
};
