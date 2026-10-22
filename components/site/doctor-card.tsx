import Link from "next/link";

import { SiteImage } from "@/components/site/site-image";
import type { Doctor } from "@/lib/content";

/**
 * One member of the leadership team, linking to their profile (spec §6 About:
 * "Leadership team with photos and bios").
 *
 * The whole card is not the link — the name is. A card-sized click target
 * containing a name, a title and a list of specialties gives a screen reader one
 * enormous link label; the name alone is the descriptive link text CLAUDE.md
 * asks for, and "Read more" appears nowhere.
 */
export function DoctorCard({ doctor }: { doctor: Doctor }) {
  return (
    <article className="flex h-full flex-col items-center gap-4 rounded-xl bg-secondary p-6 text-center">
      {/* TODO(asset): no doctor headshots have been delivered — this degrades
          to a labelled placeholder. Decorative: the name below it is the
          accessible text. */}
      <SiteImage
        kind="portrait"
        name={doctor.slug}
        alt=""
        className="size-25 shrink-0 rounded-full object-cover"
      />

      <div>
        <h3 className="text-lg font-medium text-primary">
          <Link
            href={`/doctors/${doctor.slug}`}
            className="rounded-sm underline-offset-4 hover:text-accent hover:underline"
          >
            {doctor.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-accent">{doctor.title}</p>

        {doctor.specialties.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {doctor.specialties.join(", ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}
