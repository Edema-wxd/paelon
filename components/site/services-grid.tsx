import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import { getServices } from "@/lib/content";

/**
 * Service cards.
 *
 * A grid on desktop; a horizontal snap-scroller on mobile, matching the
 * export's `overflow-x: auto` behaviour. Scrolling is user-driven only — no
 * auto-advance anywhere (spec §6).
 *
 * TODO(design): spec §6 asks for three cards (Family Healthcare, Women and
 * Children, Corporate Healthcare). The export shows the five below, none of
 * which is Corporate Healthcare. Rendered from seed data so switching sets is
 * a data edit, not a code change. Francis to confirm.
 */
export function ServicesGrid() {
  const services = getServices();

  return (
    <section
      aria-labelledby="services-heading"
      className="bg-surface py-16 lg:py-28"
    >
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <div className="flex flex-col gap-6 text-center">
          <h2
            id="services-heading"
            className="text-3xl text-accent lg:text-4xl"
          >
            Medical Services
          </h2>
          <p className="mx-auto max-w-4xl text-xl text-foreground lg:text-2xl">
            Tailored medical services designed to support every stage of your
            family journey.
          </p>
        </div>

        <ul className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 lg:grid lg:grid-cols-3 lg:overflow-visible xl:grid-cols-3">
          {services.map((service) => (
            <li
              key={service.id}
              className="w-[85vw] shrink-0 snap-start sm:w-96 lg:w-auto"
            >
              <Link
                href={`/services/${service.slug}`}
                className="group relative flex h-76 flex-col justify-end overflow-hidden rounded-xl shadow-md transition-shadow hover:shadow-lg"
              >
                {/* TODO(asset): frame-1{3,5,6,7,8}0.png were not delivered. */}
                <AssetPlaceholder
                  label={`${service.name} photograph`}
                  className="absolute inset-0 h-full w-full"
                  decorative
                />

                <div className="relative m-0 flex min-h-17 items-center justify-between gap-3 rounded-xl bg-background/85 px-6 py-4">
                  <h3 className="text-xl text-foreground">{service.name}</h3>
                  <ArrowRight
                    className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
