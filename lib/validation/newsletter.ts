import { z } from "zod";

import { antiSpamFields, email, ndprConsent } from "./primitives";

/**
 * Newsletter signup. Shared by the client form (UX) and the route handler
 * (truth) so the two can never drift — master spec §7 validation rule, applied
 * to every form boundary per CLAUDE.md.
 */
export const newsletterSchema = z.object({
  email,
  name: z
    .string()
    .trim()
    .max(100, "Name is too long.")
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  /**
   * NDPR (master spec §14) requires explicit, non-pre-checked consent on every
   * form collecting personal data. `literal(true)` means an unticked box fails
   * validation rather than silently submitting.
   */
  consentNdpr: ndprConsent,
  ...antiSpamFields,
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;

/**
 * Opaque token from a confirm/unsubscribe link. Length-bounded and
 * charset-bounded so a malformed link is rejected before it reaches the DB.
 */
export const newsletterTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(32, "This link is not valid.")
    .max(128, "This link is not valid.")
    .regex(/^[A-Za-z0-9_-]+$/, "This link is not valid."),
});

export type NewsletterTokenInput = z.infer<typeof newsletterTokenSchema>;
