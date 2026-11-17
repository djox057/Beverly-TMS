import { describe, expect, it } from "vitest";
import { getReportLoadFinancials, REPORT_LOAD_FINANCIAL_COLUMNS } from "./reportLoadFinancials";

describe("Reports Load Info additionals", () => {
  it("fetches financial fields omitted from the reports date-window cache", () => {
    const fields = REPORT_LOAD_FINANCIAL_COLUMNS.split(", ");
    for (const field of ["other_additionals", "other_additionals_driver", "other_additionals_items",
      "other_additionals_reason", "other_charges_items", "other_charges_reason", "lumper_items",
      "late_fee", "no_tracking_fee_driver", "wrong_address_fee", "escort_fee"]) {
      expect(fields).toContain(field);
    }
    expect(fields).not.toContain("escort_fee_driver");
  });

  it("shows multiple Other Additionals with reasons without counting aggregate amounts twice", () => {
    const result = getReportLoadFinancials({
      freight_amount: 1650, driver_price: 1500,
      other_additionals: 150, other_additionals_driver: 50,
      other_additionals_items: [
        { amount: 100, driverAmount: 20, reason: "Trailer wash" },
        { amount: "50", driver_amount: "30", reason: "Parking" },
      ],
    });
    expect(result.rows).toMatchObject([
      { label: "Other Additionals", reason: "Trailer wash", companyAmount: 100, driverAmount: 20 },
      { label: "Other Additionals", reason: "Parking", companyAmount: 50, driverAmount: 30 },
    ]);
    expect(result).toMatchObject({ freightAmount: 1800, driverPay: 1550 });
  });

  it("supports legacy amounts and reasons, driver-only entries, and deductions", () => {
    const result = getReportLoadFinancials({
      freight_amount: "1650", driver_price: "1500",
      other_additionals: "100", other_additionals_reason: "Reimbursement", other_additionals_items: [],
      other_charges: 25, other_charges_driver: 10, other_charges_reason: "Damage",
      detention_driver: 50, late_fee: 20, no_tracking_fee_driver: 15,
    });
    expect(result).toMatchObject({ freightAmount: 1705, driverPay: 1525 });
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Other Additionals", reason: "Reimbursement", companyAmount: 100 }),
      expect.objectContaining({ label: "Other Charges", reason: "Damage", companyAmount: -25, driverAmount: -10 }),
      expect.objectContaining({ label: "Detention", companyAmount: 0, driverAmount: 50 }),
    ]));
  });

  it("preserves lumper totals while showing each saved item", () => {
    const result = getReportLoadFinancials({
      freight_amount: 1000, driver_price: 800, lumper: 150, lumper_driver: 30,
      lumper_items: [{ amount: 100, reason: "First stop" }, { amount: 50, reason: "Second stop" }],
    });
    expect(result.rows).toHaveLength(2);
    expect(result).toMatchObject({ freightAmount: 1150, driverPay: 830 });
  });

  it("handles empty and malformed data without displaying invalid amounts", () => {
    expect(getReportLoadFinancials({})).toEqual({ rows: [], freightAmount: 0, driverPay: 0 });
    expect(getReportLoadFinancials({
      freight_amount: "invalid", other_additionals_items: [null, false, [], { amount: "invalid", driverAmount: Infinity }],
    })).toEqual({ rows: [], freightAmount: 0, driverPay: 0 });
  });
});
