"use client";

import { FieldError, OptionCard } from "@/components/booking/field";
import {
  SERVICE_FAMILY_LABELS,
  type ServiceFamily,
  type ServiceOption,
  type StepProps,
} from "@/components/booking/types";
import { serviceFamilyValues } from "@/lib/validation/booking";

/**
 * Step 2 — service area, and optionally a specific service within it (master
 * spec §7).
 *
 * The family is required and the service is not, because a patient who knows
 * only "something for my child" must still be able to finish. Changing family
 * clears any service chosen under the previous one — carrying it over would
 * send a mismatched pair to the server, which rejects it.
 */
export function StepService({
  draft,
  errors,
  patch,
  services,
}: StepProps & { services: readonly ServiceOption[] }) {
  const inFamily = draft.serviceFamily
    ? services.filter((service) => service.family === draft.serviceFamily)
    : [];

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="text-base font-medium">
          What are you coming in for?
        </legend>

        {errors.serviceFamily ? (
          <FieldError id="booking-family-error">
            {errors.serviceFamily}
          </FieldError>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {serviceFamilyValues.map((family) => (
            <OptionCard
              key={family}
              name="serviceFamily"
              value={family}
              checked={draft.serviceFamily === family}
              onSelect={(value) =>
                patch({
                  serviceFamily: value as ServiceFamily,
                  serviceSlug: "",
                })
              }
              title={SERVICE_FAMILY_LABELS[family]}
            />
          ))}
        </div>
      </fieldset>

      {inFamily.length > 0 ? (
        <fieldset>
          <legend className="text-base font-medium">
            Is there a specific service?{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </legend>
          <p className="mt-1 text-sm text-muted-foreground">
            If you are not sure, leave this and tell us when we call.
          </p>

          {errors.serviceSlug ? (
            <FieldError id="booking-service-error">
              {errors.serviceSlug}
            </FieldError>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <OptionCard
              name="serviceSlug"
              value=""
              checked={draft.serviceSlug === ""}
              onSelect={() => patch({ serviceSlug: "" })}
              title="Not sure yet"
            />
            {inFamily.map((service) => (
              <OptionCard
                key={service.slug}
                name="serviceSlug"
                value={service.slug}
                checked={draft.serviceSlug === service.slug}
                onSelect={(value) => patch({ serviceSlug: value })}
                title={service.name}
                description={service.shortDescription}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
