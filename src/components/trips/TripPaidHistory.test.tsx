import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TripPaidHeader } from "./TripPaidHistory";

const mocks = vi.hoisted(() => ({ statements: vi.fn(), legacy: vi.fn(), drivers: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        if (table === "drivers") return { eq: mocks.drivers };

        const scope = (range: (start: number, end: number) => unknown) => {
          const query = { order: () => query, range };
          return query;
        };
        return {
          eq: (column: string, id: string) => scope((start, end) => mocks.statements(column, id, start, end)),
          is: () => ({ eq: (column: string, name: string) => scope((start, end) => mocks.legacy(column, name, start, end)) }),
        };
      },
    }),
  },
}));

const firstDriver = { driver1Id: "driver-a", driverName: "Alex Driver", truckNumber: "1001" };
const secondDriver = { driver1Id: "driver-b", driverName: "Sam Driver", truckNumber: "1002" };

function renderHeader(trips = [firstDriver]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <table><thead><tr><TripPaidHeader trips={trips} viewerScope={["user-a", "admin"]} /></tr></thead></table>
    </QueryClientProvider>,
  );
  return screen.getByRole("button", { name: "Paid" });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("opens on double-click and totals historical weekly statements, preferring the driver-linked amount", async () => {
  mocks.statements.mockResolvedValue({ data: [{ week_start: "2026-11-17", paid_amount: 1000.05 }] });
  mocks.legacy.mockResolvedValue({ data: [
    { week_start: "2026-11-17", paid_amount: 999.99 },
    { week_start: "2026-10-06", paid_amount: -10.1 },
    { week_start: "2026-10-06", paid_amount: 0.02 },
  ] });
  mocks.drivers.mockReturnValue({ limit: async () => ({ data: [{ id: "driver-a" }] }) });
  const paid = renderHeader();

  fireEvent.click(paid, { detail: 1 });
  expect(screen.queryByRole("dialog", { name: "Paid history" })).not.toBeInTheDocument();
  expect(mocks.statements).not.toHaveBeenCalled();

  fireEvent.doubleClick(paid);
  const history = await screen.findByRole("dialog", { name: "Paid history" });
  expect(await within(history).findByText("$989.97")).toBeInTheDocument();
  expect(mocks.statements).toHaveBeenCalledWith("driver_id", "driver-a", 0, 499);

  const breakdown = within(history).getByText("Week by week");
  const weeks = breakdown.closest("details")!;
  expect(weeks).not.toHaveAttribute("open");
  fireEvent.click(breakdown);
  expect(weeks).toHaveAttribute("open");
  expect(within(weeks).getAllByRole("term").map(term => term.textContent)).toEqual([
    "Nov 17 – Nov 23, 2026", "Oct 6 – Oct 12, 2026",
  ]);
  expect(within(weeks).getByText("$1,000.05")).toBeInTheDocument();
  expect(within(weeks).getByText("$-10.08")).toBeInTheDocument();
});

it("lets the user select a driver and excludes legacy payments with an ambiguous driver name", async () => {
  mocks.statements.mockResolvedValue({ data: [] });
  mocks.legacy.mockResolvedValue({ data: [{ week_start: "2026-11-17", paid_amount: 124.23 }] });
  mocks.drivers.mockReturnValue({ limit: async () => ({ data: [{ id: "driver-b" }, { id: "driver-c" }] }) });
  const paid = renderHeader([firstDriver, secondDriver]);

  fireEvent.click(paid, { detail: 0 });
  const history = await screen.findByRole("dialog", { name: "Paid history" });
  const drivers = within(history).getByRole("combobox", { name: "Driver" });
  expect(mocks.statements).not.toHaveBeenCalled();

  fireEvent.change(drivers, { target: { value: "driver-b" } });
  expect(await within(history).findByText(/older statements are missing a unique driver match/)).toBeInTheDocument();
  expect(within(history).getByText("$0.00")).toBeInTheDocument();
  expect(mocks.statements).toHaveBeenCalledWith("driver_id", "driver-b", 0, 499);
});
