import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TruckServiceLog from "./TruckServiceLog";

const mocks = vi.hoisted(() => ({ role: "maintenance", history: [] as Array<{ id: string; field: string; new_value: number; changed_at: string; changed_by: string }>, insert: vi.fn(), update: vi.fn(), truck: {
  id: "truck1", truck_number: "157", source: "BF TRUCK", make: "Freightliner", model: "Cascadia", year: 2026,
  vin: "VIN157", engine: "DD15", is_active: true, miles: 168624, miles_updated_at: "2026-09-30T12:00:00Z",
  last_oil_change_miles: 148108, oil_change_date: "2026-07-30", air_filter: null, last_oc_invoice: "INV-3338",
  oil_change_note: null, samsara_account: null, dispatcher_id: "user1", driver1_id: null,
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ getPrimaryRole: () => mocks.role, user: { id: "user1" } }) }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: () => { const channel = { on: () => channel, subscribe: () => channel, unsubscribe: vi.fn() }; return channel; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const query = {
    select: () => query, eq: () => query, order: () => query, in: () => Promise.resolve({ data: [{ user_id: "user1", full_name: "Jane Maintenance" }], error: null }),
    single: async () => ({ data: mocks.truck, error: null }),
    range: async () => ({ data: table === "truck_mileage_history" ? mocks.history : [], error: null }),
    insert: (payload: unknown) => { mocks.insert(table, payload); return { select: async () => ({ data: [{ id: "entry1" }], error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }; },
    update: (payload: unknown) => { mocks.update(table, payload); return { eq: () => ({ select: async () => ({ data: [{ id: "truck1" }], error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }) }; },
  }; return query;
} } }));
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/live-oil-change/truck1"]}><Routes><Route path="/live-oil-change/:truckId" element={<TruckServiceLog />} /></Routes></MemoryRouter></QueryClientProvider>);

beforeEach(() => { mocks.role = "maintenance"; mocks.history = []; mocks.insert.mockClear(); mocks.update.mockClear(); });
afterEach(cleanup);
describe("truck service log page", () => {
  it("renders live readings in the spreadsheet layout and leaves missing fields blank", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: /TRUCK 157/ })).toBeInTheDocument();
    expect(screen.getByText("168,624 mi")).toBeInTheDocument();
    expect(screen.getByText("20,516 mi")).toBeInTheDocument();
    expect(screen.getByText("178,108 mi")).toBeInTheDocument();
    expect(screen.getByText("INV-3338")).toBeInTheDocument();
    expect(screen.getByText("30,000 mi / 90 Days")).toBeInTheDocument();
  });
  it("saves additional mileage details only into the new log", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("button", { name: "Edit Mileage Check 9/30/2026" }));
    expect(screen.getByLabelText("Total odometer")).not.toBeDisabled();
    expect(screen.getByLabelText("Log date")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("Notes / telematics"), { target: { value: "Photo verified" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
    expect(mocks.insert.mock.calls[0][0]).toBe("truck_service_log_entries");
    expect(mocks.insert.mock.calls[0][1]).toMatchObject({ truck_id: "truck1", entry_type: "Mileage Check", odometer: 168624, notes: "Photo verified" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("edits a linked odometer inline without updating live truck readings", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    const label = "odometer live:mileage:2026-09-30T12:00:00Z:168624";
    fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
    fireEvent.change(screen.getByLabelText(label), { target: { value: "169000" } });
    fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
    expect(mocks.insert.mock.calls[0]).toEqual(["truck_service_log_entries", expect.objectContaining({ odometer: 169000 })]);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("saves the baseline odometer into start_miles and Escape cancels", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("button", { name: "Edit Baseline Odometer" }));
    fireEvent.change(screen.getByLabelText("Baseline Odometer"), { target: { value: "0" } });
    fireEvent.keyDown(screen.getByLabelText("Baseline Odometer"), { key: "Enter" });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("trucks", { start_miles: 0, baseline_created_by: "user1" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Oil Specification" }));
    fireEvent.change(screen.getByLabelText("Oil Specification"), { target: { value: "15W40" } });
    fireEvent.keyDown(screen.getByLabelText("Oil Specification"), { key: "Escape" });
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it("shows the original author and removes the imported-row comment", async () => {
    mocks.history = [{ id: "h1", field: "miles", new_value: 168624, changed_at: "2026-09-30T12:00:00Z", changed_by: "user1" }];
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    expect(screen.getByText("Added By")).toBeInTheDocument();
    expect(screen.getByText("Jane Maintenance")).toBeInTheDocument();
    expect(screen.getAllByText("Live Oil Change")).toHaveLength(1); // navigation link only
  });
  it("saves baseline date, note and oil specification into separate truck fields", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    for (const [label, value, key] of [["Baseline Start", "2026-07-01", "baseline_start_date"], ["Baseline Note", "Starting service record", "baseline_note"], ["Oil Specification", "15W40", "oil_spec"]]) {
      fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.blur(screen.getByLabelText(label));
      await waitFor(() => expect(screen.queryByLabelText(label)).not.toBeInTheDocument());
      expect(mocks.update).toHaveBeenCalledWith("trucks", expect.objectContaining({ [key]: value }));
    }
  });
  it("rejects negative odometers and hides truck metadata editing from dispatchers", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("button", { name: "Edit Baseline Odometer" }));
    fireEvent.change(screen.getByLabelText("Baseline Odometer"), { target: { value: "-1" } });
    fireEvent.keyDown(screen.getByLabelText("Baseline Odometer"), { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("non-negative");
    expect(mocks.update).not.toHaveBeenCalled();
    cleanup(); mocks.role = "dispatch"; mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    expect(screen.queryByRole("button", { name: "Edit Baseline Odometer" })).not.toBeInTheDocument();
  });
  it("limits dispatchers to mileage entries and rejects another dispatcher's truck", async () => {
    mocks.role = "dispatch"; mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("button", { name: "Add log entry" }));
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: "Mileage Check" })).toBeInTheDocument();
    cleanup();
    const old = mocks.truck.dispatcher_id; mocks.truck.dispatcher_id = "someone-else";
    mount(); expect(await screen.findByRole("alert")).toHaveTextContent("not assigned to you");
    mocks.truck.dispatcher_id = old;
  });
});
