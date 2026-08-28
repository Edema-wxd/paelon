import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";

import { closePool, dbTx } from "@/lib/db/client";
import {
  authors,
  awards,
  blogPostRelated,
  blogPosts,
  doctorLocations,
  doctors,
  faqs,
  hmoLocations,
  hmos,
  serviceLocations,
  serviceRelated,
  services,
  testimonials,
} from "@/lib/db/schema";
import {
  authorSeedSchema,
  awardSeedSchema,
  blogPostSeedSchema,
  doctorSeedSchema,
  faqSeedSchema,
  hmoSeedSchema,
  locationSeedSchema,
  serviceSeedSchema,
  testimonialSeedSchema,
} from "@/lib/validation/seed";
import { locations } from "@/lib/db/schema";

import { collectSeedGaps, formatSeedReport } from "./seed-report";

/**
 * Seed loader (backend spec §5, Option A — seed into the DB, read from the DB).
 *
 * Two properties matter here:
 *
 *  1. **Idempotent.** Every write is an upsert keyed on `slug`, never a blind
 *     insert, so running this twice leaves row counts unchanged. Join tables
 *     are reconciled by deleting the record's existing links and re-inserting,
 *     which also removes links a seed edit dropped.
 *
 *  2. **Two-pass.** Pass one writes every entity and builds slug → UUID maps.
 *     Pass two resolves relations. A single pass cannot work: services
 *     reference locations and each other, and the referent may not exist yet.
 *
 * `TODO(seed)` values are written through as-is. Master spec §5 forbids
 * inventing content, so a placeholder in the database is more honest than a
 * fabricated sentence, and the gap report makes it visible.
 */

const SEED_DIR = join(process.cwd(), "seed");

/** Read and validate one seed file. A missing file is not an error. */
function readSeed<S extends z.ZodType>(
  file: string,
  schema: S,
): z.infer<S>[] {
  const path = join(SEED_DIR, file);
  if (!existsSync(path)) return [];

  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`${file} must contain a JSON array`);
  }

  return raw.map((record, index) => {
    const parsed = schema.safeParse(record);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`${file}[${index}] failed validation — ${detail}`);
    }
    return parsed.data;
  });
}

/** Placeholder for a NOT NULL text column with no content yet. */
function orTodo(value: string | null): string {
  return value ?? "TODO(seed)";
}

type SlugMap = Map<string, string>;

async function main(): Promise<void> {
  const db = dbTx();

  const locationSeeds = readSeed("locations.json", locationSeedSchema);
  const serviceSeeds = readSeed("services.json", serviceSeedSchema);
  const doctorSeeds = readSeed("doctors.json", doctorSeedSchema);
  const hmoSeeds = readSeed("hmos.json", hmoSeedSchema);
  const authorSeeds = readSeed("authors.json", authorSeedSchema);
  const blogSeeds = readSeed("blog-posts.json", blogPostSeedSchema);
  const testimonialSeeds = readSeed("testimonials.json", testimonialSeedSchema);
  const awardSeeds = readSeed("awards.json", awardSeedSchema);
  const faqSeeds = readSeed("faqs.json", faqSeedSchema);

  const locationIds: SlugMap = new Map();
  const serviceIds: SlugMap = new Map();
  const doctorIds: SlugMap = new Map();
  const hmoIds: SlugMap = new Map();
  const authorIds: SlugMap = new Map();
  const blogIds: SlugMap = new Map();

  // ---- Pass 1: entities -----------------------------------------------------

  for (const s of locationSeeds) {
    const [row] = await db
      .insert(locations)
      .values({
        slug: s.slug,
        name: s.name,
        published: s.published,
        order: s.order,
        addressLine1: orTodo(s.address_line_1),
        addressLine2: s.address_line_2,
        city: orTodo(s.city),
        state: orTodo(s.state),
        country: s.country,
        latitude: s.latitude === null ? null : String(s.latitude),
        longitude: s.longitude === null ? null : String(s.longitude),
        phone: orTodo(s.phone),
        whatsapp: s.whatsapp,
        emergencyLine: orTodo(s.emergency_line),
        // An empty object is a visible "hours not supplied yet" rather than a
        // guess at when a hospital branch is open.
        hours: s.hours ?? {},
        parkingInfo: s.parking_info,
        accessibilityNotes: s.accessibility_notes,
        heroImage: s.hero_image,
        galleryImages: s.gallery_images,
        bookingEmail: s.booking_email,
      })
      .onConflictDoUpdate({
        target: locations.slug,
        set: conflictSet(locations, [
          "name", "published", "order", "addressLine1", "addressLine2", "city",
          "state", "country", "latitude", "longitude", "phone", "whatsapp",
          "emergencyLine", "hours", "parkingInfo", "accessibilityNotes",
          "heroImage", "galleryImages", "bookingEmail",
        ]),
      })
      .returning({ id: locations.id });
    if (row) locationIds.set(s.slug, row.id);
  }

  for (const s of serviceSeeds) {
    const [row] = await db
      .insert(services)
      .values({
        slug: s.slug,
        name: s.name,
        published: s.published,
        order: s.order,
        family: s.family,
        shortDescription: orTodo(s.short_description),
        longDescription: orTodo(s.long_description),
        whoItsFor: s.who_its_for,
        howToAccess: s.how_to_access,
        typicalWaitTime: s.typical_wait_time,
        whatToExpect: orTodo(s.what_to_expect),
        featuredImage: s.featured_image,
        galleryImages: s.gallery_images,
      })
      .onConflictDoUpdate({
        target: services.slug,
        set: conflictSet(services, [
          "name", "published", "order", "family", "shortDescription",
          "longDescription", "whoItsFor", "howToAccess", "typicalWaitTime",
          "whatToExpect", "featuredImage", "galleryImages",
        ]),
      })
      .returning({ id: services.id });
    if (row) serviceIds.set(s.slug, row.id);
  }

  for (const s of doctorSeeds) {
    const [row] = await db
      .insert(doctors)
      .values({
        slug: s.slug,
        name: s.name,
        published: s.published,
        order: s.order,
        title: orTodo(s.title),
        qualifications: s.qualifications,
        yearsExperience: s.years_experience,
        specialties: s.specialties,
        languagesSpoken: s.languages_spoken,
        bio: orTodo(s.bio),
        headshot: s.headshot,
        inHouse: s.in_house,
        visiting: s.visiting,
      })
      .onConflictDoUpdate({
        target: doctors.slug,
        set: conflictSet(doctors, [
          "name", "published", "order", "title", "qualifications",
          "yearsExperience", "specialties", "languagesSpoken", "bio",
          "headshot", "inHouse", "visiting",
        ]),
      })
      .returning({ id: doctors.id });
    if (row) doctorIds.set(s.slug, row.id);
  }

  for (const s of hmoSeeds) {
    const [row] = await db
      .insert(hmos)
      .values({
        slug: s.slug,
        name: s.name,
        published: s.published,
        order: s.order,
        logo: s.logo,
        coverageNotes: s.coverage_notes,
        copayApplies: s.copay_applies,
        planNotes: s.plan_notes,
        aliases: s.aliases,
      })
      .onConflictDoUpdate({
        target: hmos.slug,
        set: conflictSet(hmos, [
          "name", "published", "order", "logo", "coverageNotes",
          "copayApplies", "planNotes", "aliases",
        ]),
      })
      .returning({ id: hmos.id });
    if (row) hmoIds.set(s.slug, row.id);
  }

  for (const s of authorSeeds) {
    const [row] = await db
      .insert(authors)
      .values({
        slug: s.slug,
        name: s.name,
        published: s.published,
        order: s.order,
        role: orTodo(s.role),
        bio: orTodo(s.bio),
        headshot: s.headshot,
        doctorId: s.doctor_slug ? (doctorIds.get(s.doctor_slug) ?? null) : null,
      })
      .onConflictDoUpdate({
        target: authors.slug,
        set: conflictSet(authors, [
          "name", "published", "order", "role", "bio", "headshot", "doctorId",
        ]),
      })
      .returning({ id: authors.id });
    if (row) authorIds.set(s.slug, row.id);
  }

  for (const s of blogSeeds) {
    const authorId = authorIds.get(s.author_slug);
    if (!authorId) {
      throw new Error(
        `blog-posts.json: "${s.slug}" references unknown author "${s.author_slug}"`,
      );
    }

    const [row] = await db
      .insert(blogPosts)
      .values({
        slug: s.slug,
        title: s.title,
        published: s.published,
        order: s.order,
        excerpt: orTodo(s.excerpt),
        body: orTodo(s.body),
        heroImage: s.hero_image,
        authorId,
        category: s.category,
        tags: s.tags,
        publishedAt: s.published_at ? new Date(s.published_at) : null,
      })
      .onConflictDoUpdate({
        target: blogPosts.slug,
        set: conflictSet(blogPosts, [
          "title", "published", "order", "excerpt", "body", "heroImage",
          "authorId", "category", "tags", "publishedAt",
        ]),
      })
      .returning({ id: blogPosts.id });
    if (row) blogIds.set(s.slug, row.id);
  }

  for (const s of testimonialSeeds) {
    await db
      .insert(testimonials)
      .values({
        slug: s.slug,
        patientName: s.patient_name,
        published: s.published,
        order: s.order,
        nameFormat: s.name_format,
        avatar: s.avatar,
        quote: orTodo(s.quote),
        serviceId: s.service_slug ? (serviceIds.get(s.service_slug) ?? null) : null,
        locationId: s.location_slug
          ? (locationIds.get(s.location_slug) ?? null)
          : null,
        // A testimonial with no supplied date gets today's, which is wrong; so
        // an absent date keeps the row unpublished instead, via consent_given
        // and published both being false in the seed file.
        dateGiven: s.date_given ?? "1970-01-01",
        featured: s.featured,
        consentGiven: s.consent_given,
      })
      .onConflictDoUpdate({
        target: testimonials.slug,
        set: conflictSet(testimonials, [
          "patientName", "published", "order", "nameFormat", "avatar", "quote",
          "serviceId", "locationId", "dateGiven", "featured", "consentGiven",
        ]),
      });
  }

  for (const s of awardSeeds) {
    await db
      .insert(awards)
      .values({
        slug: s.slug,
        name: s.name,
        published: s.published,
        order: s.order,
        awardingBody: orTodo(s.awarding_body),
        year: s.year,
        description: orTodo(s.description),
        logo: s.logo,
        certificateImage: s.certificate_image,
        externalLink: s.external_link,
      })
      .onConflictDoUpdate({
        target: awards.slug,
        set: conflictSet(awards, [
          "name", "published", "order", "awardingBody", "year", "description",
          "logo", "certificateImage", "externalLink",
        ]),
      });
  }

  for (const s of faqSeeds) {
    await db
      .insert(faqs)
      .values({
        slug: s.slug,
        question: s.question,
        published: s.published,
        order: s.order,
        answer: orTodo(s.answer),
        category: s.category,
      })
      .onConflictDoUpdate({
        target: faqs.slug,
        set: conflictSet(faqs, ["question", "published", "order", "answer", "category"]),
      });
  }

  // ---- Pass 2: relations ----------------------------------------------------
  //
  // Replace-then-insert rather than upsert, so a link removed from a seed file
  // is also removed from the database. Without this, seeding would only ever
  // add relations.

  for (const s of serviceSeeds) {
    const serviceId = serviceIds.get(s.slug);
    if (!serviceId) continue;

    await db.delete(serviceLocations).where(eq(serviceLocations.serviceId, serviceId));
    const locationLinks = s.location_slugs
      .map((slug) => locationIds.get(slug))
      .filter((id): id is string => id !== undefined)
      .map((locationId) => ({ serviceId, locationId }));
    if (locationLinks.length > 0) {
      await db.insert(serviceLocations).values(locationLinks);
    }

    await db.delete(serviceRelated).where(eq(serviceRelated.serviceId, serviceId));
    const relatedLinks = s.related_slugs
      .map((slug) => serviceIds.get(slug))
      .filter((id): id is string => id !== undefined && id !== serviceId)
      .map((relatedId) => ({ serviceId, relatedId }));
    if (relatedLinks.length > 0) {
      await db.insert(serviceRelated).values(relatedLinks);
    }
  }

  for (const s of doctorSeeds) {
    const doctorId = doctorIds.get(s.slug);
    if (!doctorId) continue;

    await db.delete(doctorLocations).where(eq(doctorLocations.doctorId, doctorId));
    const links = s.location_slugs
      .map((slug) => locationIds.get(slug))
      .filter((id): id is string => id !== undefined)
      .map((locationId) => ({ doctorId, locationId }));
    if (links.length > 0) await db.insert(doctorLocations).values(links);
  }

  for (const s of hmoSeeds) {
    const hmoId = hmoIds.get(s.slug);
    if (!hmoId) continue;

    await db.delete(hmoLocations).where(eq(hmoLocations.hmoId, hmoId));
    const links = s.location_slugs
      .map((slug) => locationIds.get(slug))
      .filter((id): id is string => id !== undefined)
      .map((locationId) => ({ hmoId, locationId }));
    if (links.length > 0) await db.insert(hmoLocations).values(links);
  }

  for (const s of blogSeeds) {
    const postId = blogIds.get(s.slug);
    if (!postId) continue;

    await db.delete(blogPostRelated).where(eq(blogPostRelated.postId, postId));
    const links = s.related_slugs
      .map((slug) => blogIds.get(slug))
      .filter((id): id is string => id !== undefined && id !== postId)
      .map((relatedId) => ({ postId, relatedId }));
    if (links.length > 0) await db.insert(blogPostRelated).values(links);
  }

  const counts = {
    locations: locationIds.size,
    services: serviceIds.size,
    doctors: doctorIds.size,
    hmos: hmoIds.size,
    authors: authorIds.size,
    blogPosts: blogIds.size,
    testimonials: testimonialSeeds.length,
    awards: awardSeeds.length,
    faqs: faqSeeds.length,
  };

  process.stdout.write(
    `${JSON.stringify({ level: "info", event: "db.seed.complete", counts })}\n`,
  );
  process.stdout.write(`\n${formatSeedReport(collectSeedGaps())}\n`);
}

/**
 * Build an `ON CONFLICT DO UPDATE SET` map from column names.
 *
 * Writing `{ name: sql`excluded.name`, … }` by hand for every column is where
 * seed bugs come from — one forgotten column and a field silently stops
 * updating on re-seed. Going through `getTableColumns` also means a typo in a
 * column name is a compile error rather than a no-op at runtime.
 */
function conflictSet<T extends PgTable>(
  table: T,
  columns: (keyof T["_"]["columns"] & string)[],
): Record<string, SQL> {
  const all = getTableColumns(table);
  const set: Record<string, SQL> = {};

  for (const column of columns) {
    const physical = all[column]?.name;
    if (!physical) continue;
    // `physical` is a schema-authored identifier, never user input.
    set[column] = sql.raw(`excluded."${physical}"`);
  }

  return set;
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "db.seed.failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    await closePool();
    process.exit(1);
  });
