import { CalendarCheck, Star } from "lucide-react";

/**
 * Trust ribbon: SafeCare 5-star, established 2010 (spec §6). Sits directly
 * below the hero.
 *
 * Absent from the Figma export entirely — designed fresh.
 *
 * TODO(asset): the SafeCare 5-star badge artwork has not been supplied. A
 * Lucide star stands in; an accreditation mark should be the real logo before
 * launch, since it is a third-party certification claim.
 *
 * TODO(seed): "established 2010" comes from spec §6, but the About section
 * claims 45+ years of experience. Those cannot both describe the founding
 * date — confirm which is right before either ships.
 */
export function TrustRibbon() {
  return (
    <section aria-label="Accreditations" className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-360 flex-col items-center justify-center gap-3 px-4 py-4 text-center text-sm sm:flex-row sm:gap-10 sm:px-6 lg:px-25">
        <p className="flex items-center gap-2">
          <Star className="size-4 shrink-0" aria-hidden />
          SafeCare 5-star accredited
        </p>
        <p className="flex items-center gap-2">
          <CalendarCheck className="size-4 shrink-0" aria-hidden />
          Established 2010
        </p>
      </div>
    </section>
  );
}
