import { handlers } from "@/lib/auth/config";

/**
 * Auth.js endpoint. Handles sign-in, sign-out, session and CSRF.
 *
 * `robots.ts` already disallows `/api`, so none of it is crawled.
 *
 * Node runtime, not edge: `authorize` verifies an argon2id hash through a
 * native module and reads Postgres, neither of which runs on edge.
 */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
