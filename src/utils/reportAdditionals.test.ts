import { describe, expect, it } from "vitest";
import { getReportAdditionals, REPORT_ADDITIONAL_COLUMNS } from "./reportAdditionals";

describe("Reports Load Info additionals", () => {
  it("shows the late and reschedule fees with both payer amounts", () => {
    const rows = getReportAdditionals({
      late_fee: 750, late_fee_driver: 750,
      other_charges: 750, other_charges_driver: 750,
      other_charges_items: [{ amount: 750, driverAmount: 750, reason: "reschedule fee" }],
    });
    expect(rows.map(({ label, companyAmount, driverAmount, deduction }) =>
      ({ label, companyAmount, driverAmount, deduction }))).toEqual([
      { label: "Late Fee", companyAmount: 750, driverAmount: 750, deduction: true },
      { label: "reschedule fee", companyAmount: 750, driverAmount: 750, deduction: true },
    ]);
  });

  it("keeps separate custom items without also showing their scalar total", () => {
    const rows = getReportAdditionals({
      other_additionals: 300,
      other_additionals_items: [
        { amount: 100, driver_amount: 50, reason: "First" },
        { amount: 200, driverAmount: 80, reason: "Second" },
      ],
    });
    expect(rows.map(row => [row.label, row.companyAmount, row.driverAmount, row.deduction]))
      .toEqual([["First", 100, 50, false], ["Second", 200, 80, false]]);
  });

  it("falls back to legacy amounts/reasons and supports driver-only fees", () => {
    const rows = getReportAdditionals({
      other_charges: "100", other_charges_driver: "25", other_charges_reason: "Legacy fee",
      other_charges_items: [], detention_driver: 60,
    });
    expect(rows.map(row => [row.label, row.companyAmount, row.driverAmount]))
      .toEqual([["Detention", 0, 60], ["Legacy fee", 100, 25]]);
  });

  it("handles multiple lumpers, empty orders and invalid amounts", () => {
    expect(getReportAdditionals({})).toEqual([]);
    expect(getReportAdditionals({ late_fee: "invalid", late_fee_driver: Infinity })).toEqual([]);
    expect(getReportAdditionals({ lumper: 300, lumper_items: [
      { amount: 100, reason: "Pickup" }, { amount: 200, reason: "Delivery" },
    ] }).map(row => [row.label, row.companyAmount, row.hasDriver]))
      .toEqual([["Pickup", 100, false], ["Delivery", 200, false]]);
  });

  it("requests the custom item arrays, legacy reasons and penalty amounts", () => {
    const columns = REPORT_ADDITIONAL_COLUMNS.split(",").map(column => column.trim());
    expect(columns).toEqual(expect.arrayContaining([
      "late_fee", "late_fee_driver", "other_charges_items", "other_charges_reason",
      "other_additionals_items", "other_additionals_reason", "lumper_items",
    ]));
  });
});
