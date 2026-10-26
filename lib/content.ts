import { draftMode } from "next/headers";

import {
  getLatestPost,
  getPostBySlug as getPostRow,
  getPostsByTag as getPostsByTagRows,
  getPublishedPosts,
  getRelatedPosts as getRelatedPostRows,
  getTagCounts,
  searchPosts,
  type BlogPostWithAuthor,
  type BlogTagCount,
} from "@/lib/db/queries/blog";
import { getAwards as getAwardRows } from "@/lib/db/queries/awards";
import {
  getDoctorBySlug as getDoctorRow,
  getDoctorsByLocation as getDoctorRowsByLocation,
  getLocationsByDoctor as getLocationRowsByDoctor,
  getPublishedDoctors,
} from "@/lib/db/queries/doctors";
import { getPublishedHmos } from "@/lib/db/queries/hmos";
import {
  getSiteSettings as getSiteSettingsRow,
  type SiteSettings,
} from "@/lib/db/queries/site-settings";
import {
  getLocationBySlug as getLocationRow,
  getPublishedLocations,
} from "@/lib/db/queries/locations";
import { getFaqsByCategory as getFaqRows } from "@/lib/db/queries/faqs";
import {
  getMediaByIds,
  listLocationGallery,
  listServiceGallery,
} from "@/lib/db/queries/media";
import {
  getPublishedServices,
  getRelatedServices as getRelatedServiceRows,
  getServiceBySlug as getServiceRow,
} from "@/lib/db/queries/services";
import { getFeaturedTestimonials as getFeaturedTestimonialRows } from "@/lib/db/queries/testimonials";
import type {
  Award as AwardRow,
  Doctor as DoctorRow,
  Faq as FaqRow,
  Hmo as HmoRow,
  Location as LocationRow,
  Service as ServiceRow,
  Testimonial as TestimonialRow,
} from "@/lib/db/schema";
import type { ReadOptions } from "@/lib/db/queries/shared";
import { collectMediaIds, parseMarkdown } from "@/lib/markdown";
import type { Hours } from "@/lib/validation/hours";

/**
 * Site content layer.
 *
 * Reads Postgres through the repository layer in `lib/db/queries/*` and maps
 * each row onto the snake_case shapes the templates already consume. The
 * mapping is the whole point: query rows are camelCase Drizzle types that track
 * the schema, while the shapes below are the contract the components render
 * against. Keeping the two apart means a column rename does not ripple into
 * fifteen components.
 *
 * Every getter is async. Server components await them directly; client
 * components must not import anything from this module except **types**, which
 * TypeScript erases — importing a getter into a client bundle would pull the
 * Neon driver in with it.
 *
 * ## Draft mode
 *
 * This is also the one place that asks whether the request is in Next's draft
 * mode (spec §8 Content editing, decision C4). Every getter checks it and, when
 * it is on, reads unpublished rows straight from Postgres instead of through
 * `cachedRead` — §5 forbids caching a read that depended on who was asking.
 * The repository layer takes that answer as an argument and never reads the
 * cookie itself, so a query stays callable from a script or a test.
 */

/**
 * An image on a content row, resolved from the `media` table.
 *
 * `url` and `alt` come from the media row, so one asset cannot be described
 * two different ways on two pages. `width` and `height` are what `next/image`
 * needs to reserve space before the bytes arrive; they are null only for rows
 * uploaded before migration 0004, and a template with no dimensions renders
 * the alt text rather than a figure that shifts the layout (spec §13).
 */
export interface ContentImage {
  url: string;
  /** "" means deliberately decorative — never "nobody has written one yet". */
  alt: string;
  width: number | null;
  height: number | null;
}

export type ServiceFamily =
  | "family_healthcare"
  | "women_and_children"
  | "specialist"
  | "diagnostics";

export interface Service {
  id: string;
  slug: string;
  name: string;
  family: ServiceFamily;
  /** Null when the seed has not supplied one — see `isSeedGap`. */
  short_description: string | null;
  /**
   * `media.id`, not a URL. No template renders a service image yet — the cards
   * and the detail hero use their `SiteImage` slot, which is served by the
   * build-time asset pipeline. This is here so the admin panel has somewhere to
   * put an editorial upload; a template that wants one resolves it the way
   * `BlogPost.hero_image` is resolved.
   */
  featured_image_id: string | null;
  order: number;
  published: boolean;
  /** Prose for the detail page. Null until the seed supplies it. */
  what_to_expect: string | null;
  /** Bullet list. Empty until the seed supplies one. */
  who_its_for: string[];
  /** Bullet list. Empty until the seed supplies one. */
  how_to_access: string[];
  typical_wait_time: string | null;
}

export interface Doctor {
  id: string;
  slug: string;
  name: string;
  /** "Consultant Paediatrician". Always present — the column is NOT NULL. */
  title: string;
  qualifications: string[];
  /** Null when the number has not been supplied. Never inferred from anything. */
  years_experience: number | null;
  specialties: string[];
  languages_spoken: string[];
  /** Markdown, 80–120 words per spec §5. Rendered by `ArticleBody`. */
  bio: string | null;
  /**
   * UploadThing key, not a URL and not rendered today. The profile template
   * uses the local `portrait` asset slot like every other photo on the site —
   * see the note in `app/(marketing)/doctors/[slug]/page.tsx`.
   */
  /** `media.id`, not a URL — see `Service.featured_image_id`. */
  headshot_id: string | null;
  in_house: boolean;
  visiting: boolean;
  order: number;
  published: boolean;
}

export interface Award {
  id: string;
  slug: string;
  name: string;
  awarding_body: string;
  year: number;
  description: string | null;
  /** Absolute URL to the awarding body's own page, when one was supplied. */
  external_link: string | null;
  order: number;
  published: boolean;
}

export interface Faq {
  id: string;
  slug: string;
  question: string;
  answer: string;
  category: "general" | "booking" | "services" | "insurance" | "emergencies";
}

export interface Hmo {
  id: string;
  slug: string;
  name: string;
  /**
   * Other names this provider trades under, searched alongside `name` by the
   * typeahead. Optional: most records do not need one, because generic tokens
   * ("HMO", "Health") are stripped at match time rather than aliased per record.
   */
  aliases?: string[];
  /** `media.id`, not a URL — see `Service.featured_image_id`. */
  logo_id: string | null;
  coverage_notes: string | null;
  copay_applies: boolean;
  order: number;
  published: boolean;
}

export interface Testimonial {
  id: string;
  slug: string;
  patient_name: string;
  name_format: "full" | "first_only" | "initials";
  /** `media.id`, not a URL — see `Service.featured_image_id`. */
  avatar_id: string | null;
  quote: string;
  featured: boolean;
  order: number;
  published: boolean;
}

export interface Location {
  id: string;
  slug: string;
  name: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  country: string;
  phone: string;
  whatsapp: string | null;
  emergency_line: string;
  order: number;
  published: boolean;

  /*
   * Nullable on the row and still frequently unset. They stay optional here so
   * the type says "may not have been supplied at all", and every template is
   * forced to handle that case instead of rendering `null`.
   *
   * TODO(seed): hours, coordinates, parking, accessibility and photos are all
   * outstanding for Victoria Island, and three further branches implied by
   * .env.example are not seeded at all. See seed/README.md.
   */

  /** Decimal degrees, as strings — matches the numeric column in the schema. */
  latitude?: string | null;
  longitude?: string | null;
  /** `{}` means the schedule has not been confirmed. */
  hours?: Hours | Record<string, never>;
  parking_info?: string | null;
  accessibility_notes?: string | null;
  /** `media.id`, not a URL — see `Service.featured_image_id`. */
  hero_image_id?: string | null;
}

export type BlogCategory =
  | "seasonal_alerts"
  | "family_health"
  | "women_and_children"
  | "corporate_wellness";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Markdown source. Rendered by `components/site/article-body.tsx`. */
  body: string;
  /** Resolved from `media`. Null when no hero image has been set. */
  hero_image: ContentImage | null;
  category: BlogCategory;
  tags: string[];
  /** ISO 8601. Never null here — the query layer only returns published posts. */
  published_at: string;
  author_name: string;
  author_slug: string;
}

/* -------------------------------------------------------------------------- */
/* Row mappers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The literal string the seed files use to mark a field nobody has written yet.
 *
 * `seed/services.json` ships `"short_description": "TODO(seed)"` rather than
 * omitting the key, because `what_to_expect` is `NOT NULL` and the row has to
 * exist for the service to appear at all. That sentinel reaches the database
 * verbatim, so without this guard a template renders the words "TODO(seed)" to
 * a patient reading about a fertility clinic.
 *
 * Normalising it to `null` here — at the one boundary every template reads
 * through — means a page cannot leak it by forgetting to check, and the empty
 * state a template already has to handle is the state it gets.
 */
const SEED_SENTINEL = /^\s*TODO\(seed\)\s*$/i;

/** True when `value` is absent or is an unwritten seed placeholder. */
export function isSeedGap(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "" || SEED_SENTINEL.test(value);
}

/** `value`, or null when it is absent or an unwritten seed placeholder. */
function realOrNull(value: string | null): string | null {
  return isSeedGap(value) ? null : value;
}

/**
 * Fold a left-joined media row into a `ContentImage`.
 *
 * Null unless the asset is actually usable: no row, or no dimensions. A hero
 * image whose width and height are unknown cannot be given to `next/image`
 * without either guessing a ratio or shipping a layout shift, and CLS < 0.05 is
 * a hard budget (spec §13). Those rows predate migration 0004; re-uploading the
 * asset records its dimensions and the figure appears.
 */
function toContentImage(row: {
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  heroImageWidth: number | null;
  heroImageHeight: number | null;
}): ContentImage | null {
  if (row.heroImageUrl === null) return null;
  if (row.heroImageWidth === null || row.heroImageHeight === null) return null;

  return {
    url: row.heroImageUrl,
    alt: row.heroImageAlt ?? "",
    width: row.heroImageWidth,
    height: row.heroImageHeight,
  };
}

/** Drops unwritten placeholders from a seeded list. */
function realEntries(values: string[]): string[] {
  return values.filter((value) => !isSeedGap(value));
}

function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    family: row.family,
    short_description: realOrNull(row.shortDescription),
    featured_image_id: row.featuredImageId,
    order: row.order,
    published: row.published,
    what_to_expect: realOrNull(row.whatToExpect),
    who_its_for: realEntries(row.whoItsFor),
    how_to_access: realEntries(row.howToAccess),
    typical_wait_time: realOrNull(row.typicalWaitTime),
  };
}

/**
 * `bio` is `NOT NULL` on the row, so an unwritten one arrives as the
 * `TODO(seed)` sentinel rather than as null — `realOrNull` is what keeps those
 * three words off a doctor's profile page.
 */
function toDoctor(row: DoctorRow): Doctor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    title: row.title,
    qualifications: realEntries(row.qualifications),
    years_experience: row.yearsExperience,
    specialties: realEntries(row.specialties),
    languages_spoken: realEntries(row.languagesSpoken),
    bio: realOrNull(row.bio),
    headshot_id: row.headshotId,
    in_house: row.inHouse,
    visiting: row.visiting,
    order: row.order,
    published: row.published,
  };
}

function toAward(row: AwardRow): Award {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    awarding_body: row.awardingBody,
    year: row.year,
    description: realOrNull(row.description),
    external_link: row.externalLink,
    order: row.order,
    published: row.published,
  };
}

function toFaq(row: FaqRow): Faq {
  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    answer: row.answer,
    category: row.category,
  };
}

function toHmo(row: HmoRow): Hmo {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    aliases: row.aliases,
    logo_id: row.logoId,
    coverage_notes: row.coverageNotes,
    copay_applies: row.copayApplies,
    order: row.order,
    published: row.published,
  };
}

function toTestimonial(row: TestimonialRow): Testimonial {
  return {
    id: row.id,
    slug: row.slug,
    patient_name: row.patientName,
    name_format: row.nameFormat,
    avatar_id: row.avatarId,
    quote: row.quote,
    featured: row.featured,
    order: row.order,
    published: row.published,
  };
}

function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address_line_1: row.addressLine1,
    address_line_2: row.addressLine2,
    city: row.city,
    state: row.state,
    country: row.country,
    phone: row.phone,
    whatsapp: row.whatsapp,
    emergency_line: row.emergencyLine,
    order: row.order,
    published: row.published,
    latitude: row.latitude,
    longitude: row.longitude,
    hours: row.hours,
    parking_info: row.parkingInfo,
    accessibility_notes: row.accessibilityNotes,
    hero_image_id: row.heroImageId,
  };
}

/**
 * Timestamp from a cached repository row, as an ISO string.
 *
 * The row types say `Date`, and on a cache miss that is what Drizzle returns.
 * On a hit it is not: `cachedRead` wraps `unstable_cache`, which serialises its
 * result to JSON, and JSON has no Date — so the same field arrives as an ISO
 * string. TypeScript cannot see the round trip and keeps claiming `Date`, which
 * is why this takes `unknown` and narrows rather than trusting the declared
 * type.
 *
 * Belongs here rather than in the queries: `lib/content.ts` is the seam between
 * database shapes and what components render, and this is exactly a database
 * shape not surviving the trip.
 */
function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();

  throw new TypeError("Expected a Date or an ISO date string");
}

/**
 * `publishedAt` is `timestamp | null` on the row, but every query that produces
 * a `BlogPostWithAuthor` filters on `published_at IS NOT NULL`. The fallback to
 * `createdAt` exists so this mapper is total rather than throwing, and is
 * unreachable through the public queries.
 */
function toBlogPost(row: BlogPostWithAuthor): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    hero_image: toContentImage(row),
    category: row.category,
    tags: row.tags,
    published_at: toIsoString(row.publishedAt ?? row.createdAt),
    author_name: row.authorName,
    author_slug: row.authorSlug,
  };
}

/* -------------------------------------------------------------------------- */
/* Draft mode                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Read options for this request: `{ draft: true }` inside Next's draft mode.
 *
 * Draft mode is enabled by `/api/preview`, which admits nobody without a
 * session and `read` on the resource being previewed. Reaching the cookie is
 * therefore already an authorisation decision; this function only reports it.
 *
 * `draftMode()` throws when there is no request to read — a seed run, a unit
 * test, a script importing a getter directly — so that case is caught and
 * answered `false` rather than made every caller's problem. It does **not**
 * throw during prerendering: `next build` gets an empty draft-mode provider and
 * a `false`, with no bail-out, so every statically rendered route stays static
 * and the §13 budgets are unaffected.
 */
async function readOptions(): Promise<ReadOptions> {
  try {
    return { draft: (await draftMode()).isEnabled };
  } catch {
    return { draft: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Getters                                                                    */
/* -------------------------------------------------------------------------- */

/** Published services, in display order. Unpublished ones in draft mode. */
export async function getServices(): Promise<Service[]> {
  return (await getPublishedServices(await readOptions())).map(toService);
}

/** One published service by slug, or null when the slug is unknown. */
export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const row = await getServiceRow(slug, await readOptions());
  return row ? toService(row) : null;
}

/** Published services explicitly related to the given one, in display order. */
export async function getRelatedServices(
  serviceId: string,
): Promise<Service[]> {
  return (await getRelatedServiceRows(serviceId, await readOptions())).map(
    toService,
  );
}

/** Published doctors, in display order. Unpublished ones in draft mode. */
export async function getDoctors(): Promise<Doctor[]> {
  return (await getPublishedDoctors(await readOptions())).map(toDoctor);
}

/** One doctor by slug, or null when the slug is unknown or unpublished. */
export async function getDoctorBySlug(slug: string): Promise<Doctor | null> {
  const row = await getDoctorRow(slug, await readOptions());
  return row ? toDoctor(row) : null;
}

/** Doctors practising at one branch, in display order. */
export async function getDoctorsByLocation(
  locationId: string,
): Promise<Doctor[]> {
  return (await getDoctorRowsByLocation(locationId, await readOptions())).map(
    toDoctor,
  );
}

/**
 * The branches one doctor practises at.
 *
 * Published branches only — the profile links to each one, and a link to an
 * unpublished branch is a link to a 404.
 */
export async function getLocationsByDoctor(
  doctorId: string,
): Promise<Location[]> {
  return (await getLocationRowsByDoctor(doctorId, await readOptions())).map(
    toLocation,
  );
}

/**
 * Published awards, newest year first within display order.
 *
 * The `logo_id` and `certificate_image_id` columns are foreign keys into
 * `media` and are not read here: nothing renders them yet, and resolving them
 * would mean a join per award for an image the timeline does not show. The
 * timeline is text, which is what spec §6 asks for.
 */
export async function getAwards(): Promise<Award[]> {
  return (await getAwardRows(await readOptions())).map(toAward);
}

/**
 * Published FAQs in one category.
 *
 * FAQs are categorised, not attached to individual services, so every service
 * page shows the same `services` set. That is what the schema supports; a
 * per-service FAQ is a Phase 2 relation, not something to fake by filtering on
 * question text.
 */
export async function getFaqs(category: Faq["category"]): Promise<Faq[]> {
  return (await getFaqRows(category, await readOptions())).map(toFaq);
}

export type { SiteSettings };

/**
 * Site settings — the non-secret display values an operator can change without
 * a deploy (decision C2 option B).
 *
 * No draft-mode branch: there is one row and nothing to preview. Returns the
 * "nothing confirmed yet" shape rather than throwing when the row is missing,
 * so a database that predates migration 0003 renders the placeholders instead
 * of a 500 on every page carrying a form.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  return getSiteSettingsRow();
}

/** Published HMOs, in display order. Unpublished ones in draft mode. */
export async function getHmos(): Promise<Hmo[]> {
  return (await getPublishedHmos(await readOptions())).map(toHmo);
}

/** Published branch locations, in display order. Unpublished in draft mode. */
export async function getLocations(): Promise<Location[]> {
  return (await getPublishedLocations(await readOptions())).map(toLocation);
}

/**
 * Featured testimonials, capped at `limit`.
 *
 * Spec §6 asks for two on the homepage. The query layer additionally requires
 * recorded consent, so a testimonial whose consent has not been confirmed does
 * not appear here — see seed/README.md. The component renders whatever this
 * returns rather than padding with invented content.
 *
 * Draft mode lifts `published` and nothing else: an unconsented quote stays
 * invisible in a preview too, because a preview URL is a real URL.
 */
export async function getFeaturedTestimonials(
  limit = 2,
): Promise<Testimonial[]> {
  return (await getFeaturedTestimonialRows(limit, await readOptions())).map(
    toTestimonial,
  );
}

/** Published posts, newest first. `limit` is optional — omit it for the index. */
export async function getBlogPosts(limit?: number): Promise<BlogPost[]> {
  return (await getPublishedPosts(limit, await readOptions())).map(toBlogPost);
}

/** Most recently published blog post, or null when none is published yet. */
export async function getLatestBlogPost(): Promise<BlogPost | null> {
  const post = await getLatestPost(await readOptions());
  return post ? toBlogPost(post) : null;
}

/** One published post by slug, or null when it is unknown or unpublished. */
export async function getBlogPostBySlug(
  slug: string,
): Promise<BlogPost | null> {
  const post = await getPostRow(slug, await readOptions());
  return post ? toBlogPost(post) : null;
}

/**
 * Posts to read next: curated links where an editor has set them, otherwise
 * same-category posts. Never includes `post` itself.
 */
export async function getRelatedBlogPosts(
  post: BlogPost,
  limit = 3,
): Promise<BlogPost[]> {
  const options = await readOptions();
  const row = await getPostRow(post.slug, options);
  if (!row) return [];
  return (await getRelatedPostRows(row, limit, options)).map(toBlogPost);
}

/** One tag and how many published posts carry it. */
export type BlogTag = BlogTagCount;

/**
 * Published posts matching a visitor's search terms, best match first.
 *
 * Not cached, and deliberately so. A search result is keyed on arbitrary input,
 * so caching it would fill the cache with one entry per phrase anybody ever
 * typed. The index behind it is what makes the query cheap instead.
 */
export async function searchBlogPosts(query: string): Promise<BlogPost[]> {
  return (await searchPosts(query, await readOptions())).map(toBlogPost);
}

/** Published posts carrying one tag, newest first. */
export async function getBlogPostsByTag(tag: string): Promise<BlogPost[]> {
  return (await getPostsByTagRows(tag, await readOptions())).map(toBlogPost);
}

/** Every tag in use on a published post, most-used first. */
export async function getBlogTags(): Promise<BlogTag[]> {
  return getTagCounts(await readOptions());
}

/**
 * The `media` rows a post body's figures reference, keyed by id.
 *
 * Handed to `components/site/article-body.tsx`, which renders what it is given
 * and does no database work of its own. One indexed query by id, and only when
 * the body actually contains a figure — a body with none does not touch the
 * database at all.
 *
 * Not cached. The page that calls it is already revalidated on a schedule, and
 * the media library is mutable in a way the public content tags do not cover:
 * an editor fixing alt text should not have to wait out a second cache layer
 * that nothing invalidates.
 */
export async function getBodyImages(
  body: string,
): Promise<ReadonlyMap<string, ContentImage>> {
  const ids = collectMediaIds(parseMarkdown(body));
  if (ids.length === 0) return new Map();

  const rows = await getMediaByIds(ids);
  const resolved = new Map<string, ContentImage>();

  for (const [id, row] of rows) {
    resolved.set(id, {
      url: row.url,
      alt: row.alt,
      width: row.width,
      height: row.height,
    });
  }

  return resolved;
}

/**
 * A gallery's images, in the order an editor arranged them.
 *
 * `media` rows carry their own alt text and intrinsic dimensions, so a gallery
 * needs no per-template mapping beyond this one. A row with no dimensions is
 * dropped rather than rendered: `next/image` cannot reserve space for it and an
 * unsized image in a grid is a CLS breach (spec §13). Only rows uploaded before
 * migration 0004 lack them, and re-saving the asset in `/admin/media` fills
 * them in.
 *
 * Alt text is passed through exactly as stored, `""` included — an editor who
 * left it empty marked the image decorative, and inventing a description for a
 * photograph of a hospital ward is the same failure as inventing its copy.
 *
 * Not cached, for the reason `getBodyImages` is not: an editor fixing alt text
 * should not wait out a second cache layer that nothing invalidates.
 */
function toGallery(rows: readonly { url: string; alt: string; width: number | null; height: number | null }[]): ContentImage[] {
  return rows
    .filter((row) => row.width !== null && row.height !== null)
    .map((row) => ({
      url: row.url,
      alt: row.alt,
      width: row.width,
      height: row.height,
    }));
}

/** A service's gallery images, in the editor's order. Empty when it has none. */
export async function getServiceGallery(
  serviceId: string,
): Promise<ContentImage[]> {
  return toGallery(await listServiceGallery(serviceId));
}

/** A branch's gallery images, in the editor's order. Empty when it has none. */
export async function getLocationGallery(
  locationId: string,
): Promise<ContentImage[]> {
  return toGallery(await listLocationGallery(locationId));
}

/**
 * The headshots for a set of doctors, keyed by doctor id.
 *
 * `Doctor.headshot_id` is a `media.id`, so a template that wants the photograph
 * has to resolve it — the same trip `BlogPost.hero_image` makes, done in one
 * indexed query for the whole list rather than per card. Doctors with no
 * headshot are simply absent from the map, and the caller renders its
 * placeholder.
 *
 * Not cached, for the reason `getBodyImages` is not: an editor who fixes a
 * photograph's alt text should not wait out a second cache layer.
 */
export async function getDoctorHeadshots(
  doctors: readonly Doctor[],
): Promise<ReadonlyMap<string, ContentImage>> {
  const byMediaId = new Map<string, string[]>();

  for (const doctor of doctors) {
    if (!doctor.headshot_id) continue;
    const doctorIds = byMediaId.get(doctor.headshot_id) ?? [];
    doctorIds.push(doctor.id);
    byMediaId.set(doctor.headshot_id, doctorIds);
  }

  if (byMediaId.size === 0) return new Map();

  const rows = await getMediaByIds([...byMediaId.keys()]);
  const resolved = new Map<string, ContentImage>();

  for (const [mediaId, row] of rows) {
    for (const doctorId of byMediaId.get(mediaId) ?? []) {
      resolved.set(doctorId, {
        url: row.url,
        alt: row.alt,
        width: row.width,
        height: row.height,
      });
    }
  }

  return resolved;
}

/**
 * The logos uploaded in `/admin/hmos`, keyed by HMO id.
 *
 * The same trip `getDoctorHeadshots` makes. HMOs with no uploaded logo, or one
 * uploaded before migration 0004 recorded dimensions, are absent from the map,
 * and the caller falls back to the bundled file in `assets/hmo-logo/`.
 *
 * Not cached, for the reason `getBodyImages` is not.
 */
export async function getHmoLogos(
  hmos: readonly Hmo[],
): Promise<ReadonlyMap<string, ContentImage>> {
  const byMediaId = new Map<string, string[]>();

  for (const hmo of hmos) {
    if (!hmo.logo_id) continue;
    const hmoIds = byMediaId.get(hmo.logo_id) ?? [];
    hmoIds.push(hmo.id);
    byMediaId.set(hmo.logo_id, hmoIds);
  }

  if (byMediaId.size === 0) return new Map();

  const rows = await getMediaByIds([...byMediaId.keys()]);
  const resolved = new Map<string, ContentImage>();

  for (const [mediaId, row] of rows) {
    if (row.width === null || row.height === null) continue;
    for (const hmoId of byMediaId.get(mediaId) ?? []) {
      resolved.set(hmoId, {
        url: row.url,
        alt: row.alt,
        width: row.width,
        height: row.height,
      });
    }
  }

  return resolved;
}

/**
 * The branch whose details front the site (footer contact block, emergency
 * line). Victoria Island is the only branch seeded; see seed/README.md.
 */
export async function getPrimaryLocation(): Promise<Location | null> {
  return (await getLocations())[0] ?? null;
}

/** One published branch by slug, or null when it is unknown or unpublished. */
export async function getLocationBySlug(slug: string): Promise<Location | null> {
  const row = await getLocationRow(slug, await readOptions());
  return row ? toLocation(row) : null;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers — safe to call from anywhere, no database access               */
/* -------------------------------------------------------------------------- */

/**
 * Re-exported from `lib/phone.ts`, which holds it so that client components
 * (the error boundaries) can format a number without importing this module and
 * the database layer behind it. Every server-side caller keeps importing it
 * from here.
 */
export { toTelHref } from "@/lib/phone";

/**
 * The branch address on one line, in the order someone would read it aloud to
 * a driver. Country is omitted: it is "Nigeria" on every row, and a Lagos
 * driver does not need it.
 */
export function formatAddress(location: Location): string {
  return [
    location.address_line_1,
    location.address_line_2,
    location.city,
    location.state,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * A directions link that opens the visitor's own maps app on mobile and
 * google.com/maps on desktop, rather than trapping them in an embed.
 *
 * Coordinates win when they exist — an address string can resolve to the wrong
 * side of a Lagos street. Until they are seeded the address is all there is.
 */
export function toDirectionsHref(location: Location): string {
  const destination =
    location.latitude && location.longitude
      ? `${location.latitude},${location.longitude}`
      : formatAddress(location);

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * WhatsApp deep link with a pre-populated greeting (spec §10), or null when no
 * number is known for the branch.
 *
 * Falls back to the site-wide NEXT_PUBLIC_WHATSAPP_NUMBER, which callers pass
 * in — this helper is used from client components and must not reach into
 * `lib/env`, which would pull zod into the browser bundle.
 */
export function toWhatsAppHref(
  number: string | null | undefined,
  message: string,
): string | null {
  if (!number) return null;
  const digits = number.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Human labels for `blog_posts.category`. */
export const BLOG_CATEGORY_LABELS: Record<BlogCategory, string> = {
  seasonal_alerts: "Seasonal alerts",
  family_health: "Family health",
  women_and_children: "Women and children",
  corporate_wellness: "Corporate wellness",
};
