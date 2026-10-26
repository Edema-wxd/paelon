import { describe, expect, it } from "vitest";

import { displayPatientName } from "@/lib/testimonials/display-name";

describe("displayPatientName", () => {
  it.each([
    ["Sarah Adenuga", "full", "Sarah Adenuga"],
    ["  Sarah   Adenuga ", "full", "Sarah Adenuga"],
    ["Sarah Adenuga", "first_only", "Sarah"],
    ["Sarah Adenuga", "initials", "S.A."],
    ["sarah adenuga", "initials", "S.A."],
    ["Mary-Jane O'Neil", "initials", "M.O."],
    ["Chukwuemeka Ifeanyi Okafor", "initials", "C.I.O."],
    ["Ada", "initials", "A."],
    ["Ada", "first_only", "Ada"],
    ["", "full", ""],
    ["   ", "initials", ""],
  ] as const)("%j as %s → %j", (name, format, expected) => {
    expect(displayPatientName(name, format)).toBe(expected);
  });

  it("never returns the surname for first-name or initials consent", () => {
    for (const format of ["first_only", "initials"] as const) {
      expect(displayPatientName("Sarah Adenuga", format)).not.toContain("Adenuga");
    }
  });
});
