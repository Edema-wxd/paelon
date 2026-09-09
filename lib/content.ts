import {
  getLatestPost,
  getPostBySlug as getPostRow,
  getPublishedPosts,
  getRelatedPosts as getRelatedPostRows,
  type BlogPostWithAuthor,
} from "@/lib/db/queries/blog";
import { getPublishedHmos } from "@/lib/db/queries/hmos";
import {
  getLocationBySlug as getLocationRow,
  getPublishedLocations,
} from "@/lib/db/queries/locations";
import { getFaqsByCategory as getFaqRows } from "@/lib/db/queries/faqs";
import {
  getPublishedServices,
  getRelatedServices as getRelatedServiceRows,
  getServiceBySlug as getServiceRow,
} from "@/lib/db/queries/services";
import { getFeaturedTestimonials as getFeaturedTestimonialRows } from "@/lib/db/queries/testimonials";
import type {
  Faq as FaqRow,
  Hmo as HmoRow,
  Location as LocationRow,
  Service as ServiceRow,
  Testimonial as TestimonialRow,
} from "@/lib/db/schema";
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
 */

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
  featured_image: string | null;
  order: number;
  published: boolean;
  /** Prose for the detail page. Null until the seed supplies it. */
  what_to_expect: string | null;
  /** Bullet list. Empty until the seed supplies one. */
  who_its_for: string[];
  /** Bullet list. Empty until the seed supplies one. */
  how_to_access: string[];
  typical_wait_time: string | null;
  gallery_images: string[];
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
  logo: string | null;
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
  avatar: string | null;
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
  hero_image?: string | null;
  gallery_images?: string[];
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
  hero_image: string | null;
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
    featured_image: row.featuredImage,
    order: row.order,
    published: row.published,
    what_to_expect: realOrNull(row.whatToExpect),
    who_its_for: realEntries(row.whoItsFor),
    how_to_access: realEntries(row.howToAccess),
    typical_wait_time: realOrNull(row.typicalWaitTime),
    gallery_images: realEntries(row.galleryImages),
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
    logo: row.logo,
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
    avatar: row.avatar,
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
    hero_image: row.heroImage,
    gallery_images: row.galleryImages,
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
    hero_image: row.heroImage,
    category: row.category,
    tags: row.tags,
    published_at: toIsoString(row.publishedAt ?? row.createdAt),
    author_name: row.authorName,
    author_slug: row.authorSlug,
  };
}

/* -------------------------------------------------------------------------- */
/* Getters                                                                    */
/* -------------------------------------------------------------------------- */

/** Published services, in display order. */
export async function getServices(): Promise<Service[]> {
  return (await getPublishedServices()).map(toService);
}

/** One published service by slug, or null when the slug is unknown. */
export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const row = await getServiceRow(slug);
  return row ? toService(row) : null;
}

/** Published services explicitly related to the given one, in display order. */
export async function getRelatedServices(
  serviceId: string,
): Promise<Service[]> {
  return (await getRelatedServiceRows(serviceId)).map(toService);
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
  return (await getFaqRows(category)).map(toFaq);
}

/** Published HMOs, in display order. */
export async function getHmos(): Promise<Hmo[]> {
  return (await getPublishedHmos()).map(toHmo);
}

/** Published branch locations, in display order. */
export async function getLocations(): Promise<Location[]> {
  return (await getPublishedLocations()).map(toLocation);
}

/**
 * Featured testimonials, capped at `limit`.
 *
 * Spec §6 asks for two on the homepage. The query layer additionally requires
 * recorded consent, so a testimonial whose consent has not been confirmed does
 * not appear here — see seed/README.md. The component renders whatever this
 * returns rather than padding with invented content.
 */
export async function getFeaturedTestimonials(
  limit = 2,
): Promise<Testimonial[]> {
  return (await getFeaturedTestimonialRows(limit)).map(toTestimonial);
}

/** Published posts, newest first. `limit` is optional — omit it for the index. */
export async function getBlogPosts(limit?: number): Promise<BlogPost[]> {
  return (await getPublishedPosts(limit)).map(toBlogPost);
}

/** Most recently published blog post, or null when none is published yet. */
export async function getLatestBlogPost(): Promise<BlogPost | null> {
  const post = await getLatestPost();
  return post ? toBlogPost(post) : null;
}

/** One published post by slug, or null when it is unknown or unpublished. */
export async function getBlogPostBySlug(
  slug: string,
): Promise<BlogPost | null> {
  const post = await getPostRow(slug);
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
  const row = await getPostRow(post.slug);
  if (!row) return [];
  return (await getRelatedPostRows(row, limit)).map(toBlogPost);
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
  const row = await getLocationRow(slug);
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
