import { draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { isResourceName } from "@/lib/admin/resources";
import { RESOURCE_SERVER } from "@/lib/admin/resources/server";
import { can } from "@/lib/auth/policy";
import { getAdminUser } from "@/lib/auth/session";
import { safePreviewPath } from "@/lib/preview/target";

export const runtime = "nodejs";

/**
 * Turn Next's draft mode on and land on the page being previewed
 * (spec §8 Content editing, decision C4).
 *
 * ## Order of checks
 *
 * Session, then permission, then the target. Authorisation comes first so the
 * guarantee is unconditional: an anonymous request cannot enable draft mode
 * whatever it puts in the query string, and there is no parameter combination
 * that reaches `enable()` before `can()` has said yes. §8 requires the
 * `read` check on the resource itself, which is why the resource travels in the
 * URL rather than being inferred from the path — a contributor has no `read` on
 * `services`, and inferring the resource would hand them the draft cookie for
 * one.
 *
 * ## Why it cannot be an open redirect
 *
 * This route sets a cookie and then sends the browser somewhere, which is the
 * shape of a useful phishing link: paelon's domain in the address bar, someone
 * else's page on the screen. The target is validated by `safePreviewPath` and
 * re-serialised from the site's own origin, never echoed. See that function for
 * what is refused and why.
 *
 * ## Caching
 *
 * `no-store` here and on the pages that follow — `middleware.ts` adds
 * `Cache-Control: no-store` and `X-Robots-Tag: noindex` to every response
 * carrying the draft cookie, so an unpublished page cannot be cached by a proxy
 * or indexed if a preview link leaks.
 */
export async function GET(request: NextRequest) {
  const user = await getAdminUser();

  if (!user) {
    // Draft mode is untouched. The session may simply have expired in a tab
    // that was left open, so this bounces to the login page carrying where it
    // was going; `?next=` is this route's own path and query, already encoded.
    const login = new URL("/admin/login", request.nextUrl.origin);
    login.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return noStore(NextResponse.redirect(login, 307));
  }

  const resource = request.nextUrl.searchParams.get("resource") ?? "";

  if (!isResourceName(resource)) {
    return refuse(400, "Preview needs a content type this panel edits.");
  }

  if (!can(user.role, "read", RESOURCE_SERVER[resource].permission)) {
    // Same wording as `assertCan`: the message never says which role would
    // have worked.
    return refuse(403, `Not permitted: read on ${resource}.`);
  }

  const target = safePreviewPath(
    request.nextUrl.searchParams.get("path") ?? "",
  );

  if (target === null) {
    return refuse(400, "That preview target is not a page on this site.");
  }

  (await draftMode()).enable();

  return noStore(
    NextResponse.redirect(new URL(target, request.nextUrl.origin), 307),
  );
}

/**
 * Plain text, not the `lib/api/response` envelope: nothing calls this with
 * `fetch`. It is a link an editor clicked, and what they need is a sentence in
 * the browser window.
 */
function refuse(status: 400 | 403, message: string): NextResponse {
  return noStore(
    new NextResponse(`${message}\n`, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }),
  );
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
