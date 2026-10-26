import Image from "next/image";

import { hasSiteImage, SiteImage } from "@/components/site/site-image";
import { HmoTypeahead } from "@/components/site/hmo-typeahead";
import { getHmoLogos, getHmos, type ContentImage, type Hmo } from "@/lib/content";

/**
 * "Accessing Care" block plus the HMO confirmation widget required by spec §6.
 *
 * The export shows the three access routes as an ordered list and the HMOs as
 * a static logo strip; the typeahead is additional.
 */
export async function HmoAccessSection() {
  const hmos = await getHmos();
  const uploaded = await getHmoLogos(hmos);
  // The strip is "some of" the HMOs, so it shows only providers with a logo:
  // one uploaded in /admin/hmos wins, else the bundled file in
  // assets/hmo-logo/. The typeahead below searches the full list.
  const withLogos = hmos.filter(
    (hmo) => uploaded.has(hmo.id) || hasSiteImage("hmo-logo", hmo.slug),
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
                {/* TODO(asset): Bastion, Regenix and Phillips HMO have no
                    logo yet. Uploading one in /admin/hmos adds it here, and
                    replaces the bundled file for any provider that has one. */}
                <HmoLogo hmo={hmo} uploaded={uploaded.get(hmo.id)} />
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

const LOGO_CLASS = "h-16 w-full rounded-md object-contain sm:h-20";

/**
 * One provider's logo: the upload from `/admin/hmos` when there is one, else
 * the bundled file. A logo is the only label its list item has, so an empty
 * ("decorative") alt on the media row falls back to the provider's name rather
 * than hiding the provider from screen readers.
 */
function HmoLogo({ hmo, uploaded }: { hmo: Hmo; uploaded?: ContentImage }) {
  if (uploaded && uploaded.width !== null && uploaded.height !== null) {
    return (
      <Image
        src={uploaded.url}
        alt={uploaded.alt || hmo.name}
        width={uploaded.width}
        height={uploaded.height}
        sizes="176px"
        className={LOGO_CLASS}
      />
    );
  }
  return (
    <SiteImage
      kind="hmo-logo"
      name={hmo.slug}
      alt={hmo.name}
      className={LOGO_CLASS}
    />
  );
}
