import Image from "next/image";
import Link from "next/link";

import { ArticleBody } from "@/components/site/article-body";
import type { BlogAuthor } from "@/lib/content";

/**
 * "About the author" at the foot of a post (spec §6: "author card").
 *
 * Renders what the Authors form promises: name, role, bio, and the headshot
 * when one is set. The bio sits under this block's own `h2`, so it renders with
 * `headingOffset={1}` — a `##` an editor wrote becomes an `h3`, never a second
 * `h2` competing with the heading above it.
 *
 * The profile link appears only when the author is linked to a doctor whose
 * profile is published; the query drops an unpublished one, so the link never
 * points at a 404.
 */
export function AuthorCard({ author }: { author: BlogAuthor }) {
  return (
    <section aria-labelledby="author-heading">
      <h2 id="author-heading" className="text-xl text-primary">
        About the author
      </h2>

      <div className="mt-5 flex items-start gap-4">
        {author.headshot ? (
          <Image
            src={author.headshot.url}
            alt={author.headshot.alt}
            width={author.headshot.width}
            height={author.headshot.height}
            sizes="4rem"
            className="size-16 shrink-0 rounded-full object-cover"
          />
        ) : null}

        <div className="min-w-0">
          <p className="text-lg font-semibold text-primary">{author.name}</p>
          {author.role ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{author.role}</p>
          ) : null}
        </div>
      </div>

      {author.bio ? (
        <div className="mt-4">
          <ArticleBody source={author.bio} headingOffset={1} />
        </div>
      ) : null}

      {author.doctor_slug ? (
        <p className="mt-4">
          <Link
            href={`/doctors/${author.doctor_slug}`}
            className="text-base font-medium text-accent underline underline-offset-4 hover:no-underline"
          >
            View {author.name}’s profile
          </Link>
        </p>
      ) : null}
    </section>
  );
}
