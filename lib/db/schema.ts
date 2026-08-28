import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Hours } from "@/lib/validation/hours";

/**
 * Full Phase 1 + Phase 2 schema, defined once (master spec §5, backend spec §4).
 *
 * Phase 2 tables (users, sessions, accounts, verification_tokens, audit_log,
 * booking_status_history) are DEFINED here but not read or written by any
 * Phase 1 code path, with one deliberate exception: booking creation writes the
 * initial `NULL -> new` row into booking_status_history so the Phase 2 timeline
 * is complete without a backfill (backend spec §4).
 *
 * Conventions: snake_case plural tables, snake_case columns, uuid PKs via
 * gen_random_uuid(), and `timestamptz` everywhere — never a naive timestamp.
 */

/**
 * Partial-index predicate for soft delete. Written as raw SQL because the
 * predicate must reference the physical column, and every partial index in this
 * file needs the identical clause.
 */
function sqlDeletedAtIsNull() {
  return sql`deleted_at IS NULL`;
}

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const serviceFamilyEnum = pgEnum("service_family", [
  "family_healthcare",
  "women_and_children",
  "specialist",
  "diagnostics",
]);

export const timeWindowEnum = pgEnum("time_window", [
  "morning",
  "afternoon",
  "evening",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "new",
  "contacted",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
]);

export const bookingSourceEnum = pgEnum("booking_source", [
  "website",
  "phone",
  "walk_in",
  "referral",
]);

export const nameFormatEnum = pgEnum("name_format", [
  "full",
  "first_only",
  "initials",
]);

export const blogCategoryEnum = pgEnum("blog_category", [
  "seasonal_alerts",
  "family_health",
  "women_and_children",
  "corporate_wellness",
]);

export const faqCategoryEnum = pgEnum("faq_category", [
  "general",
  "booking",
  "services",
  "insurance",
  "emergencies",
]);

export const companySizeEnum = pgEnum("company_size", [
  "1_50",
  "51_200",
  "201_500",
  "501_1000",
  "1000_plus",
]);

export const corporateStatusEnum = pgEnum("corporate_status", [
  "new",
  "contacted",
  "proposal_sent",
  "won",
  "lost",
]);

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "editor",
  "contributor",
]);

/* -------------------------------------------------------------------------- */
/* Shared columns                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Columns every content table carries (master spec §5). Spread into each table.
 *
 * `updated_at` is maintained by a Postgres trigger (see the hand-written
 * migration) rather than by application code, so admin writes and manual SQL
 * both stay correct.
 *
 * `created_by_user_id` is nullable and unused in Phase 1. It exists now because
 * Phase 2's `contributor` role needs per-row ownership and master spec §16
 * warns migrations are one-way — adding it later would be a second migration
 * against populated tables.
 */
const contentColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  published: boolean("published").notNull().default(false),
  order: integer("order").notNull().default(0),
  createdByUserId: uuid("created_by_user_id"),
};

/**
 * NDPR consent provenance, on every table that captures consent (backend spec
 * §19). Knowing *which* privacy policy text someone agreed to is impossible to
 * reconstruct after the fact, so it is recorded at write time.
 */
const consentColumns = {
  consentNdpr: boolean("consent_ndpr").notNull(),
  consentTextVersion: text("consent_text_version").notNull(),
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/* -------------------------------------------------------------------------- */
/* Content tables                                                             */
/* -------------------------------------------------------------------------- */

export const services = pgTable(
  "services",
  {
    ...contentColumns,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    family: serviceFamilyEnum("family").notNull(),
    /** App-enforced <=200 chars (master spec §5); not a DB constraint. */
    shortDescription: text("short_description").notNull(),
    longDescription: text("long_description").notNull(),
    whoItsFor: text("who_its_for").array().notNull().default([]),
    howToAccess: text("how_to_access").array().notNull().default([]),
    typicalWaitTime: text("typical_wait_time"),
    whatToExpect: text("what_to_expect").notNull(),
    /** UploadThing key, not a URL — see lib/uploads/url.ts (Phase 2). */
    featuredImage: text("featured_image"),
    galleryImages: text("gallery_images").array().notNull().default([]),
  },
  (t) => [
    uniqueIndex("services_slug_key").on(t.slug),
    index("services_family_idx").on(t.family),
    index("services_published_idx")
      .on(t.published)
      .where(sqlDeletedAtIsNull()),
  ],
);

export const doctors = pgTable(
  "doctors",
  {
    ...contentColumns,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    qualifications: text("qualifications").array().notNull().default([]),
    /** Nullable: we do not fabricate a number we have not been given. */
    yearsExperience: integer("years_experience"),
    specialties: text("specialties").array().notNull().default([]),
    languagesSpoken: text("languages_spoken").array().notNull().default([]),
    bio: text("bio").notNull(),
    headshot: text("headshot"),
    inHouse: boolean("in_house").notNull().default(true),
    visiting: boolean("visiting").notNull().default(false),
  },
  (t) => [
    uniqueIndex("doctors_slug_key").on(t.slug),
    index("doctors_published_idx").on(t.published).where(sqlDeletedAtIsNull()),
  ],
);

export const locations = pgTable(
  "locations",
  {
    ...contentColumns,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    addressLine1: text("address_line_1").notNull(),
    addressLine2: text("address_line_2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    country: text("country").notNull().default("Nigeria"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    phone: text("phone").notNull(),
    whatsapp: text("whatsapp"),
    emergencyLine: text("emergency_line").notNull(),
    /** Shape validated on write by `hoursSchema` (lib/validation/hours.ts). */
    hours: jsonb("hours").$type<Hours>().notNull(),
    parkingInfo: text("parking_info"),
    accessibilityNotes: text("accessibility_notes"),
    heroImage: text("hero_image"),
    galleryImages: text("gallery_images").array().notNull().default([]),
    /**
     * Branch booking inbox. Lives on the row rather than only in env so that a
     * branch added through the Phase 2 CMS does not require a redeploy. The
     * BRANCH_*_EMAIL env vars remain a Phase 1 fallback keyed by slug — see
     * lib/booking/destinations/email.ts.
     */
    bookingEmail: text("booking_email"),
  },
  (t) => [
    uniqueIndex("locations_slug_key").on(t.slug),
    index("locations_published_idx").on(t.published).where(sqlDeletedAtIsNull()),
  ],
);

export const hmos = pgTable(
  "hmos",
  {
    ...contentColumns,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    coverageNotes: text("coverage_notes"),
    copayApplies: boolean("copay_applies").notNull().default(false),
    planNotes: text("plan_notes"),
    /**
     * Alternate names the typeahead should match: "AXA", "Axa Mansard Health"
     * all resolve to one record. Without this the /hmo-check typeahead misses
     * obvious user input.
     */
    aliases: text("aliases").array().notNull().default([]),
  },
  (t) => [
    uniqueIndex("hmos_slug_key").on(t.slug),
    index("hmos_published_idx").on(t.published).where(sqlDeletedAtIsNull()),
    // GIN trigram index on `name` is added in a hand-written migration —
    // drizzle-kit does not generate `gin_trgm_ops`.
  ],
);

export const testimonials = pgTable(
  "testimonials",
  {
    ...contentColumns,
    slug: text("slug").notNull(),
    patientName: text("patient_name").notNull(),
    nameFormat: nameFormatEnum("name_format").notNull().default("full"),
    avatar: text("avatar"),
    quote: text("quote").notNull(),
    serviceId: uuid("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    dateGiven: date("date_given").notNull(),
    featured: boolean("featured").notNull().default(false),
    /**
     * Consent is a compliance fact about a real patient, so it is recorded, not
     * assumed. `name_format` controls *how* a testimonial displays;
     * `consent_given` gates whether it may be shown publicly at all. Public
     * reads filter on it — see lib/db/queries/testimonials.ts.
     */
    consentGiven: boolean("consent_given").notNull().default(false),
  },
  (t) => [
    uniqueIndex("testimonials_slug_key").on(t.slug),
    index("testimonials_featured_idx").on(t.featured).where(sqlDeletedAtIsNull()),
  ],
);

export const authors = pgTable(
  "authors",
  {
    ...contentColumns,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    role: text("role").notNull(),
    bio: text("bio").notNull(),
    headshot: text("headshot"),
    doctorId: uuid("doctor_id").references(() => doctors.id, {
      onDelete: "set null",
    }),
  },
  (t) => [uniqueIndex("authors_slug_key").on(t.slug)],
);

export const blogPosts = pgTable(
  "blog_posts",
  {
    ...contentColumns,
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt").notNull(),
    /** MDX source. See the MDX note in backend spec §4 before Phase 2 rendering. */
    body: text("body").notNull(),
    heroImage: text("hero_image"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "restrict" }),
    category: blogCategoryEnum("category").notNull(),
    tags: text("tags").array().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("blog_posts_slug_key").on(t.slug),
    index("blog_posts_category_idx").on(t.category),
    index("blog_posts_published_at_idx")
      .on(t.publishedAt.desc())
      .where(sqlDeletedAtIsNull()),
  ],
);

export const awards = pgTable("awards", {
  ...contentColumns,
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  awardingBody: text("awarding_body").notNull(),
  year: integer("year").notNull(),
  description: text("description").notNull(),
  logo: text("logo"),
  certificateImage: text("certificate_image"),
  externalLink: text("external_link"),
});

export const faqs = pgTable("faqs", {
  ...contentColumns,
  slug: text("slug").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: faqCategoryEnum("category").notNull(),
});

/* -------------------------------------------------------------------------- */
/* Join tables                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Master spec §5 lists these relations as `uuid[]` columns. Postgres arrays
 * cannot carry foreign keys, so an array loses referential integrity and makes
 * "which services are at branch X" both slow and awkward. Join tables instead —
 * a deliberate deviation from the master spec, recorded in docs/decisions.md.
 */

export const serviceLocations = pgTable(
  "service_locations",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.locationId] })],
);

export const serviceRelated = pgTable(
  "service_related",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    relatedId: uuid("related_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.relatedId] })],
);

export const doctorLocations = pgTable(
  "doctor_locations",
  {
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.doctorId, t.locationId] })],
);

export const hmoLocations = pgTable(
  "hmo_locations",
  {
    hmoId: uuid("hmo_id")
      .notNull()
      .references(() => hmos.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.hmoId, t.locationId] })],
);

export const blogPostRelated = pgTable(
  "blog_post_related",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    relatedId: uuid("related_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.relatedId] })],
);

/* -------------------------------------------------------------------------- */
/* Phase 2 auth tables — defined now, written by nothing in Phase 1           */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    /** argon2id. Library not yet approved — backend spec §23 item 18. */
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("contributor"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

/** Auth.js standard shape. Unused with a Credentials-only provider; present for adapter compatibility. */
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * Audit trail (Phase 2). Not in the master spec — added because a healthcare
 * operator with three staff roles handling patient PII needs to answer "who
 * looked at or changed this booking" during an incident.
 * `booking_status_history` covers booking transitions only.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Dotted action name, e.g. "booking.status_changed". */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt.desc()),
  ],
);

/* -------------------------------------------------------------------------- */
/* Submission tables — personal data, no `published`, no `order`              */
/* -------------------------------------------------------------------------- */

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** PMH-YYYY-NNNNNN. UNIQUE; the insert retries once on conflict. */
    reference: text("reference").notNull(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    serviceFamily: serviceFamilyEnum("service_family").notNull(),
    serviceId: uuid("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    /**
     * A request, not a reservation. There is no capacity check and no
     * double-booking prevention in Phase 1 (master spec §17) — confirmation
     * copy must not imply a confirmed slot.
     */
    preferredDate: date("preferred_date").notNull(),
    preferredTimeWindow: timeWindowEnum("preferred_time_window").notNull(),
    patientName: text("patient_name"),
    /** E.164 normalised on write (+234…). */
    patientPhone: text("patient_phone"),
    patientEmail: text("patient_email"),
    patientDob: date("patient_dob"),
    existingPatient: boolean("existing_patient").notNull().default(false),
    /**
     * Free-text symptom description — health data, the most sensitive NDPR
     * category. Francis's decision: collected and stored, but excluded from
     * branch notification emails and from every log line.
     */
    reasonForVisit: text("reason_for_visit"),
    hmoId: uuid("hmo_id").references(() => hmos.id, { onDelete: "set null" }),
    hmoPlan: text("hmo_plan"),
    ...consentColumns,
    consentMarketing: boolean("consent_marketing").notNull().default(false),
    status: bookingStatusEnum("status").notNull().default("new"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    internalNotes: text("internal_notes"),
    source: bookingSourceEnum("source").notNull().default("website"),
    /**
     * Set when retention anonymisation nulls the PII columns above (which is
     * why they are nullable). The aggregate row survives for reporting; the
     * personal data does not. Retention job itself is Phase 2/3 — nothing is
     * 12 months old during a 15-day build — but the column must exist now.
     */
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_reference_key").on(t.reference),
    index("bookings_status_idx").on(t.status),
    index("bookings_location_id_idx").on(t.locationId),
    index("bookings_preferred_date_idx").on(t.preferredDate),
    index("bookings_created_at_idx").on(t.createdAt.desc()),
    index("bookings_admin_filter_idx").on(
      t.status,
      t.locationId,
      t.preferredDate,
    ),
    // CHECK (consent_ndpr = true) is added in a hand-written migration —
    // drizzle-kit does not generate it from the column definition.
  ],
);

/**
 * Booking status timeline. Phase 2 reads it; Phase 1 writes only the initial
 * `NULL -> new` row, inside the same transaction as the booking insert, so the
 * timeline is complete when Phase 2 lights up and needs no backfill.
 */
export const bookingStatusHistory = pgTable(
  "booking_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    /** NULL for the initial creation row. */
    fromStatus: bookingStatusEnum("from_status"),
    toStatus: bookingStatusEnum("to_status").notNull(),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note"),
  },
  (t) => [index("booking_status_history_booking_id_idx").on(t.bookingId)],
);

export const contactSubmissions = pgTable(
  "contact_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    subject: text("subject").notNull(),
    message: text("message"),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    ...consentColumns,
    handled: boolean("handled").notNull().default(false),
    handledBy: uuid("handled_by").references(() => users.id, {
      onDelete: "set null",
    }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("contact_submissions_handled_idx").on(t.handled),
    index("contact_submissions_created_at_idx").on(t.createdAt.desc()),
  ],
);

export const corporateEnquiries = pgTable(
  "corporate_enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    companySize: companySizeEnum("company_size").notNull(),
    sector: text("sector").notNull(),
    currentProvider: text("current_provider"),
    requirements: text("requirements").notNull(),
    ...consentColumns,
    status: corporateStatusEnum("status").notNull().default("new"),
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("corporate_enquiries_status_idx").on(t.status),
    index("corporate_enquiries_created_at_idx").on(t.createdAt.desc()),
  ],
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lowercased so the UNIQUE constraint actually dedupes. */
    email: text("email").notNull(),
    name: text("name"),
    ...consentColumns,
    doubleOptIn: boolean("double_opt_in").notNull().default(true),
    /**
     * Both tokens are stored as SHA-256 hashes, never in the clear: a database
     * leak must not hand out working confirm/unsubscribe links. Comparison is
     * by hash lookup, so it is constant-time with respect to the raw token.
     */
    confirmTokenHash: text("confirm_token_hash"),
    confirmExpiresAt: timestamp("confirm_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    unsubscribeTokenHash: text("unsubscribe_token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("newsletter_subscribers_email_key").on(t.email),
    uniqueIndex("newsletter_subscribers_confirm_token_key").on(
      t.confirmTokenHash,
    ),
    uniqueIndex("newsletter_subscribers_unsubscribe_token_key").on(
      t.unsubscribeTokenHash,
    ),
  ],
);

/**
 * Fixed-window rate limiting (backend spec §12). Postgres-backed rather than
 * Vercel KV or Redis: no Vercel-lock, no unapproved dependency, and these are
 * low-volume form endpoints where one extra round trip is affordable.
 *
 * `key` contains a salted SHA-256 of the IP, never the raw address — an IP is
 * personal data under NDPR. Rows are pruned after 24h.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    key: text("key").notNull(),
    hitAt: timestamp("hit_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.hitAt] }),
    index("rate_limit_hits_hit_at_idx").on(t.hitAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const servicesRelations = relations(services, ({ many }) => ({
  locations: many(serviceLocations),
  related: many(serviceRelated, { relationName: "service_related_from" }),
  testimonials: many(testimonials),
  bookings: many(bookings),
}));

export const doctorsRelations = relations(doctors, ({ many }) => ({
  locations: many(doctorLocations),
}));

export const locationsRelations = relations(locations, ({ many }) => ({
  services: many(serviceLocations),
  doctors: many(doctorLocations),
  hmos: many(hmoLocations),
  bookings: many(bookings),
}));

export const hmosRelations = relations(hmos, ({ many }) => ({
  locations: many(hmoLocations),
}));

export const testimonialsRelations = relations(testimonials, ({ one }) => ({
  service: one(services, {
    fields: [testimonials.serviceId],
    references: [services.id],
  }),
  location: one(locations, {
    fields: [testimonials.locationId],
    references: [locations.id],
  }),
}));

export const authorsRelations = relations(authors, ({ one, many }) => ({
  doctor: one(doctors, {
    fields: [authors.doctorId],
    references: [doctors.id],
  }),
  posts: many(blogPosts),
}));

export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  author: one(authors, {
    fields: [blogPosts.authorId],
    references: [authors.id],
  }),
  related: many(blogPostRelated, { relationName: "blog_post_related_from" }),
}));

export const serviceLocationsRelations = relations(
  serviceLocations,
  ({ one }) => ({
    service: one(services, {
      fields: [serviceLocations.serviceId],
      references: [services.id],
    }),
    location: one(locations, {
      fields: [serviceLocations.locationId],
      references: [locations.id],
    }),
  }),
);

export const serviceRelatedRelations = relations(serviceRelated, ({ one }) => ({
  service: one(services, {
    fields: [serviceRelated.serviceId],
    references: [services.id],
    relationName: "service_related_from",
  }),
  related: one(services, {
    fields: [serviceRelated.relatedId],
    references: [services.id],
    relationName: "service_related_to",
  }),
}));

export const doctorLocationsRelations = relations(
  doctorLocations,
  ({ one }) => ({
    doctor: one(doctors, {
      fields: [doctorLocations.doctorId],
      references: [doctors.id],
    }),
    location: one(locations, {
      fields: [doctorLocations.locationId],
      references: [locations.id],
    }),
  }),
);

export const hmoLocationsRelations = relations(hmoLocations, ({ one }) => ({
  hmo: one(hmos, { fields: [hmoLocations.hmoId], references: [hmos.id] }),
  location: one(locations, {
    fields: [hmoLocations.locationId],
    references: [locations.id],
  }),
}));

export const blogPostRelatedRelations = relations(
  blogPostRelated,
  ({ one }) => ({
    post: one(blogPosts, {
      fields: [blogPostRelated.postId],
      references: [blogPosts.id],
      relationName: "blog_post_related_from",
    }),
    related: one(blogPosts, {
      fields: [blogPostRelated.relatedId],
      references: [blogPosts.id],
      relationName: "blog_post_related_to",
    }),
  }),
);

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  location: one(locations, {
    fields: [bookings.locationId],
    references: [locations.id],
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
  hmo: one(hmos, { fields: [bookings.hmoId], references: [hmos.id] }),
  statusHistory: many(bookingStatusHistory),
}));

export const bookingStatusHistoryRelations = relations(
  bookingStatusHistory,
  ({ one }) => ({
    booking: one(bookings, {
      fields: [bookingStatusHistory.bookingId],
      references: [bookings.id],
    }),
  }),
);

export const contactSubmissionsRelations = relations(
  contactSubmissions,
  ({ one }) => ({
    location: one(locations, {
      fields: [contactSubmissions.locationId],
      references: [locations.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/* Inferred row types                                                         */
/* -------------------------------------------------------------------------- */

export type Service = typeof services.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Hmo = typeof hmos.$inferSelect;
export type Testimonial = typeof testimonials.$inferSelect;
export type Author = typeof authors.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type Award = typeof awards.$inferSelect;
export type Faq = typeof faqs.$inferSelect;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type CorporateEnquiry = typeof corporateEnquiries.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;

export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export type ServiceFamily = (typeof serviceFamilyEnum.enumValues)[number];
export type TimeWindow = (typeof timeWindowEnum.enumValues)[number];
