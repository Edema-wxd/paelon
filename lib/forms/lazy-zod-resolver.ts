import type { FieldValues, Resolver } from "react-hook-form";

/**
 * A react-hook-form resolver whose Zod schema is downloaded on demand.
 *
 * Client-side Zod validation is required on every public form (CLAUDE.md:
 * client for UX, server for truth), but Zod's core is ~14 kB gzipped whichever
 * API imports it. Imported statically, it sat in the first-load JS of every
 * page with a form — the newsletter form alone put `/`, `/contact` and `/blog`
 * at or over the 150 kB budget (spec §13). Loaded here instead, it arrives
 * after the page is interactive: `preload()` fetches it when the browser is
 * idle, so by the time anyone submits it is already there.
 *
 * `load` is written at the call site as dynamic imports of the resolver and
 * the schema module, so the schema is still the one the route handler parses
 * — nothing is duplicated, and the types are exactly `zodResolver(schema)`'s.
 *
 * If the chunk cannot be fetched (offline mid-session, a deploy that removed
 * it), validation is skipped and the values go to the server, which validates
 * them anyway. A form that silently refuses to submit is worse than one whose
 * errors come back one round trip later.
 *
 * Call it at module scope, not inside a component, so every instance of a
 * form shares one download.
 */
export function lazyZodResolver<
  TFieldValues extends FieldValues,
  TContext,
  TTransformedValues,
>(
  load: () => Promise<Resolver<TFieldValues, TContext, TTransformedValues>>,
): {
  resolver: Resolver<TFieldValues, TContext, TTransformedValues>;
  preload: () => void;
} {
  let pending: Promise<Resolver<TFieldValues, TContext, TTransformedValues>> | null = null;

  const get = () => {
    pending ??= load().catch((error: unknown) => {
      // Let the next attempt try again rather than caching the failure.
      pending = null;
      throw error;
    });
    return pending;
  };

  const resolver: Resolver<TFieldValues, TContext, TTransformedValues> = async (
    values,
    context,
    options,
  ) => {
    let resolve: Resolver<TFieldValues, TContext, TTransformedValues>;
    try {
      resolve = await get();
    } catch {
      // The server is the truth; let it answer. The cast is the passthrough:
      // without a schema there is no transform, so the output is the input.
      return { values: values as unknown as TTransformedValues, errors: {} };
    }
    return resolve(values, context, options);
  };

  return {
    resolver,
    preload: () => {
      void get().catch(() => {
        // Nothing to do: `resolver` retries, and falls back if it fails again.
      });
    },
  };
}

/**
 * Run `preload` once the browser is idle, so the download never competes with
 * the page's own loading. Returns a cleanup for `useEffect`.
 */
export function preloadWhenIdle(preload: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(preload, { timeout: 4000 });
    return () => window.cancelIdleCallback(handle);
  }
  // Safari has no requestIdleCallback; a short delay keeps it off the load path.
  const handle = window.setTimeout(preload, 2000);
  return () => window.clearTimeout(handle);
}
