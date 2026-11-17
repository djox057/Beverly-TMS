import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { getReportLoadFinancials } from "@/lib/reportLoadFinancials";
import { LoadAdditionals } from "./LoadAdditionals";

afterEach(cleanup);

it("displays Other Additionals reasons, company/driver amounts, and signed deductions", () => {
  const { rows } = getReportLoadFinancials({
    other_additionals_items: [{ amount: 125, driverAmount: 50, reason: "Trailer wash" }],
    other_charges: 20, other_charges_driver: 10, other_charges_reason: "Damage",
  });
  render(<LoadAdditionals rows={rows} />);
  const table = screen.getByRole("table");
  expect(within(table).getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
  expect(within(table).getByRole("columnheader", { name: "Driver" })).toBeInTheDocument();
  const additional = screen.getByText("Trailer wash").closest("tr")!;
  expect(additional).toHaveTextContent("Other Additionals");
  expect(additional).toHaveTextContent("$125.00");
  expect(additional).toHaveTextContent("$50.00");
  const charge = screen.getByText("Damage").closest("tr")!;
  expect(charge).toHaveTextContent("-$20.00");
  expect(charge).toHaveTextContent("-$10.00");
});

it("does not add an empty table for loads without additionals", () => {
  render(<LoadAdditionals rows={[]} />);
  expect(screen.queryByRole("region", { name: "Load additionals" })).not.toBeInTheDocument();
});
