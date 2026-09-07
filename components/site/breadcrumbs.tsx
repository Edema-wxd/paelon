import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { clientEnv } from "@/lib/env";

export interface Crumb {
  label: string;
  /** Site-relative path. Omitted on the last crumb, which is the current page. */
  href?: string;
}

/**
 * Breadcrumb trail and its `BreadcrumbList` JSON-LD (CLAUDE.md, spec §11).
 *
 * One component emits both from one array, which is the point: a visible trail
 * and structured data that disagree are worse than either alone, and that
 * happens the moment they are maintained separately.
 *
 * "Home" is prepended here rather than passed in, so no caller can forget it
 * and produce a trail that starts halfway down the site.
 */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }, ...trail];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      // Google wants an absolute URL, and the final crumb still needs one —
      // it is the page being viewed.
      item: new URL(crumb.href ?? "", siteUrl).toString(),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from an object built above; nothing here is user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;

            return (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? (
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                ) : null}

                {last || !crumb.href ? (
                  // `aria-current` is what tells a screen reader where the
                  // trail ends; the styling alone would not (spec §12).
                  <span aria-current="page" className="text-foreground/80">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="rounded-sm underline-offset-4 hover:text-accent hover:underline"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
