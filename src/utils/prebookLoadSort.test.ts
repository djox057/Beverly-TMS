import { expect, it } from "vitest";
import { compareLoadsByPickupAndAvailability } from "./prebookLoadSort";
it("sorts earliest pickup day first, then Available before Covered, with undated loads last", () => {
  const rows = [
    { id: "covered", pickupDatetime: "2026-10-20 08:00:00+00", pStatus: "Covered" },
    { id: "later-day", pickupDatetime: "2026-10-21 08:00:00+00", pStatus: "Available" },
    { id: "available", pickupDatetime: "2026-10-20 14:00:00+00", pStatus: "Available" },
    { id: "undated", pickupDatetime: null, pStatus: "Available" },
    { id: "earlier-day", pickupDatetime: "2026-10-19 14:00:00+00", pStatus: "Covered" },
  ];
  expect(rows.sort(compareLoadsByPickupAndAvailability).map(row => row.id)).toEqual(["earlier-day", "available", "covered", "later-day", "undated"]);
});
