"use client";

import { FieldError, OptionCard } from "@/components/booking/field";
import type { BranchOption, StepProps } from "@/components/booking/types";

/**
 * Step 1 — branch (master spec §7). Cards, not a dropdown: on a phone a card
 * can carry today's hours next to the name, which is the thing that actually
 * decides where someone books.
 */
export function StepBranch({
  draft,
  errors,
  patch,
  branches,
}: StepProps & { branches: readonly BranchOption[] }) {
  if (branches.length === 0) {
    return (
      // TODO(seed): no published branch means there is nothing bookable. The
      // seed gap is stated rather than papered over with a fake location.
      <p className="rounded-xl border border-border bg-surface p-6 text-base">
        We cannot take online bookings just now because no branch is published.
        Please call the hospital and the front desk will book you in.
      </p>
    );
  }

  return (
    <fieldset>
      <legend className="text-base font-medium">
        Which branch would you like to visit?
      </legend>

      {errors.locationSlug ? (
        <FieldError id="booking-branch-error">{errors.locationSlug}</FieldError>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {branches.map((branch) => (
          <OptionCard
            key={branch.slug}
            name="locationSlug"
            value={branch.slug}
            checked={draft.locationSlug === branch.slug}
            onSelect={(value) => patch({ locationSlug: value })}
            title={branch.name}
            description={
              <>
                <span className="block">{branch.city}</span>
                {/* TODO(seed): `hours` is unset for every seeded branch, so
                    this usually falls through to the honest line rather than
                    claiming a schedule (see seed/README.md). */}
                <span className="block">
                  {branch.hoursToday ?? "Opening hours not confirmed yet"}
                </span>
              </>
            }
          />
        ))}
      </div>
    </fieldset>
  );
}
