/**
 * Env for the unit suite.
 *
 * `lib/env.ts` fails fast on missing required vars, which is correct at boot but
 * means any test importing a module that reads env needs these present. Values
 * are obviously fake — nothing here connects to anything.
 */
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.RATE_LIMIT_SALT ??= "unit-test-salt-0123456789abcdef";
process.env.RESEND_ENABLED = "false";
process.env.CONSENT_TEXT_VERSION = "test-v1";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
