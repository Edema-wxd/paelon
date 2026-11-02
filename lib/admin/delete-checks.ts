import {
  count,
  hrefLinksTo,
  linkTargetFor,
  markdownLinksTo,
  nameList,
  NO_IMPACT,
  type DeleteImpact,
  type DeleteIssue,
  type ImpactItem,
} from "@/lib/admin/delete-impact";
import type { ResourceName } from "@/lib/admin/resources";
import { RESOURCE_SERVER } from "@/lib/admin/resources/server";
import { getContentById, type ContentRow } from "@/lib/db/queries/content-crud";
import {
  authorsLinkedToDoctor,
  findTextContaining,
  latestLivePostId,
  locationsOf,
  openBookingCount,
  otherPublicTestimonialCount,
  otherPublishedAwardCount,
  otherPublishedFaqCount,
  otherPublishedLocationCount,
  postsByAuthor,
  postsRelatingTo,
  rowsAtLocation,
  servicesOfFaq,
  servicesRelatingTo,
  testimonialsAttachedTo,
  type TextReferrer,
} from "@/lib/db/queries/delete-impact";

/**
 * The pre-delete check: what deleting one content row would break.
 *
 * Every delete in the panel is soft (spec §8), so a foreign key's `on delete
 * restrict` never fires, and before this only authors were guarded. Run in two
 * places from one function, so they cannot disagree:
 *
 *  - the editor's Delete section, which lists the findings and disables the
 *    button while any blocker stands;
 *  - the delete action, which refuses on the same blockers. The button is a
 *    convenience; the action is the guard.
 *
 * The rules for what blocks and what merely changes are in
 * `lib/admin/delete-impact.ts`.
 */
export async function getDeleteImpact(resource: ResourceName, id: string): Promise<DeleteImpact> {
  const row = await getContentById<ContentRow>(RESOURCE_SERVER[resource].table, id);
  if (!row || row.deletedAt) return NO_IMPACT;

  const blockers: DeleteIssue[] = [];
  const effects: DeleteIssue[] = [];
  const slug = typeof row.slug === "string" ? row.slug : "";
  const published = row.published === true;

  await Promise.all([
    linkChecks(resource, id, slug, isLive(resource, row), blockers, effects),
    typeChecks(resource, id, row, published, blockers, effects),
  ]);

  return { blockers, effects };
}

/** `a, b and c`. */
function joinAnd(parts: readonly string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** A post is on the site only when it is also dated (`livePost()`). */
function isLive(resource: ResourceName, row: ContentRow): boolean {
  if (row.published !== true) return false;
  if (resource === "blog") return row.publishedAt !== null && row.publishedAt !== undefined;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Links from other content                                                   */
/* -------------------------------------------------------------------------- */

const SOURCE_NOUN: Record<TextReferrer["source"], string> = {
  blog: "Post",
  services: "Service page layout",
  about: "About page layout",
  faqs: "FAQ answer",
  doctors: "Doctor bio",
  authors: "Author bio",
};

function referrerItem(ref: TextReferrer): ImpactItem {
  return {
    label: ref.source === "about" ? ref.label : `${SOURCE_NOUN[ref.source]}: ${ref.label}`,
    href: ref.source === "about" ? "/admin/about" : `/admin/${ref.source}/${ref.id}`,
  };
}

/**
 * Text elsewhere that links to this row's page, or books it by deep link.
 *
 * A live link to a live page is a blocker: the delete would turn it into a
 * 404 on a public page, and for a post it would also fail that post's publish
 * check (baseline item 14) the next time anyone saved it. A link from a draft,
 * or to a page that is already unpublished, is reported but does not block —
 * the draft's own publish check catches it, and the unpublished page already
 * 404s.
 */
async function linkChecks(
  resource: ResourceName,
  id: string,
  slug: string,
  live: boolean,
  blockers: DeleteIssue[],
  effects: DeleteIssue[],
): Promise<void> {
  const target = linkTargetFor(resource, slug);
  if (!target) return;

  const candidates = await findTextContaining(slug);
  const linking = candidates.filter(
    (ref) =>
      // The row's own text goes with it.
      !(ref.source === resource && ref.id === id) &&
      (ref.markdown.some((body) => markdownLinksTo(body, target)) ||
        ref.hrefs.some((href) => hrefLinksTo(href, target))),
  );
  if (linking.length === 0) return;

  const liveRefs = linking.filter((ref) => ref.live);
  const draftRefs = linking.filter((ref) => !ref.live);
  const path = target.paths[0] ?? "";

  if (liveRefs.length > 0) {
    const issue: DeleteIssue = {
      title: "Linked from live pages",
      detail: live
        ? `${count(liveRefs.length, "live page")} link${liveRefs.length === 1 ? "s" : ""} to ${path}${target.book ? " or book it by deep link" : ""} (${nameList(liveRefs.map((r) => r.label))}). Change or remove ${liveRefs.length === 1 ? "that link" : "those links"} first, or readers will land on a missing page.`
        : `${count(liveRefs.length, "live page")} still link${liveRefs.length === 1 ? "s" : ""} to ${path}, which is unpublished and already shows “not found”: ${nameList(liveRefs.map((r) => r.label))}.`,
      items: liveRefs.map(referrerItem),
    };
    (live ? blockers : effects).push(issue);
  }

  if (draftRefs.length > 0) {
    effects.push({
      title: "Linked from drafts",
      detail: `${count(draftRefs.length, "draft")} link${draftRefs.length === 1 ? "s" : ""} here (${nameList(draftRefs.map((r) => r.label))}). ${draftRefs.length === 1 ? "It" : "They"} will need the link changed before publishing.`,
      items: draftRefs.map(referrerItem),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Per type                                                                   */
/* -------------------------------------------------------------------------- */

async function typeChecks(
  resource: ResourceName,
  id: string,
  row: ContentRow,
  published: boolean,
  blockers: DeleteIssue[],
  effects: DeleteIssue[],
): Promise<void> {
  switch (resource) {
    case "authors": {
      // `blog_posts.author_id` is required, so every post holding the byline
      // would fail its next save on "Choose an author" — drafts included.
      const posts = await postsByAuthor(id);
      if (posts.length > 0) {
        blockers.push({
          title: "Has posts",
          detail: `They are the author of ${count(posts.length, "post")} (${nameList(posts.map((p) => p.title))}). Give ${posts.length === 1 ? "that post" : "each of those posts"} a different author, or delete ${posts.length === 1 ? "it" : "them"}.`,
          items: posts.map((p) => ({ label: `Post: ${p.title}`, href: `/admin/blog/${p.id}` })),
        });
      }
      return;
    }

    case "blog": {
      const [relating, latest] = await Promise.all([postsRelatingTo(id), latestLivePostId()]);
      const liveRelating = relating.filter((p) => p.live);
      const draftRelating = relating.filter((p) => !p.live);

      // Baseline item 14: related posts must exist and resolve. A live post
      // still pointing here would fail its publish check on its next save.
      if (liveRelating.length > 0 && isLive("blog", row)) {
        blockers.push({
          title: "Chosen as related reading",
          detail: `${count(liveRelating.length, "live post")} list${liveRelating.length === 1 ? "s" : ""} it under Related posts (${nameList(liveRelating.map((p) => p.title))}). Take it off ${liveRelating.length === 1 ? "that post’s" : "those posts’"} Related posts first.`,
          items: liveRelating.map((p) => ({ label: `Post: ${p.title}`, href: `/admin/blog/${p.id}` })),
        });
      }
      if (draftRelating.length > 0) {
        effects.push({
          title: "Related reading on drafts",
          detail: `${count(draftRelating.length, "draft")} list${draftRelating.length === 1 ? "s" : ""} it under Related posts, and will need it removed before publishing.`,
          items: draftRelating.map((p) => ({ label: `Post: ${p.title}`, href: `/admin/blog/${p.id}` })),
        });
      }
      if (latest === id) {
        effects.push({
          title: "Homepage",
          detail: "It is the latest article on the homepage. The next newest live post takes its place.",
        });
      }
      return;
    }

    case "services": {
      const [relating, branches, attached, open] = await Promise.all([
        servicesRelatingTo(id),
        locationsOf("services", id),
        testimonialsAttachedTo("serviceId", id),
        openBookingCount("serviceId", id),
      ]);
      if (relating.length > 0) {
        effects.push({
          title: "Related services",
          detail: `Drops out of the related services on ${nameList(relating.map((s) => s.name))}.`,
          items: relating.map((s) => ({ label: `Service: ${s.name}`, href: `/admin/services/${s.id}` })),
        });
      }
      if (branches.length > 0) {
        effects.push({
          title: "Branch pages",
          detail: `No longer listed on ${nameList(branches.map((b) => b.name))}.`,
        });
      }
      if (attached.length > 0) {
        effects.push({
          title: "Testimonials",
          detail: `${count(attached.length, "testimonial is", "testimonials are")} attached to this service. ${attached.length === 1 ? "It stays" : "They stay"} as ${attached.length === 1 ? "it is" : "they are"}, and the attachment comes back if the service is restored.`,
        });
      }
      if (open > 0) {
        effects.push({
          title: "Open bookings",
          detail: `${count(open, "booking")} still being handled ${open === 1 ? "names" : "name"} this service. ${open === 1 ? "It stays" : "They stay"} in Bookings unchanged.`,
        });
      }
      return;
    }

    case "doctors": {
      const [linkedAuthors, branches] = await Promise.all([
        authorsLinkedToDoctor(id),
        locationsOf("doctors", id),
      ]);
      if (linkedAuthors.length > 0) {
        effects.push({
          title: "Author bylines",
          detail: `${nameList(linkedAuthors.map((a) => a.name))} ${linkedAuthors.length === 1 ? "is" : "are"} linked to this profile. Their bylines stop linking to it.`,
          items: linkedAuthors.map((a) => ({ label: `Author: ${a.name}`, href: `/admin/authors/${a.id}` })),
        });
      }
      if (branches.length > 0) {
        effects.push({
          title: "Branch pages",
          detail: `No longer listed among the specialists at ${nameList(branches.map((b) => b.name))}.`,
        });
      }
      return;
    }

    case "locations": {
      const [others, at, attached, open] = await Promise.all([
        otherPublishedLocationCount(id),
        rowsAtLocation(id),
        testimonialsAttachedTo("locationId", id),
        openBookingCount("locationId", id),
      ]);

      // The booking form's first step is choosing a branch (§7). With none
      // published, nobody can book.
      if (published && others === 0) {
        blockers.push({
          title: "Last branch on the site",
          detail: "It is the only published branch, and the booking form needs at least one. Publish another branch first.",
        });
      }
      if (open > 0) {
        effects.push({
          title: "Open bookings",
          detail: `${count(open, "booking")} still being handled ${open === 1 ? "is" : "are"} at this branch. ${open === 1 ? "It stays" : "They stay"} in Bookings unchanged, and new bookings can no longer choose it.`,
        });
      }
      const listed = [
        at.services.length > 0 ? count(at.services.length, "service") : null,
        at.doctors.length > 0 ? count(at.doctors.length, "doctor") : null,
        at.hmos.length > 0 ? count(at.hmos.length, "HMO") : null,
      ].filter((part): part is string => part !== null);
      if (listed.length > 0) {
        effects.push({
          title: "Services, doctors and HMOs",
          detail: `${joinAnd(listed)} list this branch. They stay published and stop showing it.`,
        });
      }
      if (attached.length > 0) {
        effects.push({
          title: "Testimonials",
          detail: `${count(attached.length, "testimonial is", "testimonials are")} attached to this branch. ${attached.length === 1 ? "It stays" : "They stay"} as ${attached.length === 1 ? "it is" : "they are"}, and the attachment comes back if the branch is restored.`,
        });
      }
      return;
    }

    case "hmos": {
      const [branches, open] = await Promise.all([locationsOf("hmos", id), openBookingCount("hmoId", id)]);
      if (branches.length > 0) {
        effects.push({
          title: "Branch pages",
          detail: `No longer listed as accepted at ${nameList(branches.map((b) => b.name))}.`,
        });
      }
      if (open > 0) {
        effects.push({
          title: "Open bookings",
          detail: `${count(open, "booking")} still being handled ${open === 1 ? "names" : "name"} this HMO. ${open === 1 ? "It stays" : "They stay"} in Bookings unchanged.`,
        });
      }
      return;
    }

    case "testimonials": {
      if (!published || row.consentGiven !== true) return;
      const others = await otherPublicTestimonialCount(id);
      effects.push({
        title: "Homepage",
        detail:
          others === 0
            ? "It is the only testimonial the site can show, so the homepage’s testimonial section disappears."
            : "If it is on the homepage, the next featured testimonial takes its place.",
      });
      return;
    }

    case "awards": {
      if (!published) return;
      const others = await otherPublishedAwardCount(id);
      effects.push({
        title: "About page",
        detail:
          others === 0
            ? "It is the only published award, so the About page’s awards section disappears."
            : "Removed from the awards on the About page.",
      });
      return;
    }

    case "faqs": {
      if (!published) return;
      const category = String(row.category ?? "");
      const [assigned, othersInCategory] = await Promise.all([
        servicesOfFaq(id),
        category === "general" ? otherPublishedFaqCount(id, category) : Promise.resolve(-1),
      ]);
      if (assigned.length > 0) {
        const emptied = assigned.filter((s) => s.othersLeft === 0);
        effects.push({
          title: "Service pages",
          detail: `Removed from the FAQs on ${nameList(assigned.map((s) => s.name))}.${emptied.length > 0 ? ` ${nameList(emptied.map((s) => s.name))} ${emptied.length === 1 ? "has" : "have"} no other FAQs, so ${emptied.length === 1 ? "its" : "their"} FAQ section disappears.` : ""}`,
        });
      }
      if (category === "general") {
        effects.push({
          title: "Homepage and branch pages",
          detail:
            othersInCategory === 0
              ? "It is the only published general FAQ, so the FAQ section on the homepage and branch pages disappears."
              : "Removed from the FAQs on the homepage and branch pages.",
        });
      }
      return;
    }
  }
}
