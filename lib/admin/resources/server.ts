import type { Resource } from "@/lib/auth/policy";
import type { ContentTable, RelationColumns } from "@/lib/db/queries/content-crud";
import { CACHE_TAGS } from "@/lib/db/queries/shared";
import {
  awards,
  doctorLocations,
  doctors,
  faqs,
  hmoLocations,
  hmos,
  locations,
  serviceLocations,
  serviceRelated,
  services,
  testimonials,
} from "@/lib/db/schema";
import type { PgColumn } from "drizzle-orm/pg-core";

import { AWARD_CERTIFICATE, AWARD_LOGO } from "./awards";
import { DOCTOR_LOCATIONS_FIELD } from "./doctors";
import { HMO_LOCATIONS_FIELD } from "./hmos";
import { HOURS_CONFIRMED_FIELD } from "./locations";
import {
  TESTIMONIAL_LOCATION_FIELD,
  TESTIMONIAL_SERVICE_FIELD,
} from "./testimonials";
import { SERVICE_LOCATIONS_FIELD, SERVICE_RELATED_FIELD } from "./services";
import { toHoursValue, type AdminHours } from "./fields";
import type { ResourceName } from "./index";
import type { ImageFieldNames } from "./fields";

/**
 * The server half of the resource registry: which table a resource writes to,
 * which permission guards it, which cache tag its writes revalidate, and which
 * join tables its form owns.
 *
 * Split from `index.ts` so the client bundle never sees a Drizzle table: this
 * module imports `lib/db/schema.ts`, and a client component that imported it
 * would pull the Neon driver into the browser bundle. The `server-only`
 * package would make that a build error rather than a review comment, but it
 * is not installed — adding a dependency needs Francis. Until then the rule is
 * the split itself: client code imports `./index`, server code imports this.
 *
 * ## The cache tags are the point
 *
 * Every write goes through `adminAction` with the tag from
 * `lib/db/queries/shared.ts`, so saving an FAQ updates the homepage and every
 * service page inside a request — no redeploy, no waiting out the hour-long
 * fallback window in `CONTENT_REVALIDATE_SECONDS`. A resource added here
 * without its tag looks like it works and silently serves stale content for an
 * hour, so the type makes the tag mandatory.
 *
 * Tags cross types on purpose. A branch's name appears on service pages, doctor
 * profiles and HMO results, so a location write revalidates all four — the
 * per-slug reads all carry their collection tag too, so the collection tag is
 * enough to reach them.
 */

/**
 * A join table the form edits, and where its picker options come from.
 *
 * The form field is a list of ids like any other field; everything that makes
 * it a join row is here, so `resource-actions.ts` syncs relations without
 * knowing which resource it is working on.
 */
export interface ResourceRelation {
  /** The form field holding the selected ids. */
  field: string;
  /** Including `otherTable`, which is the table the picker lists. */
  columns: RelationColumns;
  /** The column the picker labels its options with. */
  optionsLabel: PgColumn;
}

/**
 * A single foreign key the form edits, and where its `<select>` options come
 * from. The column is written like any other; only the options need a query.
 */
export interface ResourceReference {
  /** The form field holding the chosen id. */
  field: string;
  /** The table the picker lists. */
  table: ContentTable;
  /** The column the picker labels its options with. */
  optionsLabel: PgColumn;
}

/**
 * A column whose *change* is part of the audit record, not just the fact that
 * a row was updated.
 *
 * `mode` is the difference between a fact and a copy of patient data:
 *
 *  - `value` writes the before and after literally. Only for flags and enums —
 *    `consent_given` is the case this exists for, and a boolean is not PII.
 *  - `digest` writes a SHA-256 of each side instead. `testimonials.quote` is a
 *    real patient's words, and `lib/admin/audit.ts` is explicit that the audit
 *    log must not become a second store of personal data with its own NDPR
 *    retention problem. The digest still proves *that* the wording changed and
 *    lets any candidate text be checked against what was recorded, which is
 *    what an audit of "did someone edit a patient's quote" actually needs.
 */
export interface AuditDiffColumn {
  column: string;
  mode: "value" | "digest";
}

export interface ResourceServerConfig {
  table: ContentTable;
  /** The `can()` resource. Matches the table name in every case so far. */
  permission: Resource;
  /**
   * Tags revalidated after any write. `CACHE_TAGS.*` — never a string literal,
   * which is the whole reason that object exists.
   */
  tags: readonly string[];
  /** Image fields, so the action knows which alt text to write to `media`. */
  images: readonly ImageFieldNames[];
  /** Join tables this resource's form owns. Synced after the row is written. */
  relations?: readonly ResourceRelation[];
  /** Foreign-key pickers this resource's form renders. */
  references?: readonly ResourceReference[];
  /** Columns whose before/after values go into the audit row. */
  auditDiff?: readonly AuditDiffColumn[];
  /**
   * Last shaping step between a validated submission and the columns written.
   *
   * The escape hatch for a field whose stored form is not its submitted form —
   * `locations.hours`, where seven days of controls plus a "confirmed" tick
   * become one jsonb value or `{}`. Relation fields are stripped before this
   * runs, so it only ever sees real columns.
   */
  toRow?: (values: Record<string, unknown>) => Record<string, unknown>;
}

export const RESOURCE_SERVER: Record<ResourceName, ResourceServerConfig> = {
  services: {
    table: services as unknown as ContentTable,
    permission: "services",
    tags: [CACHE_TAGS.services, CACHE_TAGS.locations],
    images: [],
    relations: [
      {
        field: SERVICE_LOCATIONS_FIELD,
        columns: {
          table: serviceLocations,
          ownColumn: serviceLocations.serviceId,
          otherColumn: serviceLocations.locationId,
          ownKey: "serviceId",
          otherKey: "locationId",
          otherTable: locations as unknown as ContentTable,
        },
        optionsLabel: locations.name,
      },
      {
        field: SERVICE_RELATED_FIELD,
        columns: {
          table: serviceRelated,
          ownColumn: serviceRelated.serviceId,
          otherColumn: serviceRelated.relatedId,
          ownKey: "serviceId",
          otherKey: "relatedId",
          otherTable: services as unknown as ContentTable,
        },
        optionsLabel: services.name,
      },
    ],
  },

  doctors: {
    table: doctors as unknown as ContentTable,
    permission: "doctors",
    tags: [CACHE_TAGS.doctors, CACHE_TAGS.locations],
    images: [],
    relations: [
      {
        field: DOCTOR_LOCATIONS_FIELD,
        columns: {
          table: doctorLocations,
          ownColumn: doctorLocations.doctorId,
          otherColumn: doctorLocations.locationId,
          ownKey: "doctorId",
          otherKey: "locationId",
          otherTable: locations as unknown as ContentTable,
        },
        optionsLabel: locations.name,
      },
    ],
  },

  locations: {
    table: locations as unknown as ContentTable,
    permission: "locations",
    // A branch appears on service pages, doctor profiles and HMO results, so a
    // rename or an unpublish has to reach all of them, not just /locations.
    tags: [CACHE_TAGS.locations, CACHE_TAGS.services, CACHE_TAGS.doctors, CACHE_TAGS.hmos],
    images: [],
    toRow: (values) => {
      const { [HOURS_CONFIRMED_FIELD]: confirmed, hours, ...rest } = values;
      return {
        ...rest,
        hours: toHoursValue(hours as AdminHours, confirmed === true),
      };
    },
  },

  hmos: {
    table: hmos as unknown as ContentTable,
    permission: "hmos",
    tags: [CACHE_TAGS.hmos, CACHE_TAGS.locations],
    images: [],
    relations: [
      {
        field: HMO_LOCATIONS_FIELD,
        columns: {
          table: hmoLocations,
          ownColumn: hmoLocations.hmoId,
          otherColumn: hmoLocations.locationId,
          ownKey: "hmoId",
          otherKey: "locationId",
          otherTable: locations as unknown as ContentTable,
        },
        optionsLabel: locations.name,
      },
    ],
  },

  testimonials: {
    table: testimonials as unknown as ContentTable,
    permission: "testimonials",
    // A quote appears on the homepage and on the service page it is attached
    // to, so withdrawing consent has to reach both inside the request.
    tags: [CACHE_TAGS.testimonials, CACHE_TAGS.services],
    images: [],
    references: [
      {
        field: TESTIMONIAL_SERVICE_FIELD,
        table: services as unknown as ContentTable,
        optionsLabel: services.name,
      },
      {
        field: TESTIMONIAL_LOCATION_FIELD,
        table: locations as unknown as ContentTable,
        optionsLabel: locations.name,
      },
    ],
    // The two facts that decide whether a real person's words are on a public
    // website, and in what form. Every change to either is evidence.
    auditDiff: [
      { column: "consentGiven", mode: "value" },
      { column: "quote", mode: "digest" },
    ],
  },

  faqs: {
    table: faqs as unknown as ContentTable,
    permission: "faqs",
    tags: [CACHE_TAGS.faqs],
    images: [],
  },

  awards: {
    table: awards as unknown as ContentTable,
    permission: "awards",
    tags: [CACHE_TAGS.awards],
    images: [AWARD_LOGO, AWARD_CERTIFICATE],
  },
};
