import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface AssetPlaceholderProps {
  /** What the real image will show. Doubles as the alt text when it lands. */
  label: string;
  className?: string;
  /**
   * Decorative placeholders are hidden from assistive tech, matching the
   * `alt=""` they will carry once swapped for `next/image`.
   */
  decorative?: boolean;
}

/**
 * Stand-in for a Figma asset that was never delivered.
 *
 * TODO(asset): none of the homepage images exist yet — see seed/README.md for
 * the list. Each usage becomes a `next/image` with real `sizes`/`priority`
 * once the files are in `/public`. Rendering a labelled block keeps layout
 * honest (and CLS at zero) instead of pointing `next/image` at a 404.
 */
export function AssetPlaceholder({
  label,
  className,
  decorative = false,
}: AssetPlaceholderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 bg-secondary p-4 text-center",
        className,
      )}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": `Placeholder: ${label}` })}
    >
      <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
