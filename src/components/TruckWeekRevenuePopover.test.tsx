import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TruckWeekRevenuePopover } from "./TruckWeekRevenuePopover";

const { from, limit } = vi.hoisted(() => ({ from: vi.fn(), limit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

afterEach(cleanup);

it.each([false, true])("excludes lumper from weekly freight, RPM and commission (fetched: %s)", async (fetched) => {
  const order = {
    pickup_datetime: "2026-10-20T09:00:00Z",
    freight_amount: "3000", driver_price: "2400",
    detention: "100", late_fee: "50", lumper: "317.55",
    loaded_miles: 900, dh_miles: 100,
  };
  const query = { select: vi.fn(), eq: vi.fn(), or: vi.fn(), gte: vi.fn(), lt: vi.fn(), limit };
  for (const method of [query.select, query.eq, query.or, query.gte, query.lt]) method.mockReturnValue(query);
  from.mockReturnValue(query);
  limit.mockResolvedValue({ data: [order], error: null });
  render(<TruckWeekRevenuePopover
    orders={fetched ? [] : [order]}
    driverId={fetched ? "driver-1" : undefined}
    referenceDate={new Date("2026-10-21T12:00:00Z")}
  />);
  fireEvent.click(screen.getByRole("button", { name: "$" }));
  await waitFor(() => expect(screen.getByText("Freight:").nextElementSibling).toHaveTextContent("$3,050.00"));
  expect(screen.getByText("Freight:").nextElementSibling).toHaveTextContent("$3.05/mi");
  expect(screen.getByText("Stop Amt:").nextElementSibling).toHaveTextContent("$2,400.00");
  expect(screen.getByText("Comm:").nextElementSibling).toHaveTextContent("$650.00");
  expect(screen.getByText("Comm:").nextElementSibling).toHaveTextContent("21.3%");
});
