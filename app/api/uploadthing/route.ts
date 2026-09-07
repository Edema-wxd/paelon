import { createRouteHandler } from "uploadthing/next";

import { uploadRouter } from "@/lib/uploadthing/core";

/**
 * UploadThing route handler (spec §10).
 *
 * `GET` serves the router's permission config to the client uploader; `POST`
 * takes the upload. Both are refused by the middleware in
 * `lib/uploadthing/core.ts` unless uploads are explicitly enabled — see the
 * note there about why this fails closed in Phase 1.
 *
 * `robots.ts` already disallows `/api`, so nothing here is crawled.
 */
export const { GET, POST } = createRouteHandler({ router: uploadRouter });
