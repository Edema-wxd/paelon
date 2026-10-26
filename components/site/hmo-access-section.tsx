import Image from "next/image";

import { hasSiteImage, SiteImage } from "@/components/site/site-image";
import { HmoTypeahead } from "@/components/site/hmo-typeahead";
import { getHmoLogos, getHmos } from "@/lib/content";

/**
 * "Accessing Care" block plus the HMO confirmation widget required by spec §6.
 *
 * The export shows the three access routes as an ordered list and the HMOs as
 * a static logo strip; the typeahead is additional.
 *
 * Each logo is the committed design asset for the provider's slug — built by
 * the image pipeline, so it ships as optimised AVIF/WebP. A logo uploaded in
 * `/admin/hmos` is used only where no design asset exists, so a provider that
 * has none can be given one without a deploy, while the pipeline's versions
 * stay the ones the strip shows everywhere else.
 */
export async function HmoAccessSection() {
  const hmos = await getHmos();
  const uploaded = await getHmoLogos(hmos);
  // The strip is "some of" the HMOs, so it shows only providers whose logo has
  // been delivered — as a design asset or an upload; the typeahead below
  // searches the full list.
  const withLogos = hmos.filter(
    (hmo) => hasSiteImage("hmo-logo", hmo.slug) || uploaded.has(hmo.id),
  );

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
              left-aligned column and turning four providers into ~800px of
              scroll. Fluid columns keep the strip compact at every width;
              three to a row on phones keeps 26 logos to nine rows. */}
          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-6 lg:grid-cols-6 lg:gap-8">
            {withLogos.map((hmo) => (
              <li key={hmo.id}>
                {/* TODO(asset): 26 of the 29 logos are in assets/hmo-logo/,
                    most taken from each provider's own website. Bastion and
                    Regenix publish white-only wordmarks and Phillips HMO could
                    not be identified; a file named by slug, or an upload in
                    /admin/hmos, adds each one. */}
                {hasSiteImage("hmo-logo", hmo.slug) ? (
                  <SiteImage
                    kind="hmo-logo"
                    name={hmo.slug}
                    alt={hmo.name}
                    className="h-16 w-full rounded-md object-contain sm:h-20"
                  />
                ) : (
                  <UploadedLogo logo={uploaded.get(hmo.id)!} name={hmo.name} />
                )}
              </li>
            ))}
          </ul>

          <div className="mt-12">
            <HmoTypeahead hmos={hmos} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** An `/admin/hmos` upload, sized to the same cell as the design assets. */
function UploadedLogo({
  logo,
  name,
}: {
  logo: { url: string; alt: string; width: number | null; height: number | null };
  name: string;
}) {
  return (
    <div className="flex h-16 items-center justify-center sm:h-20">
      <Image
        src={logo.url}
        // The provider's name when the upload has none: a logo is never
        // decorative here, it is the list item.
        alt={logo.alt || name}
        width={logo.width ?? undefined}
        height={logo.height ?? undefined}
        sizes="(min-width: 1024px) 160px, 30vw"
        className="h-full w-auto max-w-full object-contain"
      />
    </div>
  );
}
