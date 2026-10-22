import { getAbout } from "@/lib/db/queries/about";
import type { AboutContent } from "@/lib/validation/about";

/**
 * About-page content layer (master spec §6 About).
 *
 * Reads the `about_content` singleton through the repository layer and maps it
 * onto the shape the template already renders — the same job `lib/content.ts`
 * does for every other content type, which is why this module survived the
 * move from `content/about.json` to Postgres (migration 0005) without
 * `app/(marketing)/about/page.tsx` changing a line. The getter was always
 * async for exactly this day.
 *
 * `lib/legal.ts` deliberately did not follow: decision C3 keeps /privacy and
 * /terms as files that change by PR after counsel review.
 *
 * The copy is written in `/admin/about`. Fields nobody has written yet are
 * null, and the template renders only the sections that exist — the founding
 * story is about real people and the mission, vision and ESG claims are
 * statements the hospital makes about itself, so none of it is drafted here
 * (CLAUDE.md).
 */

/** The About page's prose. Fields nobody has written yet are null. */
export async function getAboutContent(): Promise<AboutContent> {
  const row = await getAbout();

  return {
    published: row.published,
    placeholder: row.placeholder,
    intro: row.intro,
    founding_story: row.founding_story,
    mission: row.mission,
    vision: row.vision,
    value_proposition: row.value_proposition,
    motto: row.motto,
    esg: row.esg,
  };
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
