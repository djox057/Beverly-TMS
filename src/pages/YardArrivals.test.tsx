import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import YardArrivals from "./YardArrivals";

const state = vi.hoisted(() => ({
  originalDriverId: null as string | null,
  needsRecovery: false,
  writes: [] as { table: string; operation: string; values?: any }[],
  noteFilters: [] as unknown[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ hasRole: () => true, profile: {} }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ data: [] }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/EditDriverDialog", () => ({ EditDriverDialog: () => null }));
vi.mock("@/components/CompletedDriversDialog", () => ({ CompletedDriversDialog: () => null }));
vi.mock("@/components/yard/AddYardArrivalDialog", () => ({ AddYardArrivalDialog: () => null }));
vi.mock("@/components/yard/YardActionComments", () => ({ YardActionComments: () => null }));
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ onDateChange }: any) => <button onClick={() => onDateChange(new Date("2026-11-16T12:00:00Z"))}>Choose date</button>,
}));
vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ options, onValueChange }: any) => <select aria-label="Recovery driver" onChange={e => onValueChange(e.target.value)}>
    <option value="">Select</option>{options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    let single = false;
    const chain: any = {};
    for (const method of ["select", "order", "not", "in", "ilike", "eq", "maybeSingle", "upsert", "update", "delete"]) {
      chain[method] = (...args: any[]) => {
        if (method === "maybeSingle") single = true;
        if (table === "lost_day_notes" && method === "eq") state.noteFilters.push(args[1]);
        if (["upsert", "update", "delete"].includes(method)) state.writes.push({ table, operation: method, values: args[0] });
        return chain;
      };
    }
    chain.then = (resolve: any) => resolve({ error: null, data:
      table === "driver_yard_actions" ? [{
        id: "arrival", driver_id: null, truck_number: "8760", action_type: "recovery",
        comment: "Towed to yard", created_at: "2026-11-16T12:00:00Z", arrival_datetime: "2026-11-16T12:00:00",
      }] : table === "trucks" ? (single ? {
        id: "truck", truck_number: "8760", driver1_id: null, left_by_driver_id: state.originalDriverId, needs_recovery: state.needsRecovery,
      } : [{ truck_number: "8760" }]) : []
    });
    // Recovery-driver list only; other driver queries return no rows.
    chain.eq = (column: string, value: any) => {
      if (table === "lost_day_notes") state.noteFilters.push(value);
      if (table === "drivers" && column === "is_recovery") {
        chain.then = (resolve: any) => resolve({ error: null, data: [{ id: "recovery-driver", name: "Recovery Driver" }] });
      }
      return chain;
    };
    return chain;
  } },
}));

afterEach(() => { cleanup(); state.originalDriverId = null; state.needsRecovery = false; state.writes = []; state.noteFilters = []; });

async function openStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><YardArrivals /></QueryClientProvider>);
  const button = await screen.findByTitle("Set Game Over / Recovery Status");
  expect(button).toBeEnabled();
  fireEvent.click(button);
}

async function fillStatus() {
  await screen.findByText("Set Driver Status - 8760");
  fireEvent.click(screen.getByText("Choose date"));
  fireEvent.change(screen.getByPlaceholderText("Enter note for this status..."), { target: { value: "Towed to yard" } });
}

it("marks a truck-only recovery without creating null-driver notes", async () => {
  await openStatus();
  await fillStatus();
  fireEvent.click(screen.getByRole("button", { name: "Set Status" }));
  await screen.findByText("Assign Recovery Driver - 8760");
  expect(state.writes).toContainEqual({ table: "trucks", operation: "update", values: { needs_recovery: true, left_by_driver_id: null } });
  expect(state.writes.some(w => w.table === "lost_day_notes")).toBe(false);
  expect(state.noteFilters).toEqual([]);
});

it("can set status and assign a recovery driver to a truck-only arrival", async () => {
  await openStatus();
  await fillStatus();
  fireEvent.change(screen.getAllByLabelText("Recovery driver").at(-1)!, { target: { value: "recovery-driver" } });
  fireEvent.click(screen.getByRole("button", { name: "Set Status" }));
  await waitFor(() => expect(state.writes).toContainEqual({
    table: "trucks", operation: "update", values: { needs_recovery: true, left_by_driver_id: null, driver1_id: "recovery-driver" },
  }));
  expect(state.writes.some(w => w.table === "lost_day_notes")).toBe(false);
});

it("preserves the remembered original driver and their game-over notes", async () => {
  state.originalDriverId = "original-driver";
  await openStatus();
  await fillStatus();
  fireEvent.click(screen.getByRole("button", { name: "Set Status" }));
  await screen.findByText("Assign Recovery Driver - 8760");
  expect(state.writes).toContainEqual({
    table: "lost_day_notes", operation: "upsert", values: {
      driver_id: "original-driver", date: "2026-11-16", note: "game over - yard: Towed to yard", note_type: "game_over",
    },
  });
});

it("removes truck-only recovery status without deleting driver notes", async () => {
  state.needsRecovery = true;
  await openStatus();
  fireEvent.click(await screen.findByRole("button", { name: "Remove Status" }));
  await waitFor(() => expect(state.writes).toContainEqual({ table: "trucks", operation: "update", values: { needs_recovery: false, left_by_driver_id: null } }));
  expect(state.writes.some(w => w.table === "lost_day_notes")).toBe(false);
});
