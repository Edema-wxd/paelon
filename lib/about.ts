import aboutJson from "@/content/about.json";
import { aboutContentSchema, type AboutContent } from "@/lib/validation/about";

/**
 * About-page content layer (master spec §6 About).
 *
 * Mirrors `lib/legal.ts`: the file is parsed once at module load, so a malformed
 * or wrongly-published `content/about.json` fails the build rather than
 * rendering. The getter is `async` for the same reason the legal one is — if
 * this ever becomes a table, this module is the only file that changes.
 *
 * Every field is null in the shipped file. See `content/about.json` and
 * `lib/validation/about.ts` for why none of it is drafted here.
 */

const ABOUT: AboutContent = aboutContentSchema.parse(aboutJson);

/** The About page's prose. Fields nobody has written yet are null. */
export async function getAboutContent(): Promise<AboutContent> {
  return ABOUT;
}

/** True when nothing on the page has been written yet. */
export function isAboutEmpty(about: AboutContent): boolean {
  return (
    about.intro === null &&
    about.founding_story === null &&
    about.mission === null &&
    about.vision === null &&
    about.value_proposition === null &&
    about.motto === null &&
    about.esg === null
  );
}
