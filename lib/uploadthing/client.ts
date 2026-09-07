import { generateReactHelpers } from "@uploadthing/react";

import type { UploadRouter } from "@/lib/uploadthing/core";

/**
 * Typed client helpers for the upload router.
 *
 * Only the hook is generated — not `UploadButton` or `UploadDropzone`. Those
 * ship their own stylesheet and expect a Tailwind plugin to theme them, which
 * would put a second, differently-shaped design system inside the admin panel
 * for one control. The hook gives the same upload behaviour and lets the
 * dropzone be built out of the same primitives as everything else.
 */
export const { useUploadThing } = generateReactHelpers<UploadRouter>();
