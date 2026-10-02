import { draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { safePreviewPath } from "@/lib/preview/target";

export const runtime = "nodejs";

/**
 * Turn draft mode off again — the banner's exit link.
 *
 * No session check, on purpose. Leaving a preview is not a privileged action:
 * whoever holds the cookie is seeing unpublished content, and the one thing they
 * must always be able to do is stop. Requiring a session here would strand
 * anyone whose session expired mid-preview on a draft of the site.
 *
 * The page to return to comes from `Referer`, validated by the same
 * `safePreviewPath` the enabling route uses, so a crafted header cannot turn
 * this into a redirector either. No usable referrer — it is `strict-origin`
 * cross-origin, per the `Referrer-Policy` in `middleware.ts` — means the
 * homepage, which is always a safe place to land.
 */
export async function GET(request: NextRequest) {
  (await draftMode()).disable();

  const response = NextResponse.redirect(
    new URL(returnPath(request), request.nextUrl.origin),
    307,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function returnPath(request: NextRequest): string {
  const referer = request.headers.get("referer");
  if (!referer) return "/";

  try {
    const url = new URL(referer);
    if (url.origin !== request.nextUrl.origin) return "/";
    return safePreviewPath(`${url.pathname}${url.search}`) ?? "/";
  } catch {
    return "/";
  }
}
