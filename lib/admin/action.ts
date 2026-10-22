import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { requestIp, writeAudit, type AuditMetadata } from "@/lib/admin/audit";
import {
  can,
  canOnRow,
  type Action,
  type OwnedRow,
  type Resource,
} from "@/lib/auth/policy";
import { requireAdminUser, type AdminUser } from "@/lib/auth/session";

/**
 * The one way an admin mutation is built (spec §8).
 *
 * A server action is a public POST endpoint. Every one of them has to answer
 * the same questions in the same order, and the order is the point:
 *
 *   1. who are you              `requireAdminUser()` — redirects when signed out
 *   2. may your role do this    `can()` — before parsing, so a refused caller
 *                               learns nothing about the input shape. With no
 *                               `row` loader this is `canOnRow(..., {})`, so a
 *                               grant that depends on ownership is refused
 *                               here rather than after validation
 *   3. is the input valid       Zod — field errors come back for the form
 *   4. may you touch this row   `canOnRow()` — only with a `row` loader, and
 *                               only after parsing, because the row id is input
 *   5. do it                    the handler
 *   6. record it                one `audit_log` row, IP hashed, no PII
 *   7. refresh                  `revalidateTag` for public content,
 *                               `revalidatePath` for admin views, which are
 *                               uncached and have no tags
 *
 * A handler reports an expected refusal ("that account no longer exists") by
 * returning `fail()`. That skips steps 6 and 7 — nothing happened, so there is
 * nothing to record or refresh. An unexpected throw propagates untouched: it
 * must never be reported to the user as a permission or validation problem.
 *
 * This module is deliberately not `"use server"`. The actions built with it
 * live in `"use server"` files and are exported as `const`s.
 */

export type FieldErrors = Record<string, string[]>;

export interface ActionFailure<D = never> {
  ok: false;
  error: string;
  fields: FieldErrors;
  details?: D;
}

/** What a form renders. */
export type ActionResult<T, D = never> =
  | { ok: true; data: T }
  | ActionFailure<D>;

/** `useActionState` state: `null` before the first submission. */
export type ActionState<T, D = never> = ActionResult<T, D> | null;

/** The audit fields only the handler knows. */
export interface AuditDetails {
  entityId?: string | null;
  metadata?: AuditMetadata;
}

export interface HandlerSuccess<T> {
  ok: true;
  data: T;
  audit: AuditDetails;
}

/** Messages shown for the wrapper's own refusals. Never names a role. */
export const DENIED_MESSAGE = "You do not have permission to do that.";
export const INVALID_MESSAGE = "Check the highlighted fields.";
export const MISSING_MESSAGE = "That item no longer exists.";

/** A handler's success, with what the audit row should say about it. */
export function done<T>(data: T, audit: AuditDetails = {}): HandlerSuccess<T> {
  return { ok: true, data, audit };
}

/** A handler's expected refusal. Not audited, not revalidated. */
export function fail<D = never>(
  error: string,
  options: { fields?: FieldErrors; details?: D } = {},
): ActionFailure<D> {
  const failure: ActionFailure<D> = {
    ok: false,
    error,
    fields: options.fields ?? {},
  };
  if (options.details !== undefined) failure.details = options.details;
  return failure;
}

export interface AdminActionConfig<S extends z.ZodType, T> {
  resource: Resource;
  action: Action;
  schema: S;
  /** Audit event name. Defaults to `${resource}.${action}`. */
  event?: string;
  /** Cache tags to revalidate — `CACHE_TAGS` from `lib/db/queries/shared`. */
  tag?: string | readonly string[] | ((input: z.output<S>, data: T) => readonly string[]);
  /** Admin paths to revalidate so the view that submitted re-renders. */
  path?: string | readonly string[];
  /** Map the submission onto the schema's input. Defaults to `Object.fromEntries`. */
  input?: (formData: FormData) => unknown;
  /**
   * Load the ownership columns of the row being acted on, for `canOnRow()`.
   * Return `null` when it does not exist.
   */
  row?: (input: z.output<S>, user: AdminUser) => Promise<OwnedRow | null>;
}

function toList(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

/**
 * Build an admin server action. See the module comment for the order of checks.
 *
 * The returned function has the `useActionState` signature. `prev` is unused
 * but kept so forms can pass the action straight in.
 */
export function adminAction<S extends z.ZodType, T, D = never>(
  config: AdminActionConfig<S, T>,
  handler: (
    input: z.output<S>,
    context: { user: AdminUser },
  ) => Promise<HandlerSuccess<T> | ActionFailure<D>>,
): (prev: ActionState<T, D>, formData: FormData) => Promise<ActionResult<T, D>> {
  return async (_prev, formData) => {
    const user = await requireAdminUser();

    // Without a `row` loader there is no owner to check against, so an
    // ownership-scoped grant (a contributor's update or media delete) is judged
    // against an unowned row — a refusal — here, before parsing. `can()` alone
    // would let that caller through to validation and refuse them later.
    const permitted = config.row
      ? can(user.role, config.action, config.resource)
      : canOnRow(user, config.action, config.resource, {});
    if (!permitted) {
      return fail(DENIED_MESSAGE);
    }

    const raw = config.input ? config.input(formData) : Object.fromEntries(formData);
    const parsed = config.schema.safeParse(raw);
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      const fields: FieldErrors = {};
      for (const [key, messages] of Object.entries(fieldErrors)) {
        if (Array.isArray(messages) && messages.length > 0) fields[key] = messages;
      }
      return fail(INVALID_MESSAGE, { fields });
    }
    const input = parsed.data;

    if (config.row) {
      const row = await config.row(input, user);
      if (!row) return fail(MISSING_MESSAGE);
      if (!canOnRow(user, config.action, config.resource, row)) {
        return fail(DENIED_MESSAGE);
      }
    }

    const result = await handler(input, { user });
    if (!result.ok) return result;

    await writeAudit({
      userId: user.id,
      action: config.event ?? `${config.resource}.${config.action}`,
      entityType: config.resource,
      entityId: result.audit.entityId ?? null,
      metadata: result.audit.metadata,
      ip: await requestIp(),
    });

    const tags =
      typeof config.tag === "function"
        ? config.tag(input, result.data)
        : toList(config.tag);
    for (const tag of tags) revalidateTag(tag);
    for (const path of toList(config.path)) revalidatePath(path);

    return { ok: true, data: result.data };
  };
}
