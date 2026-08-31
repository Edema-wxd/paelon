import type { Hours } from "@/lib/validation/hours";
import blogPostsJson from "@/seed/blog-posts.json";
import hmosJson from "@/seed/hmos.json";
import locationsJson from "@/seed/locations.json";
import servicesJson from "@/seed/services.json";
import testimonialsJson from "@/seed/testimonials.json";

/**
 * Phase 1 content layer.
 *
 * Reads static seed JSON. Shapes mirror the Drizzle schema in spec §5, so that
 * Phase 2 can repoint these functions at Postgres without any component
 * changing. Keep the return types stable — they are the contract.
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
  short_description: string | null;
  featured_image: string | null;
  order: number;
  published: boolean;
}

export interface Hmo {
  id: string;
  slug: string;
  name: string;
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
   * Fields below exist on the `locations` table (spec §5) but are absent from
   * every row in seed/locations.json today. They are optional here rather than
   * nullable so the type says "may not have been supplied at all", and every
   * template is forced to handle that case instead of rendering `null`.
   *
   * TODO(seed): hours, coordinates, parking, accessibility and photos are all
   * outstanding for Victoria Island, and three further branches implied by
   * .env.example are not seeded at all. See seed/README.md.
   */

  /** Decimal degrees, as strings — matches the numeric column in the schema. */
  latitude?: string | null;
  longitude?: string | null;
  /** `{}` or absent means the schedule has not been confirmed. */
  hours?: Hours | Record<string, never>;
  parking_info?: string | null;
  accessibility_notes?: string | null;
  hero_image?: string | null;
  gallery_images?: string[];
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  hero_image: string | null;
  category: string;
  published_at: string;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/** Published services, in display order. */
export function getServices(): Service[] {
  return (servicesJson as Service[]).filter((s) => s.published).sort(byOrder);
}

/** Published HMOs, in display order. */
export function getHmos(): Hmo[] {
  return (hmosJson as Hmo[]).filter((h) => h.published).sort(byOrder);
}

/** Published branch locations, in display order. */
export function getLocations(): Location[] {
  return (locationsJson as Location[]).filter((l) => l.published).sort(byOrder);
}

/**
 * Featured testimonials, capped at `limit`.
 *
 * Spec §6 asks for two on the homepage. Only one is seeded — see
 * seed/README.md. The component renders whatever this returns rather than
 * padding with invented content.
 */
export function getFeaturedTestimonials(limit = 2): Testimonial[] {
  return (testimonialsJson as Testimonial[])
    .filter((t) => t.published && t.featured)
    .sort(byOrder)
    .slice(0, limit);
}

/** Most recently published blog post, or null when none is seeded yet. */
export function getLatestBlogPost(): BlogPost | null {
  const posts = (blogPostsJson as BlogPost[])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
    );
  return posts[0] ?? null;
}

/**
 * The branch whose details front the site (footer contact block, emergency
 * line). Victoria Island is the only branch seeded; see seed/README.md.
 */
export function getPrimaryLocation(): Location | null {
  return getLocations()[0] ?? null;
}

/** Strip spaces and punctuation so a number can be used in a `tel:` href. */
export function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** One published branch by slug, or null when it is unknown or unpublished. */
export function getLocationBySlug(slug: string): Location | null {
  return getLocations().find((l) => l.slug === slug) ?? null;
}

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
 * in — this module is imported by client components and must not reach into
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
