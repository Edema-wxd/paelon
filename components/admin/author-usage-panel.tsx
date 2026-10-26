import { UsagePanel, type Usage } from "@/components/admin/usage-panel";
import { listPostsByAuthor } from "@/lib/db/queries/blog";
import { getDoctorLinkState } from "@/lib/db/queries/doctors";
import type { Author } from "@/lib/db/schema";

/**
 * Where an author appears, from its saved state.
 *
 * An author has no page: everything here shows on the posts that carry the
 * byline, so the panel leads with those. `published` on the author changes
 * nothing public, which is why it is not consulted.
 */
export async function AuthorUsagePanel({ author }: { author: Author }) {
  const [posts, doctor] = await Promise.all([
    listPostsByAuthor(author.id),
    author.doctorId ? getDoctorLinkState(author.doctorId) : Promise.resolve(null),
  ]);

  const live = posts.filter((post) => post.published && post.publishedAt !== null);
  const unlisted = posts.length - live.length;
  const notLive =
    unlisted > 0 ? ` ${unlisted} more ${unlisted === 1 ? "is a draft or undated" : "are drafts or undated"}.` : "";

  const byline: Usage =
    live.length > 0
      ? {
          state: "on",
          title: "Byline and “About the author”",
          detail: `On ${live.length === 1 ? "1 live post" : `${live.length} live posts`}: ${live
            .slice(0, 3)
            .map((post) => `“${post.title}”`)
            .join(", ")}${live.length > 3 ? ` and ${live.length - 3} more` : ""}.${notLive}`,
        }
      : {
          state: "off",
          title: "Byline and “About the author”",
          detail:
            posts.length > 0
              ? `Not shown: none of their ${posts.length === 1 ? "post is" : `${posts.length} posts are`} live yet.`
              : "Not shown: no post carries this byline yet.",
        };

  const headshot: Usage = author.headshotId
    ? { state: "on", title: "Headshot", detail: "Shown beside the name on the card." }
    : { state: "off", title: "Headshot", detail: "Not set. The card shows the name without a photo." };

  const profile: Usage = !author.doctorId
    ? { state: "off", title: "Profile link", detail: "Not linked to a doctor, so the card has no profile link." }
    : !doctor
      ? { state: "off", title: "Profile link", detail: "Not shown: the linked doctor has been deleted." }
      : doctor.published
        ? { state: "on", title: "Profile link", detail: `Links to ${doctor.name}’s profile under the bio.` }
        : {
            state: "off",
            title: "Profile link",
            detail: `Not shown: ${doctor.name}’s profile is a draft. It appears once that profile is published.`,
          };

  return <UsagePanel id="author" usages={[byline, headshot, profile]} />;
}
