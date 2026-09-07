import { SiteImage } from "@/components/site/site-image";
import { HmoTypeahead } from "@/components/site/hmo-typeahead";
import { getHmos } from "@/lib/content";

/**
 * "Accessing Care" block plus the HMO confirmation widget required by spec §6.
 *
 * The export shows the three access routes as an ordered list and the HMOs as
 * a static logo strip; the typeahead is additional.
 */
export async function HmoAccessSection() {
  const hmos = await getHmos();

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
              scroll. Fluid columns keep the strip compact at every width. */}
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-8">
            {hmos.map((hmo) => (
              <li key={hmo.id}>
                {/* TODO(asset): HMO logos were not delivered. The provider name
                    carries the meaning in the meantime, which is also the
                    accessible text once the logo replaces it. */}
                <SiteImage
                  kind="hmo-logo"
                  name={hmo.slug}
                  alt={hmo.name}
                  className="h-20 w-full rounded-md object-contain"
                />
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
