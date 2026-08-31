import Image from "next/image";

import { AssetPlaceholder } from "@/components/site/asset-placeholder";
import rawManifest from "@/lib/image-manifest.json";
import { IMAGE_SLOTS, type ImageKind } from "@/lib/images";
import { cn } from "@/lib/utils";

interface ManifestEntry {
  kind: string;
  src: string;
  fallback?: string;
  mobileSrc?: string;
  mobileFallback?: string;
  width: number;
  height: number;
  vector: boolean;
}

const manifest = rawManifest as Record<string, ManifestEntry | undefined>;

interface SiteImageProps {
  /** Slot kind — picks up dimensions, sizes and priority from IMAGE_SLOTS. */
  kind: ImageKind;
  /** Asset basename, matching the file in assets/<kind>/. */
  name: string;
  /** Meaningful alt text, or "" for decorative (spec §12). */
  alt: string;
  className?: string;
  /** Fill the positioned parent instead of using intrinsic dimensions. */
  fill?: boolean;
  /** Override the slot default. */
  priority?: boolean;
}

/**
 * Renders a site image, or a placeholder while the asset is missing.
 *
 * Files come pre-sized and pre-encoded from `scripts/optimize-images.mjs`, so
 * `unoptimized` is set deliberately: the runtime optimizer would re-encode
 * already-optimal AVIF for no gain, and skipping it keeps the app free of a
 * server-side image pipeline — spec §2 wants this deployable off Vercel.
 * `next/image` still earns its place for width/height (CLS), lazy loading,
 * priority hints and decoding.
 *
 * AVIF is offered through `<source>` with WebP on the `<img>` itself, so the
 * universally-supported format is the floor. Art-directed slots add a second
 * pair of sources for the mobile crop — `<picture>` is the only way to switch
 * crops on viewport, which `next/image` alone cannot express.
 */
export function SiteImage({
  kind,
  name,
  alt,
  className,
  fill = false,
  priority,
}: SiteImageProps) {
  const slot = IMAGE_SLOTS[kind];
  const entry = manifest[`${kind}/${name}`];

  // No asset delivered yet — see seed/README.md for the outstanding list.
  if (!entry) {
    return (
      <AssetPlaceholder
        label={alt || name}
        className={cn(fill && "absolute inset-0 h-full w-full", className)}
        decorative={alt === ""}
        // A caption cannot fit legibly behind the hero or inside a 100px
        // portrait disc; those render as a plain tinted block instead.
        bare={kind === "hero" || kind === "portrait"}
      />
    );
  }

  const isPriority = priority ?? slot.priority ?? false;
  const artDirected = Boolean(entry.mobileSrc);
  const dimensionProps = fill
    ? ({ fill: true } as const)
    : ({ width: entry.width, height: entry.height } as const);

  /**
   * `priority` makes Next emit `<link rel="preload" href=...>` for one fixed
   * URL. That is right for a single-source image and wrong for an art-directed
   * one: it would preload the desktop file while `<picture>` resolves to the
   * mobile crop, costing a second download and leaving the real LCP image
   * unpreloaded. Art-directed slots get eager loading and a high fetch
   * priority instead — the preload scanner finds a `<picture>` in the initial
   * HTML immediately, so the link tag buys nothing here anyway.
   */
  const loadingProps = isPriority
    ? artDirected
      ? ({ loading: "eager", fetchPriority: "high" } as const)
      : ({ priority: true } as const)
    : ({} as const);

  const img = (
    <Image
      src={entry.vector ? entry.src : (entry.fallback ?? entry.src)}
      alt={alt}
      unoptimized
      sizes={slot.sizes}
      className={cn(fill && "object-cover", className)}
      {...dimensionProps}
      {...loadingProps}
    />
  );

  // Vector needs no format negotiation and no art direction.
  if (entry.vector) return img;

  return (
    <picture>
      {entry.mobileSrc ? (
        <source
          media="(max-width: 1023px)"
          type="image/avif"
          srcSet={entry.mobileSrc}
        />
      ) : null}
      {entry.mobileFallback ? (
        <source
          media="(max-width: 1023px)"
          type="image/webp"
          srcSet={entry.mobileFallback}
        />
      ) : null}
      <source type="image/avif" srcSet={entry.src} />
      {img}
    </picture>
  );
}
