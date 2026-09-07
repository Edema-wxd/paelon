"use client";

import { ErrorContent } from "@/components/site/error-content";

/**
 * Route-level error boundary — the site's 500 (CLAUDE.md, conversion and trust
 * baseline item 13). Catches anything thrown while rendering a page under
 * `app/`, including every marketing route, and replaces `{children}` inside
 * `app/layout.tsx` — so the skip link and `<body>` are still in place, but the
 * marketing header and footer are not, which is why `ErrorContent` brings its
 * own chrome.
 *
 * Nothing is logged from here on purpose. `lib/logger` writes through
 * `process.stderr`, which does not exist in a browser — importing it into this
 * boundary would make the boundary itself throw, escalating a recoverable page
 * error into a blank global error. Server errors are already logged
 * server-side; `error.digest` is the handle that ties the two together.
 *
 * The error message is never shown. It can carry a query, a connection string
 * fragment or a patient identifier, and a visitor can do nothing with it
 * anyway.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorContent reset={reset} digest={error.digest} />;
}
