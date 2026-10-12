import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TruckServiceLog from "./TruckServiceLog";

const mocks = vi.hoisted(() => ({ role: "maintenance", searchTrucks: [] as Array<{ id: string; truck_number: string; is_active: boolean; dispatcher_id: string | null; driver1_id: string | null }>, history: [] as Array<{ id: string; field: string; new_value: number; changed_at: string; changed_by: string }>, insert: vi.fn(), update: vi.fn(), truck: {
  id: "truck1", truck_number: "157", source: "BF TRUCK", make: "Freightliner", model: "Cascadia", year: 2026,
  vin: "VIN157", engine: "DD15", is_active: true, miles: 168624, miles_updated_at: "2026-09-30T12:00:00Z",
  last_oil_change_miles: 148108, oil_change_date: "2026-07-30", air_filter: null, last_oc_invoice: "INV-3338",
  oil_change_note: null, samsara_account: null, dispatcher_id: "user1", driver1_id: null,
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ getPrimaryRole: () => mocks.role, user: { id: "user1" } }) }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: () => { const channel = { on: () => channel, subscribe: () => channel, unsubscribe: vi.fn() }; return channel; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let selectedId = "truck1";
  const query = {
    select: () => query, eq: (column: string, value: string) => { if (column === "id") selectedId = value; return query; }, order: () => query, in: () => Promise.resolve({ data: [{ user_id: "user1", full_name: "Jane Maintenance" }], error: null }),
    single: async () => ({ data: selectedId === "truck1" ? mocks.truck : { ...mocks.truck, ...mocks.searchTrucks.find(truck => truck.id === selectedId) }, error: null }),
    range: async () => ({ data: table === "trucks" ? mocks.searchTrucks : table === "drivers" ? [{ id: "driver1" }] : table === "truck_mileage_history" ? mocks.history : [], error: null }),
    insert: (payload: unknown) => { mocks.insert(table, payload); return { select: async () => ({ data: [{ id: "entry1" }], error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }; },
    update: (payload: unknown) => { mocks.update(table, payload); return { eq: () => ({ select: async () => ({ data: [{ id: "truck1" }], error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }) }; },
  }; return query;
} } }));
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/live-oil-change/truck1"]}><Routes><Route path="/live-oil-change/:truckId" element={<TruckServiceLog />} /></Routes></MemoryRouter></QueryClientProvider>);

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { mocks.searchTrucks = [
  { id: "truck1", truck_number: "157", is_active: true, dispatcher_id: "user1", driver1_id: null },
  { id: "truck2", truck_number: "0984", is_active: true, dispatcher_id: "other", driver1_id: null },
  { id: "truck3", truck_number: "460", is_active: false, dispatcher_id: null, driver1_id: "driver1" },
  { id: "truck4", truck_number: "555", is_active: true, dispatcher_id: "other", driver1_id: "driver1" },
]; mocks.role = "maintenance"; mocks.history = []; mocks.insert.mockClear(); mocks.update.mockClear(); });
afterEach(cleanup);
describe("truck service log page", () => {
  it("searches a unit with leading zeros and opens its oil change page", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Type truck number…"), { target: { value: "0984" } });
    expect(screen.queryByRole("option", { name: /Truck 157/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: /Truck 0984/ }));
    expect(await screen.findByRole("heading", { name: /TRUCK 0984/ })).toBeInTheDocument();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["dispatch", "supervisor"])("scopes %s search to assigned trucks including driver fallback", async role => {
    mocks.role = role;
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /Truck 460 \(inactive\)/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Truck 157/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Truck 0984/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Truck 555/ })).not.toBeInTheDocument();
  });
  it("shows an empty result for an unknown unit", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Type truck number…"), { target: { value: "nonexistent" } });
    expect(await screen.findByText("No options found.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /TRUCK 157/ })).toBeInTheDocument();
  });
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
  it("adds a row directly from a blank odometer cell and records its creator", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    const label = "New row 1 odometer";
    fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
    fireEvent.change(screen.getByLabelText(label), { target: { value: "0" } });
    fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
    expect(mocks.insert.mock.calls[0]).toEqual(["truck_service_log_entries", expect.objectContaining({ truck_id: "truck1", source_key: null, odometer: 0, entry_type: "Mileage Check", created_by: "user1" })]);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps partial blank-row details until the odometer is entered", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    for (const [key, value] of [["notes", "Verified by photo"], ["odometer", "170000"]]) {
      const label = `New row 1 ${key}`;
      fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });
      await waitFor(() => expect(screen.queryByLabelText(label)).not.toBeInTheDocument());
      if (key === "notes") expect(mocks.insert).not.toHaveBeenCalled();
    }
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert.mock.calls[0][1]).toMatchObject({ odometer: 170000, notes: "Verified by photo", created_by: "user1" });
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
