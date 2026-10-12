import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LiveOilChange from "./LiveOilChange";

const mocks = vi.hoisted(() => ({ cellRender: vi.fn(), tables: [] as string[], historyRequests: 0 }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ getPrimaryRole: () => "maintenance", profile: { user_id: "user1" }, user: { email: "test@example.com" } }) }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe: vi.fn() }; return c; } }));
vi.mock("@/components/TruckSourceSelect", () => ({ TruckSourceSelect: ({ ariaLabel }: { ariaLabel: string }) => { mocks.cellRender(ariaLabel); return <button aria-label={ariaLabel}>Source</button>; } }));
vi.mock("@/components/liveOilChange/MileageHistoryPopover", () => ({ MileageHistoryPopover: () => null }));
vi.mock("@/components/liveOilChange/OdometerHistoryPopover", () => ({ OdometerHistoryPopover: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [], error: null }),
  from: (table: string) => {
    mocks.tables.push(table);
    const trucks = Array.from({ length: 499 }, (_, i) => ({ id: `truck${i}`, truck_number: String(i + 1).padStart(4, "0"), source: "BF TRUCK", miles: 150000, last_oil_change_miles: 130000, miles_updated_at: "2026-10-12T12:00:00Z", is_active: true, driver1_id: "driver1", company_id: null, dispatcher_id: null }));
    const data = table === "trucks" ? trucks : table === "drivers" ? [{ id: "driver1", first_name: "Jane", last_name: "Driver", dispatcher_id: null, company_id: null }] : [];
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, not: () => q, gte: () => q, lt: () => q,
      range: async () => { mocks.historyRequests++; return { data: [{ truck_id: "truck498", changed_by: "user1" }], error: null }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return q;
  },
} }));
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><LiveOilChange /></MemoryRouter></QueryClientProvider>);
beforeEach(() => { mocks.cellRender.mockClear(); mocks.tables = []; mocks.historyRequests = 0; });
afterEach(cleanup);

it("mounts at most 50 truck rows and searches the full fleet beyond the first page", async () => {
  mount();
  await screen.findByText("1–50 of 499 trucks");
  expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(50);
  expect(screen.getByText("Page 1 of 10")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("link", { name: "Open service log for truck 0051" })).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Search unit or driver..."), { target: { value: "0499" } });
  await waitFor(() => expect(screen.getByText("1–1 of 1 trucks")).toBeInTheDocument());
  expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Open service log for truck 0499" })).toBeInTheDocument();
  expect(mocks.tables.filter(table => table === "trucks")).toHaveLength(1);
  expect(mocks.tables).not.toContain("dispatcher_status");
});

it("does not rebuild truck cells when opening mileage updates or changing the month", async () => {
  mount(); await screen.findByText("1–50 of 499 trucks");
  expect(mocks.historyRequests).toBe(0);
  mocks.cellRender.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Mileage updates" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 1 / 499"));
  expect(mocks.cellRender).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Month"));
  fireEvent.click(screen.getByRole("button", { name: "September" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 1 / 499"));
  expect(mocks.cellRender).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Updated assigned" }));
  await screen.findByRole("link", { name: "Open service log for truck 0499" });
  expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("1 / 499");
});
