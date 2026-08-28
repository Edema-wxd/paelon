import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

/**
 * Standard API envelope (backend spec §8). Every public route handler returns
 * one of these shapes and nothing else, so the frontend has exactly one
 * response contract to code against.
 *
 * `message` is user-facing copy. Stack traces, driver errors, SQL, and env
 * values never appear in it — an internal failure is logged in full and
 * reported to the client as a generic message.
 */

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "INTERNAL";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string[]>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  BAD_REQUEST: 400,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  options: { fields?: Record<string, string[]>; headers?: HeadersInit } = {},
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(options.fields ? { fields: options.fields } : {}),
      },
    },
    { status: STATUS[code], headers: options.headers },
  );
}

/**
 * Terminal error handler. Logs the real cause with an event name, returns a
 * generic message. Call this rather than letting an exception escape a handler,
 * which would surface a framework error page instead of the envelope.
 */
export function internalError(
  event: string,
  error: unknown,
): NextResponse<ApiFailure> {
  logger.error(event, { error });
  return fail(
    "INTERNAL",
    "Something went wrong on our side. Please try again shortly.",
  );
}

/** 429 with a `Retry-After` header, which well-behaved clients honour. */
export function rateLimited(retryAfterSeconds: number): NextResponse<ApiFailure> {
  return fail("RATE_LIMITED", "Too many requests. Please try again later.", {
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

/** Parse a JSON body, returning null rather than throwing on malformed input. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
