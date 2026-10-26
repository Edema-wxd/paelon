import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers (master spec §14, backend spec §18).
 *
 * Runs on the Edge runtime, so it must stay fast and must not touch the
 * database. It also redirects signed-out requests away from `/admin/*`; see
 * `adminLoginRedirect`.
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
function contentSecurityPolicy(nonce: string, pathname: string): string {
  const umami = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
  const umamiOrigin = umami ? safeOrigin(umami) : null;
  const umamiCollector = umamiCollectorOrigin(umamiOrigin);

  /*
   * frame-src stays 'none' everywhere except /admin (spec §9, §14 Headers).
   *
   * /admin/analytics frames an Umami share page, and that is the only frame the
   * site has. Allowlisting its origin globally would let any injected markup on
   * a public template open a frame there, so the directive is built per request
   * from the pathname instead — the middleware already runs on every request
   * and `nextUrl.pathname` costs nothing.
   *
   * Taken from the share URL rather than the script URL: the two can be
   * different hosts, and a share link on a CDN or a separate Umami domain is a
   * normal deployment.
   */
  const share = process.env.NEXT_PUBLIC_UMAMI_SHARE_URL;
  const shareOrigin = share ? safeOrigin(share) : null;
  const framesUmami =
    shareOrigin !== null && (pathname === "/admin" || pathname.startsWith("/admin/"));

  const directives: string[] = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${umamiOrigin ? ` ${umamiOrigin}` : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://utfs.io https://*.ufs.sh`,
    `font-src 'self'`,
    `connect-src 'self'${umamiOrigin ? ` ${umamiOrigin}` : ""}${umamiCollector ? ` ${umamiCollector}` : ""} ${UPLOADTHING_ORIGINS}`,
    `frame-src ${framesUmami ? shareOrigin : "'none'"}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}

/**
 * Origins the browser-side uploader talks to (`connect-src`).
 *
 * The flow is: the uploader asks our own `/api/uploadthing` route for a
 * presigned URL (same-origin, already covered by `'self'`), then `PUT`s the
 * file straight to UploadThing's regional ingest host — `<region>.ingest.
 * uploadthing.com`, the region coming from `UPLOADTHING_TOKEN`, which is why
 * this is a wildcard rather than one host. `*.ufs.sh` is the CDN the uploaded
 * object is served from; `img-src` already allows it, and `connect-src` needs
 * it too for a client that reads a just-uploaded file back.
 *
 * `api.uploadthing.com` is deliberately absent: that is the server-side API
 * `UTApi` calls, and nothing in the browser should reach it.
 *
 * Not conditional on an env var, unlike Umami: the admin uploader is part of
 * the panel on every deployment, and a CSP that depends on configuration to be
 * correct is a CSP that breaks on the one box where it was forgotten.
 */
const UPLOADTHING_ORIGINS = "https://*.ingest.uploadthing.com https://*.ufs.sh";

/**
 * Where the Umami tracker sends its events, when that is not the script's own
 * origin.
 *
 * A self-hosted Umami serves `script.js` and receives `/api/send` on one host,
 * which `umamiOrigin` already covers. Umami Cloud does not: the script comes
 * from `cloud.umami.is` and posts to `https://gateway.umami.is/api/send` — read
 * from the script itself on 2026-10-26, where it is the default when no
 * `data-host-url` is set. Without this entry every event is refused once the
 * policy is enforced.
 */
const UMAMI_CLOUD_SCRIPT_ORIGIN = "https://cloud.umami.is";
const UMAMI_CLOUD_COLLECTOR_ORIGIN = "https://gateway.umami.is";

function umamiCollectorOrigin(scriptOrigin: string | null): string | null {
  return scriptOrigin === UMAMI_CLOUD_SCRIPT_ORIGIN ? UMAMI_CLOUD_COLLECTOR_ORIGIN : null;
}

/** Origin of a URL, or null if it is unparseable — never throw in middleware. */
function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Auth.js session cookie names. `__Secure-` in production (`useSecureCookies`
 * in `lib/auth/config.ts`), unprefixed in development, and suffixed `.0`, `.1`…
 * when a large JWT is split across chunks.
 */
const SESSION_COOKIE = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/;

/**
 * Send a signed-out request for `/admin/*` to the login page, keeping where it
 * was headed in `?next=` (spec §8 Access, decision A5).
 *
 * Defence in depth only. This checks that a session cookie is *present*, never
 * that it is valid: the edge cannot verify role, lock state or whether the
 * account still exists. A forged or expired cookie passes here and is refused
 * by `requireAdminUser()` in the dashboard layout and `requireCan()` in every
 * action and route handler, which remain the real control.
 */
function adminLoginRedirect(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/admin/login" || pathname.startsWith("/admin/login/");
  if (!isAdmin || isLogin) return null;

  const hasSession = request.cookies
    .getAll()
    .some((cookie) => SESSION_COOKIE.test(cookie.name) && cookie.value !== "");
  if (hasSession) return null;

  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

/**
 * Next's draft-mode cookie. Set only by `/api/preview`, which admits nobody
 * without a session and `read` on the resource (spec §8 Content editing).
 */
const DRAFT_COOKIE = "__prerender_bypass";

/**
 * Keep an unpublished page out of caches and out of search.
 *
 * Draft mode renders drafts on the site's real URLs, so a preview link that gets
 * forwarded, or a CDN that treats the page as ordinary HTML, would publish
 * content nobody published. `noindex` cannot be left to page metadata: a draft
 * reaches templates whose `generateMetadata` says `index`, and this one header
 * covers every response — pages, RSC payloads and all — from the one place that
 * sees the cookie.
 *
 * Presence of the cookie is the whole test. Whether the value is a valid bypass
 * token is Next's business; a request carrying a stale one gets the published
 * page, and sending these headers with it is harmless.
 */
function draftHeaders(request: NextRequest, response: NextResponse): void {
  if (!request.cookies.has(DRAFT_COOKIE)) return;

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store, must-revalidate");
}

/**
 * Keep a whole deployment out of search: a client review build, a preview, or
 * anything else that should be reachable by link but never indexed.
 *
 * A header rather than `Disallow: /` in robots.txt, because a disallowed URL
 * can still be indexed from inbound links, and a crawler that is not allowed
 * to fetch a page never sees its `noindex`. Off unless `SITE_NOINDEX=true`.
 */
function siteNoindexHeaders(response: NextResponse): void {
  if (process.env.SITE_NOINDEX !== "true") return;

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
}

export function middleware(request: NextRequest): NextResponse {
  // crypto.randomUUID is available on the Edge runtime and is cheap enough to
  // run per request.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, request.nextUrl.pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // The redirect still carries the security headers below.
  const response =
    adminLoginRedirect(request) ??
    NextResponse.next({ request: { headers: requestHeaders } });

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

  siteNoindexHeaders(response);
  draftHeaders(request, response);

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
