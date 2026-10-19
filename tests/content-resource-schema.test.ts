import { describe, expect, it } from "vitest";

import { resourceInput, hoursInputName } from "@/lib/admin/resource-input";
import {
  DOCTOR_HEADSHOT,
  doctorResource,
  doctorSchema,
} from "@/lib/admin/resources/doctors";
import { HMO_LOGO, hmoResource, hmoSchema } from "@/lib/admin/resources/hmos";
import {
  HOURS_CONFIRMED_FIELD,
  LOCATION_HERO,
  locationResource,
  locationSchema,
} from "@/lib/admin/resources/locations";
import { toHoursValue } from "@/lib/admin/resources/fields";
import {
  SERVICE_IMAGE,
  SERVICE_LOCATIONS_FIELD,
  SERVICE_RELATED_FIELD,
  serviceResource,
  serviceSchema,
} from "@/lib/admin/resources/services";
import {
  TESTIMONIAL_AVATAR,
  TESTIMONIAL_LOCATION_FIELD,
  TESTIMONIAL_SERVICE_FIELD,
  testimonialResource,
  testimonialSchema,
} from "@/lib/admin/resources/testimonials";
import { DAYS } from "@/lib/validation/hours";

/**
 * Accept and reject cases for the four content schemas (CLAUDE.md testing
 * floor: every form submission schema, both directions), plus the `FormData`
 * reader they depend on.
 *
 * These are parsed against the shape a form actually produces — strings
 * throughout, checkboxes as `"on"` or absent, lists as repeated entries — and
 * the same schemas run on the client, so a case here covers both sides.
 *
 * Nothing here describes a service Paelon offers, a doctor who works there or
 * an insurer it accepts. The fixtures are deliberately nonsense-free filler:
 * a test that invents a plausible clinical claim is one copy-paste away from
 * being seeded (CLAUDE.md).
 */

const UUID_A = "3f7c1f4e-5a8b-4c2d-9e10-0b6a2d3c4e5f";
const UUID_B = "8c2d9e10-0b6a-4d3c-9e10-5a8b4c2d3f7c";

/** Read a field whose name comes from a config constant. */
function field(parsed: unknown, name: string): unknown {
  return (parsed as Record<string, unknown>)[name];
}

/* -------------------------------------------------------------------------- */
/* services                                                                   */
/* -------------------------------------------------------------------------- */

const validService = {
  name: "Placeholder name",
  slug: "placeholder-name",
  family: "family_healthcare",
  shortDescription: "Placeholder short description.",
  longDescription: "Placeholder long description.",
  whatToExpect: "Placeholder.",
  whoItsFor: ["One", "Two"],
  howToAccess: ["One"],
  typicalWaitTime: "",
  [SERVICE_LOCATIONS_FIELD]: [UUID_A],
  [SERVICE_RELATED_FIELD]: [],
  order: "2",
  published: "on",
  // Empty id is "no image", which is what the control submits when
  // nothing is chosen.
  [SERVICE_IMAGE.id]: "",
  [SERVICE_IMAGE.alt]: "",
};

describe("serviceSchema", () => {
  it("accepts a complete submission", () => {
    const parsed = serviceSchema.parse(validService);
    expect(parsed.family).toBe("family_healthcare");
    expect(parsed.order).toBe(2);
    expect(parsed.published).toBe(true);
    expect(field(parsed, SERVICE_LOCATIONS_FIELD)).toEqual([UUID_A]);
  });

  it("stores an empty wait time as null rather than an empty string", () => {
    // A blank here means "nobody has given us a figure", which is a different
    // fact from a figure of nothing (CLAUDE.md: never invent a wait time).
    expect(serviceSchema.parse(validService).typicalWaitTime).toBeNull();
  });

  it("accepts a submission with no branches and no related services", () => {
    const parsed = serviceSchema.parse({
      ...validService,
      [SERVICE_LOCATIONS_FIELD]: [],
      [SERVICE_RELATED_FIELD]: [],
    });
    expect(field(parsed, SERVICE_LOCATIONS_FIELD)).toEqual([]);
  });

  it("drops blank and duplicate list entries", () => {
    const parsed = serviceSchema.parse({
      ...validService,
      whoItsFor: ["One", "", "One", "Two"],
    });
    expect(parsed.whoItsFor).toEqual(["One", "Two"]);
  });

  it("rejects a short description over 200 characters", () => {
    const result = serviceSchema.safeParse({
      ...validService,
      shortDescription: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a family that is not in the enum", () => {
    const result = serviceSchema.safeParse({ ...validService, family: "cardiology" });
    expect(result.success).toBe(false);
  });

  it("rejects a branch id that is not a uuid", () => {
    const result = serviceSchema.safeParse({
      ...validService,
      [SERVICE_LOCATIONS_FIELD]: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("reports the field name, so the form can highlight it", () => {
    const result = serviceSchema.safeParse({ ...validService, name: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["name"]);
  });
});

/* -------------------------------------------------------------------------- */
/* doctors                                                                    */
/* -------------------------------------------------------------------------- */

const validDoctor = {
  name: "Placeholder name",
  slug: "placeholder-name",
  title: "Placeholder title",
  qualifications: [],
  specialties: [],
  languagesSpoken: ["English"],
  yearsExperience: "",
  bio: "Placeholder biography.",
  inHouse: "on",
  locationIds: [UUID_A, UUID_B],
  order: "0",
  // Empty id is "no image", which is what the control submits when
  // nothing is chosen.
  [DOCTOR_HEADSHOT.id]: "",
  [DOCTOR_HEADSHOT.alt]: "",
};

describe("doctorSchema", () => {
  it("accepts a complete submission", () => {
    const parsed = doctorSchema.parse(validDoctor);
    expect(parsed.inHouse).toBe(true);
    expect(parsed.visiting).toBe(false);
    expect(parsed.published).toBe(false);
    expect(field(parsed, "locationIds")).toEqual([UUID_A, UUID_B]);
  });

  it("keeps an unsupplied years-of-experience as null, never zero", () => {
    // Zero years is a claim; "we were not told" is not.
    expect(doctorSchema.parse(validDoctor).yearsExperience).toBeNull();
  });

  it("accepts a supplied years-of-experience", () => {
    expect(doctorSchema.parse({ ...validDoctor, yearsExperience: "12" }).yearsExperience).toBe(12);
  });

  it("rejects a non-numeric years-of-experience", () => {
    expect(doctorSchema.safeParse({ ...validDoctor, yearsExperience: "many" }).success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(doctorSchema.safeParse({ ...validDoctor, title: "  " }).success).toBe(false);
  });

  it("collapses a duplicate branch selection", () => {
    const parsed = doctorSchema.parse({ ...validDoctor, locationIds: [UUID_A, UUID_A] });
    expect(field(parsed, "locationIds")).toEqual([UUID_A]);
  });
});

/* -------------------------------------------------------------------------- */
/* locations                                                                  */
/* -------------------------------------------------------------------------- */

const blankDay = { open: "", close: "" };
const blankHours = Object.fromEntries(DAYS.map((day) => [day, { ...blankDay }]));
const openHours = Object.fromEntries(
  DAYS.map((day) => [day, { open: "08:00", close: "18:00" }]),
);

const validLocation = {
  name: "Placeholder branch",
  slug: "placeholder-branch",
  addressLine1: "1 Placeholder Road",
  addressLine2: "",
  city: "Lagos",
  state: "Lagos",
  country: "Nigeria",
  latitude: "",
  longitude: "",
  phone: "+2341234567",
  whatsapp: "",
  emergencyLine: "+2341234568",
  hours: blankHours,
  parkingInfo: "",
  accessibilityNotes: "",
  bookingEmail: "",
  order: "1",
  // Empty id is "no image", which is what the control submits when
  // nothing is chosen.
  [LOCATION_HERO.id]: "",
  [LOCATION_HERO.alt]: "",
};

describe("locationSchema", () => {
  it("accepts a branch whose hours have not been confirmed", () => {
    // The honest state for a branch nobody has sent a schedule for, and the
    // one `toHoursValue` stores as `{}`.
    const parsed = locationSchema.parse(validLocation);
    expect(field(parsed, HOURS_CONFIRMED_FIELD)).toBe(false);
    expect(toHoursValue(parsed.hours, false)).toEqual({});
  });

  it("accepts a confirmed seven-day schedule", () => {
    const parsed = locationSchema.parse({
      ...validLocation,
      hours: openHours,
      [HOURS_CONFIRMED_FIELD]: "on",
    });
    const stored = toHoursValue(parsed.hours, true);
    expect(Object.keys(stored)).toEqual([...DAYS]);
    expect(stored).toMatchObject({ mon: { open: "08:00", close: "18:00" } });
  });

  it("stores a closed day as closed, with no times", () => {
    const parsed = locationSchema.parse({
      ...validLocation,
      hours: { ...openHours, sun: { closed: "on", open: "", close: "" } },
      [HOURS_CONFIRMED_FIELD]: "on",
    });
    expect(toHoursValue(parsed.hours, true).sun).toEqual({ closed: true });
  });

  it("rejects a confirmed schedule with a day left blank", () => {
    // A partial schedule publishes an openingHoursSpecification that reads as
    // "closed the rest of the week" — worse than publishing none.
    const result = locationSchema.safeParse({
      ...validLocation,
      hours: { ...openHours, wed: { open: "", close: "" } },
      [HOURS_CONFIRMED_FIELD]: "on",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "hours")).toBe(true);
  });

  it("rejects a closing time before its opening time", () => {
    const result = locationSchema.safeParse({
      ...validLocation,
      hours: { ...openHours, mon: { open: "18:00", close: "08:00" } },
      [HOURS_CONFIRMED_FIELD]: "on",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a time that is not HH:mm", () => {
    const result = locationSchema.safeParse({
      ...validLocation,
      hours: { ...blankHours, mon: { open: "8am", close: "6pm" } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a 24-hour branch", () => {
    const allDay = Object.fromEntries(
      DAYS.map((day) => [day, { open: "00:00", close: "23:59" }]),
    );
    const parsed = locationSchema.parse({
      ...validLocation,
      hours: allDay,
      [HOURS_CONFIRMED_FIELD]: "on",
    });
    expect(toHoursValue(parsed.hours, true).mon).toEqual({ open: "00:00", close: "23:59" });
  });

  it("accepts a coordinate pair", () => {
    const parsed = locationSchema.parse({
      ...validLocation,
      latitude: "6.4281",
      longitude: "3.4219",
    });
    expect(parsed.latitude).toBe("6.4281");
    expect(parsed.longitude).toBe("3.4219");
  });

  it("rejects half a coordinate pair", () => {
    const result = locationSchema.safeParse({ ...validLocation, latitude: "6.4281" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["longitude"]);
  });

  it("rejects an out-of-range latitude", () => {
    expect(
      locationSchema.safeParse({ ...validLocation, latitude: "91", longitude: "3.4" }).success,
    ).toBe(false);
  });

  it("requires the fields the branch's structured data emits unconditionally", () => {
    for (const key of ["addressLine1", "city", "state", "country", "phone", "emergencyLine"]) {
      const result = locationSchema.safeParse({ ...validLocation, [key]: "" });
      expect(result.success, key).toBe(false);
    }
  });

  it("rejects a malformed booking inbox", () => {
    expect(
      locationSchema.safeParse({ ...validLocation, bookingEmail: "not-an-email" }).success,
    ).toBe(false);
  });

  it("treats an empty booking inbox as the env fallback, not an error", () => {
    expect(locationSchema.parse(validLocation).bookingEmail).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* hmos                                                                       */
/* -------------------------------------------------------------------------- */

const validHmo = {
  name: "Placeholder insurer",
  slug: "placeholder-insurer",
  aliases: ["PI", "Placeholder Ins."],
  coverageNotes: "",
  planNotes: "",
  locationIds: [],
  order: "0",
  // Empty id is "no image", which is what the control submits when
  // nothing is chosen.
  [HMO_LOGO.id]: "",
  [HMO_LOGO.alt]: "",
};

describe("hmoSchema", () => {
  it("accepts a complete submission", () => {
    const parsed = hmoSchema.parse(validHmo);
    expect(parsed.aliases).toEqual(["PI", "Placeholder Ins."]);
    expect(parsed.copayApplies).toBe(false);
  });

  it("accepts a single alias, which FormData submits as one string", () => {
    expect(hmoSchema.parse({ ...validHmo, aliases: "PI" }).aliases).toEqual(["PI"]);
  });

  it("accepts no aliases at all", () => {
    const withoutAliases = { ...validHmo };
    delete (withoutAliases as Partial<typeof validHmo>).aliases;
    expect(hmoSchema.parse(withoutAliases).aliases).toEqual([]);
  });

  it("trims and dedupes aliases", () => {
    expect(hmoSchema.parse({ ...validHmo, aliases: ["  PI  ", "PI", ""] }).aliases).toEqual(["PI"]);
  });

  it("rejects more than twenty distinct aliases", () => {
    const many = Array.from({ length: 21 }, (_, index) => `alias-${index}`);
    expect(hmoSchema.safeParse({ ...validHmo, aliases: many }).success).toBe(false);
  });

  it("counts aliases after deduplicating, not before", () => {
    // Twenty-one entries, twenty distinct. Refusing this would be an error
    // about an entry that was never going to be stored.
    const many = Array.from({ length: 20 }, (_, index) => `alias-${index}`);
    const parsed = hmoSchema.parse({ ...validHmo, aliases: [...many, "alias-0"] });
    expect(parsed.aliases).toHaveLength(20);
  });

  it("rejects an alias over its length limit", () => {
    expect(hmoSchema.safeParse({ ...validHmo, aliases: ["x".repeat(121)] }).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* FormData                                                                   */
/* -------------------------------------------------------------------------- */

describe("resourceInput", () => {
  it("keeps every value of a repeated field", () => {
    // `Object.fromEntries` keeps the last, which would silently save one branch
    // out of three and show no error at all.
    const formData = new FormData();
    formData.append("name", "Placeholder");
    formData.append(SERVICE_LOCATIONS_FIELD, UUID_A);
    formData.append(SERVICE_LOCATIONS_FIELD, UUID_B);

    const input = resourceInput(serviceResource, formData);
    expect(input[SERVICE_LOCATIONS_FIELD]).toEqual([UUID_A, UUID_B]);
    expect(input.name).toBe("Placeholder");
  });

  it("gives an unselected list an empty array rather than nothing", () => {
    const input = resourceInput(hmoResource, new FormData());
    expect(input.aliases).toEqual([]);
    expect(input.locationIds).toEqual([]);
  });

  it("rebuilds the seven days from their dotted control names", () => {
    const formData = new FormData();
    formData.append(hoursInputName("hours", "mon", "open"), "08:00");
    formData.append(hoursInputName("hours", "mon", "close"), "18:00");
    formData.append(hoursInputName("hours", "sun", "closed"), "on");

    const input = resourceInput(locationResource, formData);
    const hours = input.hours as Record<string, Record<string, unknown>>;

    expect(hours.mon).toEqual({ open: "08:00", close: "18:00", closed: undefined });
    expect(hours.sun?.closed).toBe("on");
    expect(Object.keys(hours)).toEqual([...DAYS]);
  });

  it("leaves no dotted keys behind for the schema to ignore", () => {
    const formData = new FormData();
    formData.append(hoursInputName("hours", "mon", "open"), "08:00");

    const input = resourceInput(locationResource, formData);
    expect(Object.keys(input).some((key) => key.includes("."))).toBe(false);
  });

  it("round-trips a submitted schedule through the schema and back to jsonb", () => {
    // Every control the form renders, as a browser submits it: the optional
    // ones as empty strings, not as absent keys.
    const formData = new FormData();
    for (const key of [
      "name",
      "addressLine1",
      "city",
      "state",
      "country",
      "phone",
      "emergencyLine",
    ]) {
      formData.append(key, "Placeholder");
    }
    formData.append("slug", "placeholder-branch");
    formData.append("order", "0");
    for (const key of [
      "addressLine2",
      "latitude",
      "longitude",
      "whatsapp",
      "parkingInfo",
      "accessibilityNotes",
      "bookingEmail",
      LOCATION_HERO.id,
      LOCATION_HERO.alt,
    ]) {
      formData.append(key, "");
    }
    formData.append(HOURS_CONFIRMED_FIELD, "on");
    for (const day of DAYS) {
      formData.append(hoursInputName("hours", day, "open"), "09:00");
      formData.append(hoursInputName("hours", day, "close"), "17:00");
    }

    const parsed = locationSchema.parse(resourceInput(locationResource, formData));
    expect(toHoursValue(parsed.hours, true).fri).toEqual({ open: "09:00", close: "17:00" });
  });
});

/* -------------------------------------------------------------------------- */
/* testimonials                                                               */
/* -------------------------------------------------------------------------- */

const validTestimonial = {
  patientName: "A Placeholder",
  slug: "a-placeholder",
  nameFormat: "initials",
  quote: "Placeholder quote text, entered as given.",
  dateGiven: "2026-01-05",
  [TESTIMONIAL_SERVICE_FIELD]: "",
  [TESTIMONIAL_LOCATION_FIELD]: "",
  order: "1",
  published: "on",
  // Empty id is "no image", which is what the control submits when
  // nothing is chosen.
  [TESTIMONIAL_AVATAR.id]: "",
  [TESTIMONIAL_AVATAR.alt]: "",
};

describe("testimonial schema", () => {
  it("accepts a submission with no consent and no attachments", () => {
    const parsed = testimonialSchema.parse(validTestimonial);

    // The default, and the only honest one: consent is a recorded fact, so an
    // absent checkbox is "not recorded", never "assume yes".
    expect(parsed.consentGiven).toBe(false);
    expect(field(parsed, TESTIMONIAL_SERVICE_FIELD)).toBeNull();
    expect(field(parsed, TESTIMONIAL_LOCATION_FIELD)).toBeNull();
  });

  it("keeps consent and published independent in both directions", () => {
    const consentedDraft = testimonialSchema.parse({
      ...validTestimonial,
      consentGiven: "on",
      published: undefined,
    });
    expect(consentedDraft.consentGiven).toBe(true);
    expect(consentedDraft.published).toBe(false);

    const unconsentedLive = testimonialSchema.parse(validTestimonial);
    expect(unconsentedLive.consentGiven).toBe(false);
    expect(unconsentedLive.published).toBe(true);
  });

  it("requires a name format", () => {
    const parsed = testimonialSchema.safeParse({
      ...validTestimonial,
      nameFormat: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses an empty quote", () => {
    expect(testimonialSchema.safeParse({ ...validTestimonial, quote: "   " }).success).toBe(
      false,
    );
  });

  it("refuses a date in the future", () => {
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);

    const parsed = testimonialSchema.safeParse({
      ...validTestimonial,
      dateGiven: nextYear.toISOString().slice(0, 10),
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a service that is not an id", () => {
    const parsed = testimonialSchema.safeParse({
      ...validTestimonial,
      [TESTIMONIAL_SERVICE_FIELD]: "maternity",
    });
    expect(parsed.success).toBe(false);
  });

  it("carries the transcription instruction on the quote field", () => {
    // The wording is the control: an editor who is told to tidy a quote has
    // been told the wrong thing (CLAUDE.md, conversion baseline item 9).
    const quote = testimonialResource.fields.find((f) => f.name === "quote");
    expect(quote?.hint).toBe(
      "Enter exactly as the patient gave it. Do not edit their wording.",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Configs                                                                    */
/* -------------------------------------------------------------------------- */

describe("resource configs", () => {
  const configs = [serviceResource, doctorResource, locationResource, hmoResource];

  it("warns about the live URL before every delete", () => {
    // Each of these four owns a public route. The soft delete is reversible in
    // the database; the 404 it causes in the meantime is not.
    for (const config of configs) {
      expect(config.deleteWarning, config.name).toBeTruthy();
    }
  });

  it("sorts and searches on a column the row actually has", () => {
    for (const config of configs) {
      for (const column of config.columns) {
        if (!column.sortKey) continue;
        expect(
          config.fields.some((f) => f.name === column.sortKey) ||
            ["order", "published"].includes(column.sortKey),
          `${config.name}.${column.sortKey}`,
        ).toBe(true);
      }
      expect(config.fields.some((f) => f.name === config.titleField)).toBe(true);
    }
  });
});
