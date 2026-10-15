import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ServiceEntry } from "@/lib/truckServiceLog";
import TruckServiceLog from "./TruckServiceLog";

const mocks = vi.hoisted(() => ({ role: "maintenance", toast: vi.fn(), bulkIds: [] as string[], saved: [] as ServiceEntry[], searchTrucks: [] as Array<{ id: string; truck_number: string; is_active: boolean; dispatcher_id: string | null; driver1_id: string | null }>, history: [] as Array<{ id: string; field: string; new_value: number; changed_at: string; changed_by: string }>, insert: vi.fn(), update: vi.fn(), truck: {
  id: "truck1", truck_number: "157", source: "BF TRUCK", make: "Freightliner", model: "Cascadia", year: 2026,
  vin: "VIN157", engine: "DD15", is_active: true, miles: 168624, miles_updated_at: "2026-09-30T12:00:00Z",
  last_oil_change_miles: 148108, oil_change_date: "2026-07-30", air_filter: null, last_oc_invoice: "INV-3338",
  oil_change_note: null, samsara_account: null, dispatcher_id: "user1", driver1_id: null,
} }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ getPrimaryRole: () => mocks.role, user: { id: "user1" } }) }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: () => { const channel = { on: () => channel, subscribe: () => channel, unsubscribe: vi.fn() }; return channel; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let selectedId = "truck1";
  const query = {
    select: () => query, eq: (column: string, value: string) => { if (column === "id") selectedId = value; return query; }, order: () => query, in: () => table === "drivers" ? query : Promise.resolve({ data: [{ user_id: "user1", full_name: "Jane Maintenance" }], error: null }),
    single: async () => ({ data: selectedId === "truck1" ? mocks.truck : { ...mocks.truck, ...mocks.searchTrucks.find(truck => truck.id === selectedId) }, error: null }),
    range: async () => ({ data: table === "trucks" ? mocks.searchTrucks : table === "drivers" ? [{ id: "driver1", first_name: "Jane", last_name: "Driver", dispatcher_id: "user1" }, { id: "driver2", first_name: "Adil", last_name: "El Filali", dispatcher_id: "other" }] : table === "truck_mileage_history" ? mocks.history : table === "truck_service_log_entries" ? mocks.saved : [], error: null }),
    insert: (payload: unknown) => { mocks.insert(table, payload); if (table === "truck_service_log_entries" && (payload as ServiceEntry).is_deleted) mocks.saved.push({ ...payload as ServiceEntry, id: "entry1", created_at: "2026-10-12T12:00:00Z" }); return { select: async () => ({ data: [{ id: "entry1" }], error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }; },
    update: (payload: unknown) => { mocks.update(table, payload); return { eq: () => { const result = { in: (_key: string, ids: string[]) => { mocks.bulkIds = ids; return result; }, select: async () => ({ data: [{ id: "truck1" }], error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }; return result; } }; },
  }; return query;
} } }));
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/live-oil-change/truck1"]}><Routes><Route path="/live-oil-change/:truckId" element={<TruckServiceLog />} /></Routes></MemoryRouter></QueryClientProvider>);

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { mocks.searchTrucks = [
  { id: "truck1", truck_number: "157", is_active: true, dispatcher_id: "user1", driver1_id: null },
  { id: "truck2", truck_number: "0984", is_active: true, dispatcher_id: "other", driver1_id: "driver2" },
  { id: "truck3", truck_number: "460", is_active: false, dispatcher_id: null, driver1_id: "driver1" },
  { id: "truck4", truck_number: "555", is_active: true, dispatcher_id: "other", driver1_id: "driver1" },
]; mocks.role = "maintenance"; mocks.history = []; mocks.saved = []; mocks.insert.mockClear(); mocks.update.mockClear(); mocks.toast.mockClear(); mocks.bulkIds = []; });
afterEach(cleanup);
describe("truck service log page", () => {
  it("navigates to adjacent trucks and disables the first/last boundaries", async () => {
    mocks.searchTrucks = mocks.searchTrucks.slice(0, 2);
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next truck" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Previous truck" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next truck" }));
    await screen.findByRole("heading", { name: /TRUCK 0984/ });
    expect(screen.getByRole("button", { name: "Next truck" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous truck" }));
    await screen.findByRole("heading", { name: /TRUCK 157/ });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("previous/next navigation stays within the dispatcher's assigned trucks", async () => {
    mocks.role = "dispatch";
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next truck" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next truck" }));
    await screen.findByRole("heading", { name: /TRUCK 460/ });
    expect(screen.getByRole("button", { name: "Next truck" })).toBeDisabled();
  });
  it("searches a unit with leading zeros and opens its oil change page", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Type truck number…"), { target: { value: "0984" } });
    expect(screen.queryByRole("option", { name: /157 - No driver/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: /0984 - Adil El Filali/ }));
    expect(await screen.findByRole("heading", { name: /TRUCK 0984/ })).toBeInTheDocument();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["dispatch", "supervisor"])("scopes %s search to assigned trucks including driver fallback", async role => {
    mocks.role = role;
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /460 - Jane Driver \(inactive\)/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /157 - No driver/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /0984 - Adil El Filali/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /555 - Jane Driver/ })).not.toBeInTheDocument();
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
    expect(screen.getByText("30,000 mi")).toBeInTheDocument();
    expect(screen.queryByText(/days overdue|days remaining|Target date:/)).not.toBeInTheDocument();
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
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("trucks", expect.objectContaining({ start_miles: 0, baseline_created_by: "user1" })));
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
  it("pins the editable baseline first while retaining its mileage calculation", async () => {
    const original = { ...mocks.truck };
    Object.assign(mocks.truck, { start_miles: 140000, baseline_start_date: "2026-07-01", baseline_note: "Starting baseline", last_oil_change_miles: null, oil_change_date: null });
    try {
      mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
      expect(screen.getByText("Baseline Start", { selector: "[data-type]" }).closest("tr")).toBe(screen.getAllByRole("row")[1]);
      expect(screen.queryByRole("button", { name: /^Delete Baseline Start/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit Baseline Odometer" })).toHaveTextContent("140,000");
      expect(screen.getAllByText("28,624").length).toBeGreaterThan(0);
      expect(mocks.insert).not.toHaveBeenCalled();
    } finally {
      Object.assign(mocks.truck, { start_miles: null, baseline_start_date: null, baseline_note: null }, original);
    }
  });
  it.each(["maintenance", "manager", "admin"])("saves truck year, make, model and engine directly for %s", async role => {
    mocks.role = role;
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    for (const [label, value, key, parsed] of [["Model Year", "2025", "year", 2025], ["Make", "Volvo", "make", "Volvo"], ["Model", "VNL 860", "model", "VNL 860"], ["Engine Type", "D13", "engine", "D13"]] as const) {
      fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });
      await waitFor(() => expect(screen.queryByLabelText(label)).not.toBeInTheDocument());
      expect(mocks.update).toHaveBeenCalledWith("trucks", { [key]: parsed });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each(["dispatch", "supervisor", "chicago_management", "recruiting"])("does not expose specification editing to %s", async role => {
    mocks.role = role;
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    for (const label of ["Model Year", "Make", "Model", "Engine Type"]) expect(screen.queryByRole("button", { name: `Edit ${label}` })).not.toBeInTheDocument();
  });
  it("pastes a complete spreadsheet row into an empty cell as a normal authored entry", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.paste(screen.getByRole("button", { name: "Edit New row 1 log_date" }), { clipboardData: { getData: () => "11/18/2024\tOil Change\t103,953\t0\t133,953\t\tDealer / TA Petro\t" } });
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
    expect(mocks.insert).toHaveBeenCalledWith("truck_service_log_entries", expect.objectContaining({ truck_id: "truck1", source_key: null, created_by: "user1", log_date: "2024-11-18", entry_type: "Oil Change", odometer: 103953, oil_spec: null, facility: "Dealer / TA Petro", invoice: null }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("saves multiple pasted rows in one atomic insert with the current author", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    const block = "4/18/2024\tMileage Check\t16,434\t16,434\t\t\t\t\n7/15/2024\tOil Change\t52,413\t0\t82,413\t\tDealer / TA Petro\t";
    fireEvent.paste(screen.getByRole("button", { name: "Edit New row 1 log_date" }), { clipboardData: { getData: () => block } });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "2 spreadsheet rows added" }));
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledWith("truck_service_log_entries", [
      expect.objectContaining({ log_date: "2024-04-18", entry_type: "Mileage Check", odometer: 16434, created_by: "user1" }),
      expect.objectContaining({ log_date: "2024-07-15", entry_type: "Oil Change", odometer: 52413, facility: "Dealer / TA Petro", created_by: "user1" }),
    ]);
  });
  it("does not insert a valid first row when a later pasted row is invalid", async () => {
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    const row = "4/18/2024\tMileage Check\t16,434\t0\t\t\t\t";
    fireEvent.paste(screen.getByRole("button", { name: "Edit New row 1 log_date" }), { clipboardData: { getData: () => `${row}\n${row.replace("16,434", "invalid")}` } });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not paste row", description: expect.stringContaining("Row 2:") })));
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects pasted oil service for dispatchers without saving anything", async () => {
    mocks.role = "dispatch";
    mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
    fireEvent.paste(screen.getByRole("button", { name: "Edit New row 1 log_date" }), { clipboardData: { getData: () => "11/18/2024\tOil Change\t103,953\t0\t133,953\t\tShop\t" } });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not paste row", variant: "destructive" })));
    expect(mocks.insert).not.toHaveBeenCalled();
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

it("requires confirmation and persistently deletes a generated row without modifying live mileage", async () => {
  mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
  fireEvent.click(screen.getByRole("button", { name: "Delete Mileage Check 9/30/2026" }));
  expect(mocks.insert).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.insert).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete Mileage Check 9/30/2026" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Delete Mileage Check 9/30/2026" })).not.toBeInTheDocument());
  expect(mocks.insert).toHaveBeenCalledWith("truck_service_log_entries", expect.objectContaining({ truck_id: "truck1", source_key: "live:mileage:2026-09-30T12:00:00Z:168624", is_deleted: true }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByText("168,624 mi")).toBeInTheDocument();
});
it("limits dispatcher deletion to mileage entries and hides deletion for read-only users", async () => {
  mocks.role = "dispatch";
  mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
  expect(screen.getByRole("button", { name: "Delete Mileage Check 9/30/2026" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete Oil Change 7/30/2026" })).not.toBeInTheDocument();
  cleanup(); mocks.role = "safety";
  mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
  expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
});

it("deletes a saved/imported log row by updating its own record", async () => {
  mocks.saved = [{ id: "saved1", source_key: "xlsx:pilot:row1", log_date: "2026-09-01", entry_type: "Mileage Check", odometer: 160000, oil_spec: null, facility: null, invoice: null, notes: null, created_at: "2026-09-01T12:00:00Z", created_by: "user1" }];
  mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
  fireEvent.click(screen.getByRole("button", { name: "Delete Mileage Check 9/1/2026" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("truck_service_log_entries", { is_deleted: true }));
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("edits the protected first baseline and preserves its other imported values", async () => {
  mocks.saved = [{ id: "base1", source_key: "xlsx:baseline1", log_date: "2024-01-01", entry_type: "Baseline Start", odometer: 100000, oil_spec: null, facility: null, invoice: null, notes: "Original baseline", created_at: "2026-10-01T12:00:00Z", created_by: "user1" }];
  mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
  const first = screen.getAllByRole("row")[1];
  expect(first).toHaveTextContent("Baseline Start");
  expect(first).toHaveTextContent("100,000");
  expect(screen.queryByRole("button", { name: /^Delete Baseline Start/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit odometer truck:baseline" }));
  fireEvent.change(screen.getByLabelText("odometer truck:baseline"), { target: { value: "105000" } });
  fireEvent.keyDown(screen.getByLabelText("odometer truck:baseline"), { key: "Enter" });
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("trucks", expect.objectContaining({ start_miles: 105000, baseline_start_date: "2024-01-01", baseline_note: "Original baseline" })));
});
it("confirms bulk deletion and handles saved and generated rows while preserving the baseline", async () => {
  mocks.saved = [{ id: "bulkbase", source_key: "xlsx:bulkbase", log_date: "2024-01-01", entry_type: "Baseline Start", odometer: 100000, oil_spec: null, facility: null, invoice: null, notes: "Keep baseline", created_at: "2026-10-01T12:00:00Z", created_by: "user1" }];
  mocks.saved.push({ ...mocks.saved[0], id: "saved-mileage", source_key: "xlsx:saved-mileage", entry_type: "Mileage Check", odometer: 110000 });
  mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
  fireEvent.click(screen.getByRole("button", { name: "Delete all rows" }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("baseline values");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete all rows" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete all rows" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "All service log rows deleted" }));
  expect(mocks.update).not.toHaveBeenCalledWith("trucks", expect.anything());
  expect(mocks.bulkIds).toEqual(["saved-mileage"]);
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Baseline Start");
  expect(mocks.update).toHaveBeenCalledWith("truck_service_log_entries", { is_deleted: true });
  expect(mocks.insert).toHaveBeenCalledWith("truck_service_log_entries", expect.arrayContaining([expect.objectContaining({ entry_type: "Oil Change", is_deleted: true }), expect.objectContaining({ entry_type: "Mileage Check", is_deleted: true })]));
  expect(mocks.update).not.toHaveBeenCalledWith("trucks", expect.objectContaining({ miles: expect.anything() }));
});
it.each(["dispatch", "supervisor", "safety"])("does not offer delete all rows to %s", async role => {
  mocks.role = role;
  mount(); await screen.findByRole("heading", { name: /TRUCK 157/ });
  expect(screen.queryByRole("button", { name: "Delete all rows" })).not.toBeInTheDocument();
});
