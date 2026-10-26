import Image from "next/image";

import { SiteImage } from "@/components/site/site-image";
import { HmoTypeahead } from "@/components/site/hmo-typeahead";
import { getHmoLogos, getHmos } from "@/lib/content";

/**
 * "Accessing Care" block plus the HMO confirmation widget required by spec §6.
 *
 * The export shows the three access routes as an ordered list and the HMOs as
 * a static logo strip; the typeahead is additional.
 *
 * Each logo is the one uploaded in `/admin/hmos` when there is one, so a new
 * HMO needs no deploy; otherwise the committed design asset for its slug, and
 * failing that the asset placeholder carrying the provider's name.
 */
export async function HmoAccessSection() {
  const hmos = await getHmos();
  const logos = await getHmoLogos(hmos);

  return (
    <section
      aria-labelledby="accessing-care-heading"
      className="bg-background py-16 lg:py-24"
    >
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <div className="rounded-lg bg-surface px-6 py-12 shadow-md lg:px-16">
          <h2
            id="accessing-care-heading"
            className="text-3xl text-primary lg:text-4xl"
          >
            Accessing Care
          </h2>

          <p className="mt-8 text-base">
            Patients can access our facility through any of the following
            channels:
          </p>

          <ol className="mt-4 list-decimal space-y-3 pl-6 text-base leading-relaxed">
            <li>
              <strong className="font-medium">Private (Self-Pay)</strong>:
              Patients pay for services out of pocket.
            </li>
            <li>
              <strong className="font-medium">Corporate Retainer</strong>:
              Services are provided under an approved corporate agreement.
            </li>
            <li>
              <strong className="font-medium">
                Health Maintenance Organizations (HMOs)
              </strong>
              {": "}
              Patients can access care through their registered HMO plans.
            </li>
          </ol>

          <h3 className="mt-12 text-xl text-primary">
            Some of the HMOs we work with include
          </h3>

          {/* A grid, not flex-wrap: fixed 176px logo widths against ~310px of
              usable mobile width fitted one per row, stranding each logo in a
              left-aligned column and turning the providers into a long
              scroll. Three fluid columns keep nine logos a tidy 3×3. */}
          <ul className="mt-6 grid grid-cols-3 items-center gap-4 sm:gap-8">
            {hmos.map((hmo) => {
              const logo = logos.get(hmo.id);
              return (
                <li
                  key={hmo.id}
                  // The design-asset fallback wraps its image in a `<picture>` that
                  // ignores the cell height; capping every image here keeps a tall
                  // logo (Cigna) inside its row instead of over the next one.
                  className="flex h-16 items-center justify-center overflow-hidden sm:h-20 [&_img]:max-h-full [&_img]:w-auto [&_picture]:flex [&_picture]:h-full [&_picture]:items-center"
                >
                  {logo ? (
                    <Image
                      src={logo.url}
                      // The provider's name when the upload has none: a logo
                      // is never decorative here, it is the list item.
                      alt={logo.alt || hmo.name}
                      width={logo.width ?? undefined}
                      height={logo.height ?? undefined}
                      sizes="(min-width: 640px) 200px, 30vw"
                      // Fill the cell height like the design assets did; the source
                      // files are small (66–175px tall) and read as tiny otherwise.
                      className="h-full w-auto max-w-full object-contain"
                    />
                  ) : (
                    <SiteImage
                      kind="hmo-logo"
                      name={hmo.slug}
                      alt={hmo.name}
                      className="h-full w-full rounded-md object-contain"
                    />
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-12">
            <HmoTypeahead hmos={hmos} />
          </div>
        </div>
      </div>
    </section>
  );
}
