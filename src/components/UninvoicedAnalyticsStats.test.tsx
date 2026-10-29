import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { UninvoicedAnalyticsStats } from "./UninvoicedAnalyticsStats";
import { transformOrders } from "@/utils/ordersTransform";

afterEach(cleanup);

it("hides the third row from users without the admin role", () => {
  const { container } = render(<UninvoicedAnalyticsStats isAdmin={false} orders={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it("counts locked and unlocked uninvoiced loads using the existing freight calculation", () => {
  const orders = transformOrders([
    { id: "unlocked", invoiced: false, freight_amount: 1000, detention: 50, lumper: 200 },
    { id: "locked", locked: true, invoiced: false, freight_amount: 2000 },
    { id: "invoiced", invoiced: true, freight_amount: 9999 },
    { id: "legacy", invoiced: null, freight_amount: 500 },
    { id: "string-true", invoiced: "true", freight_amount: 9999 },
  ]);
  render(<UninvoicedAnalyticsStats isAdmin orders={orders} />);
  expect(screen.getByText("$3,550.00")).toBeInTheDocument();
  expect(screen.getByText("Uninvoiced Loads").parentElement).toHaveTextContent("3");
});

it("shows zero when no uninvoiced loads match and updates when invoice status changes", () => {
  const { rerender } = render(<UninvoicedAnalyticsStats isAdmin orders={[]} />);
  expect(screen.getByText("Uninvoiced Total Freight").parentElement).toHaveTextContent("$0.00");
  expect(screen.getByText("Uninvoiced Loads").parentElement).toHaveTextContent("0");
  rerender(<UninvoicedAnalyticsStats isAdmin orders={[{ invoiced: false, totalFreightAmountNoLumper: 1200 }]} />);
  expect(screen.getByText("Uninvoiced Total Freight").parentElement).toHaveTextContent("$1,200.00");
  rerender(<UninvoicedAnalyticsStats isAdmin orders={[{ invoiced: true, totalFreightAmountNoLumper: 1200 }]} />);
  expect(screen.getByText("Uninvoiced Total Freight").parentElement).toHaveTextContent("$0.00");
});

it("calculates unpaid values independently of invoice status and excludes paid loads", () => {
  const orders = transformOrders([
    { id: "both", invoiced: false, paid: false, freight_amount: 1000, lumper: 200 },
    { id: "invoiced-unpaid", invoiced: true, paid: false, freight_amount: 2000 },
    { id: "paid-uninvoiced", invoiced: false, paid: true, freight_amount: 4000 },
    { id: "paid-invoiced", invoiced: true, paid: true, freight_amount: 8000 },
    { id: "legacy-unpaid", invoiced: true, paid: null, freight_amount: 500 },
    { id: "string-paid", invoiced: true, paid: "true", freight_amount: 9999 },
  ]);
  render(<UninvoicedAnalyticsStats isAdmin orders={orders} />);
  expect(screen.getByText("Not Paid Freight").parentElement).toHaveTextContent("$3,500.00");
  expect(screen.getByText("Not Paid Loads").parentElement).toHaveTextContent("3");
  expect(screen.getByText("Uninvoiced Total Freight").parentElement).toHaveTextContent("$5,000.00");
  expect(screen.getByText("Uninvoiced Loads").parentElement).toHaveTextContent("2");
});
