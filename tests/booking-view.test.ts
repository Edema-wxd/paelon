import { describe, expect, it } from "vitest";

import {
  ariaSort,
  bookingHref,
  DEFAULT_BOOKING_SORT,
  paginate,
  parseBookingQuery,
  sortHref,
  type BookingQuery,
} from "@/lib/admin/booking-view";

/**
 * The bookings view state is parsed straight out of a URL anyone can type, so
 * what matters is what it refuses: an unknown status, a date that does not
 * exist, an id that is not one, a page below 1.
 */

const BRANCH = "11111111-1111-4111-8111-111111111111";

describe("parseBookingQuery — defaults", () => {
  it("returns no filters, the default sort and page 1 for an empty query", () => {
    const query = parseBookingQuery({});

    expect(query.filters).toEqual({});
    expect(query.sort).toEqual(DEFAULT_BOOKING_SORT);
    expect(query.page).toBe(1);
  });
});

describe("parseBookingQuery — filters", () => {
  it("reads repeated and comma-separated statuses, without duplicates", () => {
    expect(parseBookingQuery({ status: ["new", "contacted"] }).filters.statuses).toEqual([
      "new",
      "contacted",
    ]);
    expect(parseBookingQuery({ status: "new,new,confirmed" }).filters.statuses).toEqual([
      "new",
      "confirmed",
    ]);
  });

  it("drops a status that is not in the enum", () => {
    expect(parseBookingQuery({ status: ["new", "urgent"] }).filters.statuses).toEqual([
      "new",
    ]);
    expect(parseBookingQuery({ status: "urgent" }).filters.statuses).toBeUndefined();
  });

  it("keeps a branch id only when it is a uuid", () => {
    expect(parseBookingQuery({ location: BRANCH }).filters.locationId).toBe(BRANCH);
    expect(
      parseBookingQuery({ location: "victoria-island" }).filters.locationId,
    ).toBeUndefined();
  });

  it("keeps 'unassigned' and real ids as the assignee, and nothing else", () => {
    expect(parseBookingQuery({ assignee: "unassigned" }).filters.assignee).toBe(
      "unassigned",
    );
    expect(parseBookingQuery({ assignee: BRANCH }).filters.assignee).toBe(BRANCH);
    expect(parseBookingQuery({ assignee: "me" }).filters.assignee).toBeUndefined();
  });

  it("accepts real ISO dates and refuses malformed or impossible ones", () => {
    const query = parseBookingQuery({ from: "2026-09-01", to: "2026-09-30" });
    expect(query.filters.preferredFrom).toBe("2026-09-01");
    expect(query.filters.preferredTo).toBe("2026-09-30");

    for (const bad of ["01/09/2026", "2026-9-1", "2026-02-31", "yesterday", ""]) {
      expect(parseBookingQuery({ from: bad }).filters.preferredFrom, bad).toBeUndefined();
    }
  });
});

describe("parseBookingQuery — sort and page", () => {
  it("accepts known sort columns and falls back for anything else", () => {
    expect(parseBookingQuery({ sort: "createdAt", dir: "desc" }).sort).toEqual({
      column: "createdAt",
      direction: "desc",
    });
    expect(parseBookingQuery({ sort: "patientName" }).sort).toEqual(DEFAULT_BOOKING_SORT);
    // Anything that is not "desc" is ascending, including a missing value.
    expect(parseBookingQuery({ sort: "status", dir: "sideways" }).sort.direction).toBe(
      "asc",
    );
  });

  it("falls back to page 1 for a page that is not a positive number", () => {
    expect(parseBookingQuery({ page: "3" }).page).toBe(3);
    for (const bad of ["0", "-2", "two", ""]) {
      expect(parseBookingQuery({ page: bad }).page, bad).toBe(1);
    }
  });
});

describe("bookingHref", () => {
  it("round-trips a filtered view", () => {
    const params = {
      status: ["new", "contacted"],
      location: BRANCH,
      assignee: "unassigned",
      from: "2026-09-01",
      to: "2026-09-30",
      sort: "createdAt",
      dir: "desc",
      page: "2",
    };
    const query = parseBookingQuery(params);

    expect(parseBookingQuery(paramsFrom(bookingHref(query)))).toEqual(query);
  });

  it("leaves defaults out of the URL", () => {
    expect(bookingHref(parseBookingQuery({}))).toBe("/admin/bookings");
    expect(bookingHref(parseBookingQuery({ sort: "preferredDate", dir: "asc" }))).toBe(
      "/admin/bookings",
    );
  });
});

describe("sortHref", () => {
  const query: BookingQuery = parseBookingQuery({ status: "new", page: "4" });

  it("flips direction on the current column and returns to page 1", () => {
    const flipped = parseBookingQuery(paramsFrom(sortHref(query, "preferredDate")));
    expect(flipped.sort).toEqual({ column: "preferredDate", direction: "desc" });
    expect(flipped.page).toBe(1);
    // The filter survives a sort; page 4 of one ordering is not page 4 of another.
    expect(flipped.filters.statuses).toEqual(["new"]);
  });

  it("starts a different column ascending", () => {
    expect(parseBookingQuery(paramsFrom(sortHref(query, "status"))).sort).toEqual({
      column: "status",
      direction: "asc",
    });
  });
});

describe("ariaSort", () => {
  it("marks only the sorted column", () => {
    const query = parseBookingQuery({ sort: "status", dir: "desc" });
    expect(ariaSort(query, "status")).toBe("descending");
    expect(ariaSort(query, "reference")).toBe("none");
  });
});

describe("paginate", () => {
  it("describes the current page", () => {
    expect(paginate(120, 2, 25)).toMatchObject({ page: 2, pages: 5, from: 26, to: 50 });
  });

  it("clamps a page past the end and handles an empty result", () => {
    expect(paginate(10, 99, 25)).toMatchObject({ page: 1, pages: 1, from: 1, to: 10 });
    expect(paginate(0, 1, 25)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0 });
  });
});

/** Turn a built href back into the shape Next hands a page. */
function paramsFrom(href: string): Record<string, string | string[]> {
  const search = new URLSearchParams(href.split("?")[1] ?? "");
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    params[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  return params;
}
