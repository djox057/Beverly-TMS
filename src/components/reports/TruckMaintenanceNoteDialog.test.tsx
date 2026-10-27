import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TruckMaintenanceNoteDialog } from "./TruckMaintenanceNoteDialog";

const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), read: vi.fn(), refresh: undefined as undefined | (() => void), unsubscribe: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: (refresh: () => void) => {
  api.refresh = refresh;
  return { on: () => ({ subscribe: () => ({ unsubscribe: api.unsubscribe }) }) };
} }));
const target = { truckId: "truck-1", truckNumber: "5873", details: "Oil Change: 687 mi overdue; Maintenance Check: overdue", canEdit: true };
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  api.from.mockReturnValue({ select: () => ({ eq: () => ({ single: api.read }) }) });
  api.read.mockResolvedValue({ data: { oil_change_note: "Service booked Friday" }, error: null });
  api.rpc.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); client.clear(); });
function mount(canEdit = true, onClose = vi.fn()) {
  const view = render(<QueryClientProvider client={client}><TruckMaintenanceNoteDialog target={{ ...target, canEdit }} onClose={onClose} /></QueryClientProvider>);
  return { ...view, onClose };
}
it("loads the existing Live Oil Change note and saves it through the dispatcher RPC", async () => {
  client.setQueryData(["live-oil-change-trucks"], [{ id: "truck-1", oil_change_note: "Old" }, { id: "truck-2", oil_change_note: "Other" }]);
  const { onClose } = mount();
  const input = await screen.findByRole("textbox", { name: "Live Oil Change Note" });
  await waitFor(() => expect(input).toHaveValue("Service booked Friday"));
  fireEvent.change(input, { target: { value: "  Driver returning to yard Saturday\nPM confirmed  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(api.rpc).toHaveBeenCalledWith("dispatcher_update_truck_oil_change_note", { _truck_id: "truck-1", _note: "Driver returning to yard Saturday\nPM confirmed" });
  expect(client.getQueryData(["live-oil-change-trucks"])).toEqual([{ id: "truck-1", oil_change_note: "Driver returning to yard Saturday\nPM confirmed" }, { id: "truck-2", oil_change_note: "Other" }]);
  expect(client.getQueryData(["truck-maintenance-note", "truck-1"])).toEqual({ oil_change_note: "Driver returning to yard Saturday\nPM confirmed" });
});
it("discards canceled edits and reloads notes changed in Live Oil Change when reopened", async () => {
  const view = mount();
  const input = await screen.findByRole("textbox");
  fireEvent.change(input, { target: { value: "Discard this" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(api.rpc).not.toHaveBeenCalled();
  view.unmount();
  expect(api.unsubscribe).toHaveBeenCalled();
  api.read.mockResolvedValue({ data: { oil_change_note: "Updated from Live Oil Change" }, error: null });
  mount();
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("Updated from Live Oil Change"));
});
it("keeps a dispatcher draft on permission errors and allows retry", async () => {
  api.rpc.mockResolvedValueOnce({ error: new Error("Truck is not assigned to your driver") });
  const { onClose } = mount();
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Pending appointment" } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Truck is not assigned to your driver");
  expect(screen.getByRole("textbox")).toHaveValue("Pending appointment");
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
it("shows the shared note without editing for read-only users", async () => {
  mount(false);
  expect(await screen.findByRole("textbox")).toHaveAttribute("readonly");
  expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();
  expect(api.rpc).not.toHaveBeenCalled();
});
it("blocks saves after a failed load and supports retry", async () => {
  api.read.mockResolvedValueOnce({ data: null, error: new Error("Connection unavailable") });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection unavailable");
  expect(screen.getByRole("button", { name: "Save note" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("Service booked Friday"));
});
it("refreshes the shared note while open without replacing an unsaved draft", async () => {
  mount();
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("Service booked Friday"));
  api.read.mockResolvedValue({ data: { oil_change_note: "New shared note" }, error: null });
  api.refresh?.();
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("New shared note"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "My draft" } });
  api.read.mockResolvedValue({ data: { oil_change_note: "Another remote change" }, error: null });
  api.refresh?.();
  await waitFor(() => expect(client.getQueryData(["truck-maintenance-note", "truck-1"])).toEqual({ oil_change_note: "Another remote change" }));
  expect(screen.getByRole("textbox")).toHaveValue("My draft");
});
