import type { ResourceConfig } from "@/lib/admin/resource-config";

import { awardResource } from "./awards";
import { faqResource } from "./faqs";

/**
 * The client-safe half of the resource registry.
 *
 * A config cannot be passed from a server component to a client one: it holds
 * a Zod schema and functions, and neither survives serialisation. So a page
 * passes the *name* and `resource-form.tsx` looks the config up here.
 *
 * Nothing in this module's import graph may touch the database. A value import
 * of a repository would drag the Neon driver into the browser bundle — the
 * same rule `lib/content.ts` carries for the marketing site.
 *
 * The server half — tables, cache tags, repositories — is
 * `lib/admin/resources/server.ts`, and the form never imports it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the registry is
   heterogeneous by design: each entry has its own row and schema type, which a
   lookup by string cannot preserve. Call sites narrow through the per-resource
   exports (`faqResource`, `awardResource`) when they need the real types. */
export const RESOURCES = {
  faqs: faqResource,
  awards: awardResource,
} satisfies Record<string, ResourceConfig<any, any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The resources the CRUD kit currently drives. */
export type ResourceName = keyof typeof RESOURCES;

export const RESOURCE_NAMES = Object.keys(RESOURCES) as ResourceName[];

export function isResourceName(value: string): value is ResourceName {
  return (RESOURCE_NAMES as string[]).includes(value);
}

export { awardResource, faqResource };
