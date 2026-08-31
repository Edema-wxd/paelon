import Image from "next/image";

import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import { HmoTypeahead } from "@/components/site/hmo-typeahead";
import { getHmos } from "@/lib/content";

/**
 * "Accessing Care" block plus the HMO confirmation widget required by spec §6.
 *
 * The export shows the three access routes as an ordered list and the HMOs as
 * a static logo strip; the typeahead is additional.
 */
export function HmoAccessSection() {
  const hmos = getHmos();

  return (
    <section
      aria-labelledby="accessing-care-heading"
      className="bg-background py-16 lg:py-24"
    >
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <div className="rounded-lg bg-background px-6 py-12 shadow-md lg:px-16">
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
                {/*
                  `object-contain`, not `cover`: the four logos range from
                  4.4:1 (AXA Mansard) to nearly square (Cigna), so a uniform
                  slot has to letterbox them. `cover` would crop the wordmarks.

                  The provider name is the alt text — a reader scanning for
                  their own HMO needs the name, not "logo".

                  TODO(asset): all four appear to be flattened screenshots —
                  each carries faint background imagery from whatever page it
                  was lifted off, visible against a light surface. Ask Francis
                  for clean transparent PNG or SVG from each provider's brand
                  kit; using a screenshot of an insurer's mark is also a
                  trademark-usage question worth confirming.
                */}
                {hmo.logo ? (
                  <Image
                    src={hmo.logo}
                    alt={hmo.name}
                    width={176}
                    height={80}
                    sizes="176px"
                    className="h-20 w-full rounded-md object-contain"
                  />
                ) : (
                  <AssetPlaceholder
                    label={`${hmo.name} logo`}
                    className="h-20 w-full rounded-md"
                  />
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
