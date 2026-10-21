import { expect, it } from "vitest";
import { formatStoredEfsMoneyCode } from "./efsMoneyCodeText";

it("shows the recorded trailer repair in the requested text format", () => {
  expect(formatStoredEfsMoneyCode({ truck_number: "7348", driver_name: "Tyrell Lipscomb", amount: 608.49, purpose: "Repairs",
    purpose_detail: "Trailer alignment", is_trailer_repair: true, trailer_number: "407613", location_name: "All American Truck & Trailer",
    location_address: "4425 Stickney Ave, Toledo, OH 43612" }))
    .toBe("EFS Money Code\n\nUnit: 7348 / 407613\nDriver: Tyrell Lipscomb\nPurpose: Trailer alignment\nAmount: $608.49\nLocation: All American Truck & Trailer 4425 Stickney Ave, Toledo, OH 43612");
});
it("can display legacy records without requiring details or a migration", () => {
  expect(formatStoredEfsMoneyCode({ truck_number: "9489", driver_name: "Tellyah Stuart", amount: 100, purpose: "Load brs" }))
    .toBe("EFS Money Code\n\nUnit: 9489\nDriver: Tellyah Stuart\nPurpose: Load brs\nAmount: $100.00\nLocation: N/A");
});
it("uses existing city and state when the full address was not recorded", () => {
  const text = formatStoredEfsMoneyCode({ truck_number: "123", driver_name: "Driver", amount: 50, purpose: "Fuel", city: "Toledo", state: "OH", trailer_number: "456", is_trailer_repair: false });
  expect(text).toContain("Unit: 123\n"); expect(text).toContain("Location: Toledo, OH"); expect(text).not.toContain("456");
});
