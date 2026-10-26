/**
 * How a patient is named next to their words on the public site.
 *
 * `name_format` records how much of their name the patient agreed to show. It
 * is part of the consent, not a style choice: a patient who agreed to
 * "initials" and appears under their full name has had their consent broken,
 * whatever the quote says. So the format is applied here, once, and the public
 * `Testimonial` carries only the result — the full name never reaches a
 * template that could render it by mistake.
 *
 * Pure and dependency-free, so the admin editor can preview the exact string.
 */

export type NameFormat = "full" | "first_only" | "initials";

/** Words of a name, ignoring extra spaces. */
function words(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

/**
 * "Sarah Adenuga" → "Sarah Adenuga" | "Sarah" | "S.A.".
 *
 * Initials take the first letter of each space-separated word, so a hyphenated
 * or apostrophised surname ("O'Neil", "Mary-Jane") contributes one initial, as
 * it would on a card. An empty name returns "" rather than a stray "." — the
 * schema requires a name, so this only guards against bad data.
 */
export function displayPatientName(name: string, format: NameFormat): string {
  const parts = words(name);
  if (parts.length === 0) return "";

  switch (format) {
    case "full":
      return parts.join(" ");
    case "first_only":
      return parts[0] ?? "";
    case "initials":
      return parts
        .map((part) => {
          const letter = part.match(/\p{L}/u)?.[0];
          return letter ? `${letter.toLocaleUpperCase("en-NG")}.` : "";
        })
        .join("");
  }
}
