import { z } from "zod";

/**
 * Environment parsing. Fail-fast at boot on missing or malformed required vars,
 * per backend spec §18 and master spec §14.
 *
 * Two rules this module exists to enforce:
 *  - The raw `process.env` is never exported. Only the parsed, typed objects.
 *  - Server-only values are never reachable from a client component. `env` is
 *    guarded by a runtime check; `clientEnv` holds only `NEXT_PUBLIC_*` values
 *    and is safe to import anywhere.
 *
 * Never log any value from here (master spec §14).
 */

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

/** Optional string that treats "" the same as absent — .env files are full of empty keys. */
const optionalString = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v.trim()))
  .optional();

const serverSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // --- Database (Neon) ---
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_URL_UNPOOLED: optionalString,

    // --- Auth (Phase 2 — not consumed in Phase 1) ---
    AUTH_SECRET: optionalString,
    AUTH_URL: optionalString,

    // --- Uploads (Phase 2) ---
    UPLOADTHING_SECRET: optionalString,
    UPLOADTHING_APP_ID: optionalString,

    // --- Email ---
    RESEND_ENABLED: booleanFromString,
    RESEND_API_KEY: optionalString,
    RESEND_FROM_EMAIL: optionalString,

    // --- Branch booking inboxes (Phase 1 fallback for locations.booking_email) ---
    BRANCH_VI_EMAIL: optionalString,
    BRANCH_IKEJA_EMAIL: optionalString,
    BRANCH_MOSHOOD_EMAIL: optionalString,
    BRANCH_DELTA_EMAIL: optionalString,

    // --- WhatsApp ---
    WHATSAPP_PROVIDER: optionalString,
    WHATSAPP_API_KEY: optionalString,

    // --- Operational ---
    RATE_LIMIT_SALT: z
      .string()
      .min(16, "RATE_LIMIT_SALT must be at least 16 characters"),
    JOBS_SECRET: optionalString,
    DPO_EMAIL: optionalString,
    CONSENT_TEXT_VERSION: z.string().default("2026-01-v1"),
  })
  .superRefine((v, ctx) => {
    if (v.RESEND_ENABLED && !v.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when RESEND_ENABLED=true",
      });
    }
    if (v.RESEND_ENABLED && !v.RESEND_FROM_EMAIL) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_FROM_EMAIL"],
        message: "RESEND_FROM_EMAIL is required when RESEND_ENABLED=true",
      });
    }
  });

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_UMAMI_SCRIPT_URL: optionalString,
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: optionalString,
  NEXT_PUBLIC_WHATSAPP_NUMBER: optionalString,
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

/**
 * Client env. Only `NEXT_PUBLIC_*` values, so this is safe in a client bundle.
 * Next.js inlines these at build time, which is why each key is written out in
 * full rather than read dynamically.
 */
export const clientEnv: ClientEnv = clientSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_UMAMI_SCRIPT_URL: process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
});

let cached: ServerEnv | undefined;

/**
 * Parsed server env. Throws on first access if required vars are missing, with
 * the offending keys named but never their values.
 *
 * Lazy rather than eager so that importing a module which merely *mentions*
 * server env (a type import, a test helper) does not blow up a client build.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser. Use clientEnv.");
  }

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const keys = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment configuration:\n  ${keys}`);
  }

  cached = parsed.data;
  return cached;
}

/** Reset the memoised env. Test-only. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
