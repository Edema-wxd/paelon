import Image from "next/image";
import Link from "next/link";

import { ArticleBody } from "@/components/site/article-body";
import { ImageGallery } from "@/components/site/image-gallery";
import { Button } from "@/components/ui/button";
import type { ContentImage, Section } from "@/lib/content";

/**
 * A page's rearrangeable blocks, in order (migration 0008, `content_sections`).
 *
 * Every block reuses a component the site already has — `ArticleBody` for
 * text, the same figure markup for an image, `ImageGallery` for a gallery — so
 * a block looks like the rest of the page and the admin preview's renderer is
 * still the live one (decision D1).
 *
 * Headings: a block with a heading is a titled section with an `h2`, and its
 * text's own headings render one level under it (`headingOffset`). A text block
 * without one sits directly under the page's `h1`, so its `##` is an `h2`. The
 * outline stays sequential whatever order the editor chose.
 *
 * A block whose image is missing from `images`, or has no recorded size, is
 * skipped rather than rendered with a guessed box — an unsized image is a CLS
 * failure (spec §13).
 */
export function ContentSections({
  sections,
  images,
  idPrefix,
}: {
  sections: readonly Section[];
  images: ReadonlyMap<string, ContentImage>;
  /** Keeps heading ids unique when two pages' blocks share a template. */
  idPrefix: string;
}) {
  return (
    <div className="space-y-14">
      {sections.map((section, index) => {
        const id = `${idPrefix}-${index}`;
        switch (section.kind) {
          case "text":
            return section.data.heading ? (
              <section key={id} aria-labelledby={id}>
                <h2 id={id} className="text-2xl text-accent lg:text-3xl">
                  {section.data.heading}
                </h2>
                <div className="mt-4">
                  <ArticleBody source={section.data.body} images={images} headingOffset={1} />
                </div>
              </section>
            ) : (
              <div key={id}>
                <ArticleBody source={section.data.body} images={images} />
              </div>
            );

          case "image": {
            const image = images.get(section.data.mediaId);
            if (!image?.width || !image.height) return null;
            return (
              <figure key={id} className="max-w-3xl">
                <Image
                  src={image.url}
                  // The media library's alt text; "" means the editor marked
                  // the image decorative, which is passed through as such.
                  alt={image.alt}
                  width={image.width}
                  height={image.height}
                  sizes={`(min-width: 48rem) min(48rem, ${image.width}px), min(100vw, ${image.width}px)`}
                  className="h-auto w-full rounded-xl"
                  style={{ maxWidth: `${image.width}px` }}
                />
                {section.data.caption ? (
                  <figcaption className="mt-3 text-sm text-muted-foreground">
                    {section.data.caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          }

          case "gallery": {
            const gallery = section.data.mediaIds
              .map((mediaId) => images.get(mediaId))
              .filter((image): image is ContentImage => Boolean(image?.width && image.height));
            return (
              <ImageGallery
                key={id}
                images={gallery}
                heading={section.data.heading}
                headingId={id}
              />
            );
          }

          case "cta": {
            const { heading, text, buttonLabel, href } = section.data;
            const internal = href.startsWith("/");
            return (
              <section
                key={id}
                aria-labelledby={id}
                className="max-w-3xl rounded-xl bg-secondary px-6 py-8 lg:px-10"
              >
                <h2 id={id} className="text-2xl text-primary lg:text-3xl">
                  {heading}
                </h2>
                {text ? (
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/80 lg:text-lg">
                    {text}
                  </p>
                ) : null}
                <Button asChild size="pill" className="mt-6">
                  {internal ? (
                    <Link href={href}>{buttonLabel}</Link>
                  ) : (
                    <a href={href} {...(href.startsWith("https://") ? { rel: "noopener external" } : {})}>
                      {buttonLabel}
                    </a>
                  )}
                </Button>
              </section>
            );
          }
        }
      })}
    </div>
  );
}
