import { and, asc, count, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  aboutContent,
  authors,
  awards,
  blogPostRelated,
  blogPosts,
  bookings,
  contentSections,
  doctorLocations,
  doctors,
  faqServices,
  faqs,
  hmoLocations,
  hmos,
  locations,
  serviceLocations,
  serviceRelated,
  services,
  testimonials,
} from "@/lib/db/schema";

/**
 * Reads for the pre-delete check (`lib/admin/delete-checks.ts`).
 *
 * Admin-only and uncached, like the other guards: a check that answered from a
 * stale cache would let a delete through that breaks a page published a minute
 * ago. Soft-deleted rows are left out everywhere — a deleted row cannot be
 * broken further, and it holds no live link.
 */

/** Where a piece of linkable text lives, as the editor would open it. */
export type TextSource = "blog" | "services" | "about" | "faqs" | "doctors" | "authors";

export interface TextReferrer {
  source: TextSource;
  /** The owning row — for a page block, the service it sits on. */
  id: string;
  label: string;
  /** Whether a reader can reach the text right now. */
  live: boolean;
  /** Markdown bodies to parse for links. */
  markdown: string[];
  /** Plain hrefs — a call-to-action button's destination. */
  hrefs: string[];
}

/** Statuses still being worked; the rest are history. */
const OPEN_BOOKING_STATUSES = ["new", "contacted", "confirmed"] as const;

/**
 * Every live-or-draft text that contains `needle` (a slug) anywhere.
 *
 * A coarse substring filter in SQL, so only candidate rows travel; the caller
 * parses each with the site's Markdown reader to decide whether it is actually
 * a link. Six small tables, read together.
 */
export async function findTextContaining(needle: string): Promise<TextReferrer[]> {
  if (!needle) return [];
  const has = (column: unknown) => sql`strpos(${column}, ${needle}) > 0`;

  const [posts, blocks, faqRows, doctorRows, authorRows] = await Promise.all([
    db()
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        body: blogPosts.body,
        published: blogPosts.published,
        publishedAt: blogPosts.publishedAt,
      })
      .from(blogPosts)
      .where(and(isNull(blogPosts.deletedAt), has(blogPosts.body))),
    db()
      .select({
        page: contentSections.page,
        serviceId: contentSections.serviceId,
        kind: contentSections.kind,
        data: contentSections.data,
        serviceName: services.name,
        servicePublished: services.published,
        serviceDeletedAt: services.deletedAt,
      })
      .from(contentSections)
      .leftJoin(services, eq(services.id, contentSections.serviceId))
      .where(
        and(
          inArray(contentSections.kind, ["text", "cta"]),
          has(sql`${contentSections.data}::text`),
        ),
      ),
    db()
      .select({ id: faqs.id, question: faqs.question, answer: faqs.answer, published: faqs.published })
      .from(faqs)
      .where(and(isNull(faqs.deletedAt), has(faqs.answer))),
    db()
      .select({ id: doctors.id, name: doctors.name, bio: doctors.bio, published: doctors.published })
      .from(doctors)
      .where(and(isNull(doctors.deletedAt), has(doctors.bio))),
    db()
      .select({
        id: authors.id,
        name: authors.name,
        bio: authors.bio,
        // A byline ignores the author's own `published` flag (see
        // `lib/admin/resources/authors.ts`): the bio is live wherever one of
        // their posts is.
        //
        // Written with explicit aliases: in a single-table select Drizzle
        // renders columns unqualified, so `${blogPosts.authorId} =
        // ${authors.id}` came out as `"author_id" = "id"` and compared the
        // post with itself.
        published: sql<boolean>`exists (
          select 1 from blog_posts p
          where p.author_id = "authors"."id"
            and p.deleted_at is null
            and p.published
            and p.published_at is not null
        )`,
      })
      .from(authors)
      .where(and(isNull(authors.deletedAt), has(authors.bio))),
  ]);

  const found: TextReferrer[] = [
    ...posts.map((post) => ({
      source: "blog" as const,
      id: post.id,
      label: post.title,
      live: post.published && post.publishedAt !== null,
      markdown: [post.body],
      hrefs: [],
    })),
    ...faqRows.map((faq) => ({
      source: "faqs" as const,
      id: faq.id,
      label: faq.question,
      live: faq.published,
      markdown: [faq.answer],
      hrefs: [],
    })),
    ...doctorRows.map((doctor) => ({
      source: "doctors" as const,
      id: doctor.id,
      label: doctor.name,
      live: doctor.published,
      markdown: [doctor.bio],
      hrefs: [],
    })),
    ...authorRows.map((author) => ({
      source: "authors" as const,
      id: author.id,
      label: author.name,
      live: author.published,
      markdown: [author.bio],
      hrefs: [],
    })),
  ];

  // Page blocks, grouped by the page they sit on: one finding per page, not
  // one per block, because the page is what the editor opens.
  const pages = new Map<string, TextReferrer>();
  let aboutLive: boolean | null = null;

  for (const block of blocks) {
    if (block.page === "service" && (block.serviceId === null || block.serviceDeletedAt !== null)) {
      continue;
    }

    const key = block.page === "about" ? "about" : `service:${block.serviceId}`;
    let page = pages.get(key);
    if (!page) {
      if (block.page === "about" && aboutLive === null) aboutLive = await isAboutPublished();
      page =
        block.page === "about"
          ? { source: "about", id: "about", label: "About page", live: aboutLive === true, markdown: [], hrefs: [] }
          : {
              source: "services",
              id: block.serviceId as string,
              label: block.serviceName ?? "A service",
              live: block.servicePublished === true,
              markdown: [],
              hrefs: [],
            };
      pages.set(key, page);
    }

    const data = block.data;
    if (block.kind === "text" && typeof data.body === "string") page.markdown.push(data.body);
    if (block.kind === "cta" && typeof data.href === "string") page.hrefs.push(data.href);
  }

  return [...found, ...pages.values()];
}

async function isAboutPublished(): Promise<boolean> {
  const rows = await db().select({ published: aboutContent.published }).from(aboutContent).limit(1);
  return rows[0]?.published === true;
}

/** Every post carrying the byline, drafts included. The form requires one. */
export async function postsByAuthor(authorId: string) {
  return db()
    .select({ id: blogPosts.id, title: blogPosts.title })
    .from(blogPosts)
    .where(and(eq(blogPosts.authorId, authorId), isNull(blogPosts.deletedAt)))
    .orderBy(asc(blogPosts.title));
}

/** Posts that chose `postId` under Related posts, split by whether they are live. */
export async function postsRelatingTo(postId: string) {
  const rows = await db()
    .select({
      id: blogPosts.id,
      title: blogPosts.title,
      published: blogPosts.published,
      publishedAt: blogPosts.publishedAt,
    })
    .from(blogPostRelated)
    .innerJoin(blogPosts, eq(blogPosts.id, blogPostRelated.postId))
    .where(and(eq(blogPostRelated.relatedId, postId), isNull(blogPosts.deletedAt)))
    .orderBy(asc(blogPosts.title));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    live: row.published && row.publishedAt !== null,
  }));
}

/** The id of the newest live post — the one the homepage features. */
export async function latestLivePostId(): Promise<string | null> {
  const rows = await db()
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(
      and(isNull(blogPosts.deletedAt), eq(blogPosts.published, true), isNotNull(blogPosts.publishedAt)),
    )
    .orderBy(sql`${blogPosts.publishedAt} desc`)
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Published branches other than `locationId`. `/book` needs at least one. */
export async function otherPublishedLocationCount(locationId: string): Promise<number> {
  const rows = await db()
    .select({ n: count() })
    .from(locations)
    .where(and(eq(locations.published, true), isNull(locations.deletedAt), ne(locations.id, locationId)));
  return rows[0]?.n ?? 0;
}

/** Bookings still being worked that name this branch, service or HMO. */
export async function openBookingCount(
  column: "locationId" | "serviceId" | "hmoId",
  id: string,
): Promise<number> {
  const rows = await db()
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings[column], id), inArray(bookings.status, [...OPEN_BOOKING_STATUSES])));
  return rows[0]?.n ?? 0;
}

/** Testimonials attached to a service or branch. Labelled without the patient's name. */
export async function testimonialsAttachedTo(column: "serviceId" | "locationId", id: string) {
  return db()
    .select({ id: testimonials.id, slug: testimonials.slug })
    .from(testimonials)
    .where(and(eq(testimonials[column], id), isNull(testimonials.deletedAt)));
}

/** Authors whose byline links to this doctor's profile. */
export async function authorsLinkedToDoctor(doctorId: string) {
  return db()
    .select({ id: authors.id, name: authors.name })
    .from(authors)
    .where(and(eq(authors.doctorId, doctorId), isNull(authors.deletedAt)))
    .orderBy(asc(authors.name));
}

/** Services that list `serviceId` among their related services. */
export async function servicesRelatingTo(serviceId: string) {
  return db()
    .select({ id: services.id, name: services.name })
    .from(serviceRelated)
    .innerJoin(services, eq(services.id, serviceRelated.serviceId))
    .where(and(eq(serviceRelated.relatedId, serviceId), isNull(services.deletedAt)))
    .orderBy(asc(services.name));
}

/** What a branch's page lists: its services, doctors and HMOs. */
export async function rowsAtLocation(locationId: string) {
  const [serviceRows, doctorRows, hmoRows] = await Promise.all([
    db()
      .select({ id: services.id, name: services.name })
      .from(serviceLocations)
      .innerJoin(services, eq(services.id, serviceLocations.serviceId))
      .where(and(eq(serviceLocations.locationId, locationId), isNull(services.deletedAt)))
      .orderBy(asc(services.name)),
    db()
      .select({ id: doctors.id, name: doctors.name })
      .from(doctorLocations)
      .innerJoin(doctors, eq(doctors.id, doctorLocations.doctorId))
      .where(and(eq(doctorLocations.locationId, locationId), isNull(doctors.deletedAt)))
      .orderBy(asc(doctors.name)),
    db()
      .select({ id: hmos.id, name: hmos.name })
      .from(hmoLocations)
      .innerJoin(hmos, eq(hmos.id, hmoLocations.hmoId))
      .where(and(eq(hmoLocations.locationId, locationId), isNull(hmos.deletedAt)))
      .orderBy(asc(hmos.name)),
  ]);
  return { services: serviceRows, doctors: doctorRows, hmos: hmoRows };
}

/** The branches a doctor, service or HMO is listed at. */
export async function locationsOf(owner: "doctors" | "services" | "hmos", id: string) {
  const join =
    owner === "doctors"
      ? { table: doctorLocations, own: doctorLocations.doctorId, other: doctorLocations.locationId }
      : owner === "services"
        ? { table: serviceLocations, own: serviceLocations.serviceId, other: serviceLocations.locationId }
        : { table: hmoLocations, own: hmoLocations.hmoId, other: hmoLocations.locationId };

  return db()
    .select({ id: locations.id, name: locations.name })
    .from(join.table)
    .innerJoin(locations, eq(locations.id, join.other))
    .where(and(eq(join.own, id), isNull(locations.deletedAt), eq(locations.published, true)))
    .orderBy(asc(locations.name));
}

/**
 * The live services an FAQ is assigned to, each with how many other live FAQs
 * it has — a service left with none shows no FAQ section at all.
 */
export async function servicesOfFaq(faqId: string) {
  const assigned = await db()
    .select({ id: services.id, name: services.name })
    .from(faqServices)
    .innerJoin(services, eq(services.id, faqServices.serviceId))
    .where(and(eq(faqServices.faqId, faqId), isNull(services.deletedAt), eq(services.published, true)))
    .orderBy(asc(services.name));
  if (assigned.length === 0) return [];

  const others = await db()
    .select({ serviceId: faqServices.serviceId, n: count() })
    .from(faqServices)
    .innerJoin(faqs, eq(faqs.id, faqServices.faqId))
    .where(
      and(
        inArray(faqServices.serviceId, assigned.map((s) => s.id)),
        ne(faqs.id, faqId),
        isNull(faqs.deletedAt),
        eq(faqs.published, true),
      ),
    )
    .groupBy(faqServices.serviceId);
  const remaining = new Map(others.map((row) => [row.serviceId, row.n]));

  return assigned.map((service) => ({ ...service, othersLeft: remaining.get(service.id) ?? 0 }));
}

/** Other published FAQs in a category — the homepage and branch pages show `general`. */
export async function otherPublishedFaqCount(faqId: string, category: string): Promise<number> {
  const rows = await db()
    .select({ n: count() })
    .from(faqs)
    .where(
      and(
        isNull(faqs.deletedAt),
        eq(faqs.published, true),
        ne(faqs.id, faqId),
        sql`${faqs.category}::text = ${category}`,
      ),
    );
  return rows[0]?.n ?? 0;
}

/** Other testimonials the public site may show: published and consented. */
export async function otherPublicTestimonialCount(testimonialId: string): Promise<number> {
  const rows = await db()
    .select({ n: count() })
    .from(testimonials)
    .where(
      and(
        isNull(testimonials.deletedAt),
        eq(testimonials.published, true),
        eq(testimonials.consentGiven, true),
        ne(testimonials.id, testimonialId),
      ),
    );
  return rows[0]?.n ?? 0;
}

/** Other published awards — the About page drops its awards section at none. */
export async function otherPublishedAwardCount(awardId: string): Promise<number> {
  const rows = await db()
    .select({ n: count() })
    .from(awards)
    .where(and(isNull(awards.deletedAt), eq(awards.published, true), ne(awards.id, awardId)));
  return rows[0]?.n ?? 0;
}
