import { describe, expect, it } from "vitest";

import { dispatchToDestinations } from "@/lib/booking/destinations";
import { withTimeout, type BookingDispatch } from "@/lib/booking/destinations/types";

/**
 * The "a failed destination never fails the booking" guarantee (master spec §7),
 * and the "no patient data in logs" rule.
 *
 * No database is touched: dispatch never reads or writes, so this runs in the
 * normal unit suite. Env comes from tests/setup-env.ts.
 */

const dispatch = {
  booking: {
    id: "00000000-0000-0000-0000-000000000001",
    reference: "PMH-2026-000001",
    locationId: "00000000-0000-0000-0000-000000000002",
    serviceFamily: "family_healthcare",
    serviceId: null,
    preferredDate: "2026-12-01",
    preferredTimeWindow: "morning",
    patientName: "Ada Obi",
    patientPhone: "+2348012345678",
    patientEmail: "ada@example.test",
    patientDob: null,
    existingPatient: false,
    reasonForVisit: "a symptom description that must never be logged",
    hmoId: null,
    hmoPlan: null,
    consentNdpr: true,
    consentTextVersion: "test-v1",
    consentGivenAt: new Date(),
    consentMarketing: false,
    status: "new",
    assignedToUserId: null,
    internalNotes: null,
    source: "website",
    anonymisedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  locationName: "Victoria Island",
  locationSlug: "victoria-island",
  locationBookingEmail: "vi@example.test",
  locationPhone: "+2341234567",
  serviceName: null,
  hmoName: null,
} as unknown as BookingDispatch;

describe("dispatchToDestinations", () => {
  it("never rejects, even though whatsapp is unconfigured", async () => {
    const outcomes = await dispatchToDestinations(dispatch);

    expect(outcomes.length).toBeGreaterThan(0);
    // log is always enabled and always succeeds.
    expect(outcomes.find((o) => o.name === "log")?.result.success).toBe(true);
  });

  it("does not dispatch to the disabled insta-hms stub", async () => {
    const outcomes = await dispatchToDestinations(dispatch);
    expect(outcomes.find((o) => o.name === "insta-hms")).toBeUndefined();
  });

  it("logs no patient data", async () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      await dispatchToDestinations(dispatch);
    } finally {
      process.stdout.write = original;
    }

    const output = written.join("");

    // The log destination is the one that runs on every booking, so this is the
    // regression net for PII leaking into logs.
    expect(output).toContain("PMH-2026-000001");
    expect(output).not.toContain("Ada Obi");
    expect(output).not.toContain("+2348012345678");
    expect(output).not.toContain("ada@example.test");
    expect(output).not.toContain("symptom description");
  });
});

describe("withTimeout", () => {
  it("rejects a promise that outlives its budget", async () => {
    const hung = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(withTimeout(hung, 20, "test")).rejects.toThrow(/timed out/);
  });

  it("passes a value through when it resolves in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "test")).resolves.toBe("ok");
  });
});
