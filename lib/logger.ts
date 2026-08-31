/**
 * Structured JSON logger. No dependency, no transport — one JSON line per event
 * on stdout/stderr, which Vercel captures today and any aggregator can ingest
 * after the self-hosting move (backend spec §13).
 *
 * Master spec §16 forbids `console.log` in shipped code. This module is the
 * single sanctioned writer; everything else calls `logger.*`.
 *
 * Never passed to this logger, at any level:
 *   env values · patient name, phone, email, DOB · reason_for_visit ·
 *   raw IP addresses · tokens · session cookies · password hashes
 *
 * Where a partial value genuinely aids debugging, use `redactEmail` /
 * `redactPhone` below rather than logging the raw value.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** `debug` is suppressed in production (backend spec §13). */
function minimumLevel(): number {
  return process.env.NODE_ENV === "production" ? LEVEL_RANK.info : LEVEL_RANK.debug;
}

/**
 * Errors do not serialise through `JSON.stringify` — `{}` is the usual result.
 * Unwrap to a plain object so a stack actually reaches the log.
 */
function serialiseError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(process.env.NODE_ENV === "production" ? {} : { stack: error.stack }),
    };
  }
  return { errorMessage: String(error) };
}

function emit(level: LogLevel, event: string, context: LogContext = {}): void {
  if (LEVEL_RANK[level] < minimumLevel()) return;

  const { error, ...rest } = context;

  const line = JSON.stringify({
    level,
    event,
    ts: new Date().toISOString(),
    ...rest,
    ...(error === undefined ? {} : serialiseError(error)),
  });

  // The single sanctioned console call in the codebase. `error` and `warn` go
  // to stderr so log routers can split severity without parsing.
  if (level === "error" || level === "warn") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug: (event: string, context?: LogContext) => emit("debug", event, context),
  info: (event: string, context?: LogContext) => emit("info", event, context),
  warn: (event: string, context?: LogContext) => emit("warn", event, context),
  error: (event: string, context?: LogContext) => emit("error", event, context),
};

/**
 * Mask an email to `f***@example.com`. Enough to correlate a support ticket
 * with a log line without putting the address in the log.
 */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "";

  const at = email.lastIndexOf("@");
  if (at < 1) return "***";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = local[0] ?? "";

  return `${first}***@${domain}`;
}

/** Mask a phone number to its last 4 digits: `+234********89`. */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "";

  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "***";

  return `***${digits.slice(-4)}`;
}
