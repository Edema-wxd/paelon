import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_WHATSAPP,
  NEW_DOCTOR_SLUGS,
  NEW_SERVICE_SLUGS,
  SPECIALTY_DOCTOR_SLUGS,
  WHATSAPP_LOCATION_SLUG,
  appendedOrders,
  decideNewRow,
  fillIfEmpty,
  mergeSpecialties,
} from "@/lib/db/paelon-list-plan";
import { doctorSeedSchema, locationSeedSchema, serviceSeedSchema } from "@/lib/validation/seed";

const seed = (file: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), "seed", file), "utf8"));

describe("decideNewRow", () => {
  it("inserts a slug nobody holds", () => {
    expect(decideNewRow(undefined)).toEqual({ kind: "insert" });
  });

  it("leaves a live row alone", () => {
    expect(decideNewRow({ deletedAt: null })).toEqual({ kind: "exists" });
  });

  it("reports a soft-deleted row instead of colliding with it", () => {
    expect(decideNewRow({ deletedAt: new Date() })).toEqual({ kind: "deleted" });
  });
});

describe("mergeSpecialties", () => {
  const wanted = ["Paediatrics", "General Practice", "Travel Health"];

  it("fills an empty list", () => {
    expect(mergeSpecialties([], wanted)).toEqual({ kind: "set", value: wanted });
  });

  it("appends what is missing and keeps the stored order", () => {
    expect(mergeSpecialties(["Travel Health", "Paediatrics"], wanted)).toEqual({
      kind: "set",
      value: ["Travel Health", "Paediatrics", "General Practice"],
    });
  });

  it("matches regardless of case and spacing", () => {
    expect(mergeSpecialties(["paediatrics ", "general practice", "TRAVEL HEALTH"], wanted)).toEqual({
      kind: "unchanged",
    });
  });

  it("does nothing when the list is already complete", () => {
    expect(mergeSpecialties([...wanted, "Neonatology"], wanted)).toEqual({ kind: "unchanged" });
  });

  it("never touches a list an editor changed", () => {
    expect(mergeSpecialties(["Neonatology"], wanted)).toEqual({ kind: "edited" });
  });
});

describe("fillIfEmpty", () => {
  it("fills null, blank and the seed placeholder", () => {
    for (const current of [null, "", "  ", "TODO(seed)"]) {
      expect(fillIfEmpty(current, APPOINTMENT_WHATSAPP)).toEqual({ kind: "set", value: APPOINTMENT_WHATSAPP });
    }
  });

  it("treats the same number in another format as unchanged", () => {
    expect(fillIfEmpty("+2349125120020", APPOINTMENT_WHATSAPP)).toEqual({ kind: "unchanged" });
  });

  it("keeps a different number", () => {
    expect(fillIfEmpty("+234 800 000 0000", APPOINTMENT_WHATSAPP)).toEqual({
      kind: "edited",
      current: "+234 800 000 0000",
    });
  });
});

describe("appendedOrders", () => {
  it("continues after the current maximum", () => {
    expect(appendedOrders(8, 3)).toEqual([9, 10, 11]);
  });

  it("starts at 1 on an empty table", () => {
    expect(appendedOrders(null, 2)).toEqual([1, 2]);
  });
});

describe("the plan matches seed/", () => {
  const services = serviceSeedSchema.array().parse(seed("services.json"));
  const doctors = doctorSeedSchema.array().parse(seed("doctors.json"));
  const locations = locationSeedSchema.array().parse(seed("locations.json"));

  it("names only services that are seeded and published", () => {
    for (const slug of NEW_SERVICE_SLUGS) {
      expect(services.find((s) => s.slug === slug)?.published, slug).toBe(true);
    }
  });

  it("names only doctors that are seeded", () => {
    for (const slug of [...NEW_DOCTOR_SLUGS, ...SPECIALTY_DOCTOR_SLUGS]) {
      expect(doctors.some((d) => d.slug === slug), slug).toBe(true);
    }
  });

  it("does not list a doctor as both new and existing", () => {
    const overlap = NEW_DOCTOR_SLUGS.filter((slug) =>
      (SPECIALTY_DOCTOR_SLUGS as readonly string[]).includes(slug),
    );
    expect(overlap).toEqual([]);
  });

  it("sets the WhatsApp number the seed carries", () => {
    expect(locations.find((l) => l.slug === WHATSAPP_LOCATION_SLUG)?.whatsapp).toBe(APPOINTMENT_WHATSAPP);
  });
});
