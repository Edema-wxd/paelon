import Image from "next/image";

/**
 * "About Paelon Memorial Hospital" block with the headline statistics.
 *
 * TODO(seed): the four figures below are transcribed from the Figma export and
 * are factual claims about the hospital, so they are not invented here — but
 * they are also unverified. Confirm each is current before launch. Note the
 * tension between "45+ years of experience" here and the "established 2010"
 * line the trust ribbon carries from spec §6.
 */
const STATS = [
  { value: "41+", label: "Professional Doctors" },
  { value: "4+", label: "Digital Laboratory" },
  { value: "45+", label: "Years of Experience" },
  { value: "15+", label: "Winning Awards" },
] as const;

export function AboutPreview() {
  return (
    <section
      aria-labelledby="about-heading"
      className="bg-background py-16 lg:py-25"
    >
      <div className="mx-auto grid max-w-360 items-start gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-25">
        {/*
          Not decorative — this is the only look at the facility on the page
          and it backs the equipment claims in the copy beside it, so it gets
          real alt text.

          The alt describes what is visible and stops there. It deliberately
          does not assert the room is Paelon's: the slot was specced as a
          hospital *exterior* and the delivered file is a theatre *interior*,
          so the two do not match and provenance is unconfirmed.

          TODO(asset): Francis to confirm (a) this is a Paelon theatre and not
          stock, and (b) whether the intended exterior shot still exists. If
          it is stock, it cannot run under an "About Paelon" heading.
        */}
        <Image
          src="/images/theatre-interior.png"
          alt="An operating theatre, with an overhead surgical light, anaesthesia machine and a mobile C-arm X-ray unit arranged around the table."
          width={600}
          height={400}
          sizes="(min-width: 1024px) 620px, 100vw"
          className="aspect-3/2 w-full rounded-lg object-cover"
        />

        <div>
          <h2 id="about-heading" className="text-3xl lg:text-4xl">
            <span className="text-primary">About </span>
            <span className="text-accent">Paelon Memorial </span>
            <span className="text-primary">Hospital</span>
          </h2>

          <p className="mt-6 text-base leading-relaxed text-foreground">
            At Paelon Memorial, we believe that every individual deserves the
            highest standard of healthcare. Our hospital stands as a testament
            to our unwavering commitment to providing world-class medical
            services, state-of-the-art facilities, and personalized care that
            places you, our patients, at the center of everything we do. Paelon
            Memorial is equipped with the following;
          </p>

          {/* col-reverse puts each figure above its label visually while
              keeping dt before dd in the DOM, as dl requires. */}
          <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col-reverse items-center gap-2 rounded-lg bg-accent p-4 text-center text-accent-foreground"
              >
                <dt className="text-sm">{stat.label}</dt>
                <dd className="text-3xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
