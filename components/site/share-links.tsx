import { Link2, MessageCircle, Share2 } from "lucide-react";

/**
 * Share buttons for a blog post (spec §6).
 *
 * Plain links to each network's share endpoint, not embedded SDKs. An embed
 * would set third-party cookies — which would undo the "no cookie banner
 * required" position in spec §14 — and cost far more than the 800 KB homepage
 * budget in §13 can spare. Links cost nothing and work with JavaScript off.
 *
 * The copy-link affordance is a plain anchor to the canonical URL: a clipboard
 * button would need a client component and a permission prompt to do what
 * right-click already does.
 *
 * Icons are generic rather than per-brand. Lucide no longer ships brand marks,
 * and CLAUDE.md allows no second icon set — the accessible name carries the
 * network, which is what actually has to be unambiguous.
 */
export function ShareLinks({ title, url }: { title: string; url: string }) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const targets = [
    {
      // Also opens WhatsApp Web on desktop; `wa.me` handles the routing.
      label: `Share "${title}" on WhatsApp`,
      short: "WhatsApp",
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      Icon: MessageCircle,
    },
    {
      label: `Share "${title}" on LinkedIn`,
      short: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      Icon: Share2,
    },
  ];

  return (
    <div>
      <h3 className="text-base font-medium text-primary">Share this article</h3>

      <ul className="mt-3 flex flex-wrap gap-3">
        {targets.map(({ label, short, href, Icon }) => (
          <li key={short}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              // The visible text is short; the accessible name is not, because
              // "WhatsApp" out of context tells a screen-reader user nothing
              // (spec §11 on descriptive link text).
              aria-label={label}
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/80 hover:border-accent hover:text-accent"
            >
              <Icon className="size-4" aria-hidden />
              {short}
            </a>
          </li>
        ))}
        <li>
          <a
            href={url}
            aria-label={`Permanent link to "${title}"`}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/80 hover:border-accent hover:text-accent"
          >
            <Link2 className="size-4" aria-hidden />
            Copy link
          </a>
        </li>
      </ul>
    </div>
  );
}
