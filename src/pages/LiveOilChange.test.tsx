import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LiveOilChange from "./LiveOilChange";
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.scrollIntoView = () => {};

const mocks = vi.hoisted(() => ({ cellRender: vi.fn(), tables: [] as string[], historyRequests: 0, role: "maintenance", assignmentFixtures: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ getPrimaryRole: () => mocks.role, profile: { user_id: "user1" }, user: { email: "test@example.com" } }) }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe: vi.fn() }; return c; } }));
vi.mock("@/components/TruckSourceSelect", () => ({ TruckSourceSelect: ({ ariaLabel }: { ariaLabel: string }) => { mocks.cellRender(ariaLabel); return <button aria-label={ariaLabel}>Source</button>; } }));
vi.mock("@/components/liveOilChange/MileageHistoryPopover", () => ({ MileageHistoryPopover: () => null }));
vi.mock("@/components/liveOilChange/OdometerHistoryPopover", () => ({ OdometerHistoryPopover: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [], error: null }),
  from: (table: string) => {
    mocks.tables.push(table);
    const trucks = Array.from({ length: 499 }, (_, i) => ({ id: `truck${i}`, truck_number: String(i + 1).padStart(4, "0"), source: "BF TRUCK", miles: 150000, fleet_pm_readiness: i === 498 ? "SERVICE OVERDUE" : "READY / GOOD", last_oil_change_miles: 130000, miles_updated_at: "2026-10-12T12:00:00Z", is_active: true, driver1_id: "driver1", company_id: i === 498 ? "company1" : null, dispatcher_id: i === 498 ? "user1" : null, ...(i === 498 ? { source: "TEL", miles: 160000 } : {}) }));
    if (mocks.assignmentFixtures) trucks.splice(0, trucks.length,
      ...[
        { id: "own", truck_number: "OWN", dispatcher_id: "user1", driver1_id: "driver1" },
        { id: "no-dispatcher", truck_number: "NO-DISPATCHER", dispatcher_id: null, driver1_id: "driver1" },
        { id: "no-driver", truck_number: "NO-DRIVER", dispatcher_id: "other", driver1_id: null },
        { id: "neither", truck_number: "NEITHER", dispatcher_id: null, driver1_id: null },
        { id: "other", truck_number: "OTHER", dispatcher_id: "other", driver1_id: "driver1" },
      ].map(truck => ({ ...trucks[0], ...truck })),
    );
    const data = table === "trucks" ? trucks : table === "drivers" ? [{ id: "driver1", first_name: "Jane", last_name: "Driver", dispatcher_id: null, company_id: null }] : table === "companies" ? [{ id: "company1", name: "Test Company" }] : table === "user_roles" ? [{ user_id: "user1" }] : table === "profiles" ? [{ user_id: "user1", id: "user1", full_name: "Test Dispatcher", office: "Chicago" }] : [];
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, not: () => q, gte: () => q, lt: () => q,
      range: async () => { mocks.historyRequests++; return { data: [{ truck_id: "truck498", changed_by: "user1" }], error: null }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return q;
  },
} }));
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><LiveOilChange /></MemoryRouter></QueryClientProvider>);
beforeEach(() => { localStorage.clear(); mocks.role = "maintenance"; mocks.assignmentFixtures = false; mocks.cellRender.mockClear(); mocks.tables = []; mocks.historyRequests = 0; });
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
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All trucks updated 1 / 499"));
  expect(mocks.cellRender).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Month"));
  fireEvent.click(screen.getByRole("button", { name: "September" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All trucks updated 1 / 499"));
  expect(mocks.cellRender).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Updated" }));
  await screen.findByRole("link", { name: "Open service log for truck 0499" });
  expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("1 / 499");
});

it("shows truck readiness and counts the same value in statistics", async () => {
  mount(); await screen.findByText("1–50 of 499 trucks");
  fireEvent.change(screen.getByPlaceholderText("Search unit or driver..."), { target: { value: "0499" } });
  await screen.findByText("SERVICE OVERDUE");
  fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
  const heading = screen.getByRole("heading", { name: "Fleet PM Readiness" });
  expect(heading.parentElement).toHaveTextContent("1SERVICE OVERDUE");
});

it.each([
  [0, "company1"], [1, "TEL"], [2, "user1"], [3, "Chicago"], [4, "over28"],
])("keeps filter %i working with readiness", async (index, value) => {
  mount(); await screen.findByText("1–50 of 499 trucks");
  const trigger = screen.getAllByRole("combobox")[index];
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const names: Record<string, string> = { company1: "Test Company", TEL: "TEL", user1: "Test Dispatcher", Chicago: "Chicago", over28: "> 28,000" };
  fireEvent.click(await screen.findByRole("option", { name: names[value] }));
  await screen.findByText("1–1 of 1 trucks");
  expect(screen.getByRole("link", { name: "Open service log for truck 0499" })).toBeInTheDocument();
  expect(screen.getByText("SERVICE OVERDUE")).toBeInTheDocument();
});

it("filters statistics categories, switches categories and clears without losing fleet counts", async () => {
  mount(); await screen.findByRole("link", { name: "Open service log for truck 0001" });
  fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter oil changes: Due" }));
  await screen.findByRole("link", { name: "Open service log for truck 0499" });
  expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Filter oil changes: Due" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Filter oil changes: Good" })).toHaveTextContent("498");
  fireEvent.click(screen.getByRole("button", { name: "Filter fleet readiness: SERVICE OVERDUE" }));
  expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Filter air filters: Missing / invalid" }));
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(50));
  fireEvent.click(screen.getByRole("button", { name: "Filter oil changes: Overdue" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: /Open service log/ })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear category filter" }));
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(50));
}, 15000);

it("loads stored readiness with trucks without querying any service history", async () => {
  mount(); await screen.findByRole("link", { name: "Open service log for truck 0001" });
  expect(screen.getAllByText("READY / GOOD").length).toBeGreaterThan(0);
  expect(mocks.tables).not.toContain("truck_service_log_entries");
  expect(mocks.tables).not.toContain("truck_mileage_history");
});


it("restores report filters and mileage controls after leaving and remounting", async () => {
  const first = mount();
  await screen.findByText("1–50 of 499 trucks");
  fireEvent.click(screen.getByRole("button", { name: "Mileage updates" }));
  fireEvent.click(screen.getByRole("button", { name: "Assigned trucks" }));
  fireEvent.click(screen.getByRole("button", { name: "Updated" }));
  fireEvent.change(screen.getByPlaceholderText("Search unit or driver..."), { target: { value: "0499" } });
  await screen.findByRole("link", { name: "Open service log for truck 0499" });
  first.unmount();
  mount();
  expect(screen.getByPlaceholderText("Search unit or driver...")).toHaveValue("0499");
  expect(screen.getByRole("button", { name: "Assigned trucks" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Updated" })).toHaveAttribute("aria-pressed", "true");
  await screen.findByRole("link", { name: "Open service log for truck 0499" });
  expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(1);
});

it.each(["dispatch", "supervisor"])("shows trucks missing either assignment to %s while excluding another dispatcher's fully assigned truck", async role => {
  mocks.role = role;
  mocks.assignmentFixtures = true;
  mount();
  await screen.findByText("1–4 of 4 trucks");
  for (const unit of ["OWN", "NO-DISPATCHER", "NO-DRIVER", "NEITHER"]) {
    expect(screen.getByRole("link", { name: `Open service log for truck ${unit}` })).toBeInTheDocument();
  }
  expect(screen.queryByRole("link", { name: "Open service log for truck OTHER" })).not.toBeInTheDocument();
});

it.each([
  ["Missing dispatcher or driver", ["NO-DISPATCHER", "NO-DRIVER", "NEITHER"]],
  ["No dispatcher", ["NO-DISPATCHER", "NEITHER"]],
  ["No driver", ["NO-DRIVER", "NEITHER"]],
])("filters trucks by %s and restores the selection", async (option, units) => {
  mocks.assignmentFixtures = true;
  const first = mount();
  await screen.findByText("1–5 of 5 trucks");
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Truck assignment" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Open service log/ })).toHaveLength(units.length));
  for (const unit of units) expect(screen.getByRole("link", { name: `Open service log for truck ${unit}` })).toBeInTheDocument();
  first.unmount();
  mount();
  await screen.findByText(`1–${units.length} of ${units.length} trucks`);
  expect(screen.getByRole("combobox", { name: "Truck assignment" })).toHaveTextContent(option);
});
