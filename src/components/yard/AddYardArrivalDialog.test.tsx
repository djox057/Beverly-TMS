import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddYardArrivalDialog } from "./AddYardArrivalDialog";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn(), close: vi.fn(), trucks: [
  { id: "unassigned", truck_number: "123", driver1_id: null, driver2_id: null, driver: null },
  { id: "assigned", truck_number: "456", driver1_id: "d1", driver2_id: null, driver: { name: "Jane Driver" } },
] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: () => ({ select: () => ({ order: async () => ({ data: mocks.trucks, error: null }) }) }) } }));
vi.mock("@/components/ui/combobox", () => ({ Combobox: ({ options, value, onValueChange }: { options: Array<{ value: string; label: string }>; value: string; onValueChange: (v: string) => void }) => <select aria-label="Truck" value={value} onChange={e => onValueChange(e.target.value)}><option value="">Select truck</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: "arrival1", error: null }); });
afterEach(cleanup);
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AddYardArrivalDialog open onOpenChange={mocks.close} /></QueryClientProvider>);
it("lists unassigned trucks and saves the arrival without requiring a driver", async () => {
  mount(); await screen.findByRole("option", { name: "123 — No driver assigned" });
  fireEvent.change(screen.getByLabelText("Truck"), { target: { value: "unassigned" } });
  fireEvent.change(screen.getByLabelText("Arrival date and time (Chicago)"), { target: { value: "2026-10-16T10:30" } });
  fireEvent.change(screen.getByLabelText("Reason / note"), { target: { value: "Inspect tires" } });
  fireEvent.click(screen.getByRole("button", { name: "Add yard arrival" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("add_truck_yard_arrival", { p_truck_id: "unassigned", p_arrival_datetime: "2026-10-16T10:30:00+00:00", p_action_type: "maintenance", p_comment: "Inspect tires" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(false));
});
it("shows the assigned driver and keeps entered details if saving fails", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
  mount(); await screen.findByRole("option", { name: "456 — Jane Driver" });
  fireEvent.change(screen.getByLabelText("Truck"), { target: { value: "assigned" } });
  expect(screen.getByText("Driver: Jane Driver")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add yard arrival" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not add yard arrival", description: "Permission denied" })));
  expect(mocks.close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Truck")).toHaveValue("assigned");
});
