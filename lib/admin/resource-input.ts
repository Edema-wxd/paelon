import type { Field, ResourceConfig } from "@/lib/admin/resource-config";

/**
 * `FormData` → the object a resource schema parses.
 *
 * `Object.fromEntries(formData)`, which `adminAction` uses by default, is
 * lossy in exactly the two places this kit now needs: a field submitted more
 * than once keeps only its last value, and a nested value has nowhere to go.
 * Both are silent — a service saved with five branches ticked would keep one,
 * and nobody would see an error.
 *
 * So the config's field types decide how each name is read:
 *
 *  - `tags` and `multiselect` are read with `getAll`, always as an array, even
 *    when there are none. A schema that only sees a list when two were picked
 *    is a schema that fails on the first real submission.
 *  - `hours` is read from `hours.<day>.<part>` entries and rebuilt as the
 *    nested object `adminHoursField` expects. Dotted names rather than JSON in
 *    a hidden input, so the seven days still submit — and still validate — with
 *    JavaScript off.
 *  - everything else is one string, as before.
 *
 * The client does not use this: react-hook-form holds the same shape natively,
 * which is what keeps the two sides of the validation honest.
 */

/** The days `adminHoursField` keys by, and the parts each one submits. */
const HOURS_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const HOURS_PARTS = ["closed", "open", "close"] as const;

/** The submitted name of one hours control: `hours.mon.open`. */
export function hoursInputName(
  field: string,
  day: (typeof HOURS_DAYS)[number],
  part: (typeof HOURS_PARTS)[number],
): string {
  return `${field}.${day}.${part}`;
}

export function resourceInput<R>(
  config: ResourceConfig<R>,
  formData: FormData,
): Record<string, unknown> {
  const listFields = new Set(
    config.fields
      .filter((field) => field.type === "tags" || field.type === "multiselect")
      .map((field) => field.name),
  );
  const hoursFields = config.fields.filter(
    (field): field is Extract<Field, { type: "hours" }> => field.type === "hours",
  );

  const input: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    // Dotted entries are rebuilt below; left here they would also arrive as
    // flat keys the schema does not know, which Zod would ignore silently.
    if (hoursFields.some((field) => key.startsWith(`${field.name}.`))) continue;
    if (listFields.has(key)) continue;
    input[key] = value;
  }

  for (const name of listFields) {
    input[name] = formData.getAll(name).map((value) => String(value));
  }

  for (const field of hoursFields) {
    input[field.name] = Object.fromEntries(
      HOURS_DAYS.map((day) => [
        day,
        Object.fromEntries(
          // `undefined`, not `""`, for a control that was not submitted: an
          // unticked checkbox is absent, and the empty string is not a member
          // of `checkboxField`'s union.
          HOURS_PARTS.map((part) => [
            part,
            formData.get(hoursInputName(field.name, day, part)) ?? undefined,
          ]),
        ),
      ]),
    );
  }

  return input;
}

export { HOURS_DAYS, HOURS_PARTS };
