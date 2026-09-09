"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Field, FieldError, OptionCard, describedBy } from "@/components/booking/field";
import type { HmoOption, StepProps } from "@/components/booking/types";
import { Input } from "@/components/ui/input";
import { searchHmos } from "@/lib/hmo-search";

/** Shown before anyone types, so the list is never an intimidating wall. */
const INITIAL_VISIBLE = 6;

/**
 * Step 5 — HMO (master spec §7). Entirely optional.
 *
 * "None / paying privately" is a first-class choice, pinned above the search
 * box rather than buried at the bottom of a filtered list: a self-paying
 * patient should not have to search an insurer directory to say they have no
 * insurer.
 *
 * The search filters an in-memory list via `searchHmos` rather than calling
 * `/api/hmo/search`. Same reasoning as the marketing typeahead — no round trip
 * per keystroke, and the list is small.
 *
 * Selection is a radio group; the input only narrows what the group shows. A
 * full combobox would take focus off the input and away from the choice, and
 * buys nothing over a filtered list of this size.
 */
export function StepHmo({
  draft,
  errors,
  patch,
  hmos,
}: StepProps & { hmos: readonly HmoOption[] }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const visible = useMemo(() => {
    if (trimmed.length === 0) {
      // Keep whatever is already chosen on screen, even if it sits outside the
      // first few — otherwise clearing the search appears to lose the answer.
      const head = hmos.slice(0, INITIAL_VISIBLE);
      const chosen = hmos.find((hmo) => hmo.slug === draft.hmoSlug);

      return chosen && !head.includes(chosen) ? [chosen, ...head] : head;
    }

    return searchHmos(hmos, trimmed);
  }, [hmos, trimmed, draft.hmoSlug]);

  const selected = hmos.find((hmo) => hmo.slug === draft.hmoSlug) ?? null;

  if (hmos.length === 0) {
    return (
      // TODO(seed): no published HMOs. Saying so beats an empty search box
      // that looks broken.
      <p className="rounded-xl border border-border bg-surface p-6 text-base">
        Our list of accepted HMOs is not published yet. Continue without one and
        we will confirm your cover when we call.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-base font-medium">
          Are you using an HMO?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <p className="mt-1 text-sm text-muted-foreground">
          We will confirm your cover before your visit. Nothing here commits you
          to a payment method.
        </p>

        {errors.hmoSlug ? (
          <FieldError id="booking-hmo-error">{errors.hmoSlug}</FieldError>
        ) : null}

        <div className="mt-4">
          <OptionCard
            name="hmoSlug"
            value=""
            checked={draft.hmoSlug === ""}
            onSelect={() => patch({ hmoSlug: "", hmoPlan: "" })}
            title="None — I am paying privately"
          />
        </div>

        <div className="mt-6">
          <label htmlFor="booking-hmo-search" className="text-sm font-medium">
            Search for your HMO
          </label>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="booking-hmo-search"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby="booking-hmo-count"
              className="bg-surface pl-9"
            />
          </div>

          {/* A list that silently shrinks as you type is invisible to anyone
              not looking at it. */}
          <p
            id="booking-hmo-count"
            aria-live="polite"
            className="mt-2 text-sm text-muted-foreground"
          >
            {trimmed.length === 0
              ? `Showing ${visible.length} of ${hmos.length} HMOs. Type to search.`
              : visible.length === 1
                ? "1 HMO matches."
                : `${visible.length} HMOs match.`}
          </p>

          {visible.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {visible.map((hmo) => (
                <OptionCard
                  key={hmo.slug}
                  name="hmoSlug"
                  value={hmo.slug}
                  checked={draft.hmoSlug === hmo.slug}
                  onSelect={(value) => patch({ hmoSlug: value })}
                  title={hmo.name}
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-border bg-surface p-4 text-base">
              No HMO matches “{trimmed}”. Continue anyway and we will check your
              cover when we call.
            </p>
          )}
        </div>
      </fieldset>

      {selected ? (
        <Field
          id="booking-hmo-plan"
          label={`Your ${selected.name} plan`}
          optional
          error={errors.hmoPlan}
          hint="The plan name printed on your card, if you have it to hand."
        >
          <Input
            id="booking-hmo-plan"
            value={draft.hmoPlan}
            onChange={(event) => patch({ hmoPlan: event.target.value })}
            aria-invalid={Boolean(errors.hmoPlan)}
            aria-describedby={describedBy("booking-hmo-plan", {
              error: errors.hmoPlan,
              hint: true,
            })}
            className="bg-surface"
          />
        </Field>
      ) : null}
    </div>
  );
}
