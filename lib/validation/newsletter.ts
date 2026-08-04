import { z } from "zod";

/**
 * Newsletter signup. Shared by the client form (UX) and the route handler
 * (truth) so the two can never drift — spec §7 validation rule, applied to
 * every form boundary per CLAUDE.md.
 */
export const newsletterSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  name: z.string().trim().max(100, "Name is too long.").optional(),
  /**
   * NDPR (spec §14) requires explicit, non-pre-checked consent on every form
   * collecting personal data. `literal(true)` means an unticked box fails
   * validation rather than silently submitting.
   */
  consent_ndpr: z.literal(true, {
    message: "Please confirm you agree to the privacy policy.",
  }),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;
