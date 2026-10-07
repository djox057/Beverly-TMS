import { describe, expect, it, vi } from "vitest";
import { chicagoToday, pretripDueDate, pretripWeekStart, pretripWeekEnd, stepPretripDate } from "./pretripDates";

describe("weekly pre-trip dates", () => {
  it("puts inspections from every day in the same Monday-Sunday week", () => {
    for (const day of ["05", "06", "07", "08", "09", "10", "11"]) {
      expect(pretripWeekStart(`2026-10-${day}`)).toBe("2026-10-05");
      expect(pretripWeekEnd(`2026-10-${day}`)).toBe("2026-10-11");
    }
    expect(pretripWeekStart("2026-10-12")).toBe("2026-10-12");
  });
  it("navigates whole weeks across year and leap-day boundaries", () => {
    expect(stepPretripDate("2027-01-01", -1)).toBe("2026-12-21");
    expect(stepPretripDate("2027-01-01", 1)).toBe("2027-01-04");
    expect(pretripWeekEnd("2024-02-29")).toBe("2024-03-03");
  });
  it("uses the Chicago day at a UTC Monday boundary", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-12T02:00:00Z"));
      expect(chicagoToday()).toBe("2026-10-11");
      expect(pretripDueDate()).toBe("2026-10-05");
      vi.setSystemTime(new Date("2026-10-12T06:00:00Z"));
      expect(pretripDueDate()).toBe("2026-10-12");
    } finally { vi.useRealTimers(); }
  });
});
