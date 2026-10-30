import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { filterMileageUpdateTrucks } from "@/lib/mileageUpdatePeriod";
import { useMileageUpdateSummary } from "@/hooks/useMileageUpdateSummary";
import { MileageUpdateSummary } from "./MileageUpdateSummary";

const db = vi.hoisted(() => ({ calls: [] as { method: string; args: unknown[] }[], fail: false, large: false, oil: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    db.calls.push({ method: "from", args: [table] });
    const chain: Record<string, (...args: unknown[]) => unknown> = Object.fromEntries(["select", "eq", "in", "not", "gte", "lt", "lte", "order"].map((method) => [method, (...args: unknown[]) => {
      db.calls.push({ method, args }); return chain;
    }]));
    chain.range = async (...args: unknown[]) => {
      const [start, end] = args as number[];
      db.calls.push({ method: "range", args: [start, end] });
      if (db.fail) return { data: null, error: new Error("History unavailable") };
      if (table === "truck_service_log_entries") return { data: db.oil ? [{ truck_id: "a", created_by: "person1" }, { truck_id: "b", created_by: "person2" }] : [], error: null };
      const data = db.large && start === 0 ? Array.from({ length: 1000 }, () => ({ truck_id: "a", changed_by: "person1" }))
        : [{ truck_id: "b", changed_by: "person2" }, { truck_id: "hidden", changed_by: "person3" }];
      return { data, error: null };
    };
    return chain;
  } },
}));

function SummaryHarness({ trucks }: { trucks: { id: string; driver1_id: string | null }[] }) {
  const summary = useMileageUpdateSummary();
  const visible = filterMileageUpdateTrucks(trucks, summary.edits, summary.view, summary.scope);
  return <><MileageUpdateSummary summary={summary} trucks={trucks} trucksLoading={false} trucksError={false} />
    <ul aria-label="Visible trucks">{visible.map((truck) => <li key={truck.id}>{truck.id}</li>)}</ul></>;

}
function show(trucks = [{ id: "a", driver1_id: "driver-a" }, { id: "b", driver1_id: "driver-b" }, { id: "c", driver1_id: "driver-c" }]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SummaryHarness trucks={trucks} /></QueryClientProvider>);
}
beforeEach(() => { localStorage.clear(); db.calls = []; db.fail = false; db.large = false; db.oil = false; });
afterEach(cleanup);

it("uses history and filters out people from hidden trucks", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All trucks updated 1 / 3"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 1");
  expect(db.calls).toContainEqual({ method: "in", args: ["field", ["miles", "last_oil_change_miles"]] });
  expect(db.calls).toContainEqual({ method: "not", args: ["new_value", "is", null] });
});

it("fetches beyond the first 1000 history entries", async () => {
  db.large = true;
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All trucks updated 2 / 3"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 2");
  expect(db.calls).toContainEqual({ method: "range", args: [1000, 1999] });
});

it("applies presets in another month and allows an inclusive custom period", async () => {
  show();
  fireEvent.click(screen.getByLabelText("Month"));
  fireEvent.click(screen.getByRole("button", { name: "September" }));
  fireEvent.click(screen.getByRole("button", { name: "15th–22nd" }));
  expect(screen.getByLabelText("From")).toHaveValue("2026-09-15");
  expect(screen.getByLabelText("To")).toHaveValue("2026-09-22");
  await waitFor(() => expect(db.calls).toContainEqual({ method: "lt", args: ["changed_at", "2026-09-23T05:00:00.000Z"] }));
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-24" } });
  expect(screen.getByRole("button", { name: "15th–22nd" })).toHaveAttribute("aria-pressed", "false");
  await waitFor(() => expect(db.calls).toContainEqual({ method: "lt", args: ["changed_at", "2026-09-25T05:00:00.000Z"] }));
});

it("shows invalid dates instead of querying a reversed range", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All trucks updated"));
  const previous = db.calls.length;
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2020-01-01" } });
  expect(screen.getByRole("status")).toHaveTextContent("Select a valid period");
  expect(db.calls).toHaveLength(previous);
});

it("shows a read error without displaying a false zero counter", async () => {
  db.fail = true;
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not load mileage update counts"));
});

it("combines all/assigned scope with update status and keeps the other selection", async () => {
  show([{ id: "a", driver1_id: "driver-a" }, { id: "b", driver1_id: "driver-b" },
    { id: "hidden", driver1_id: null }, { id: "idle", driver1_id: null }]);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All trucks updated 2 / 4"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 2");
  fireEvent.click(screen.getByRole("button", { name: "Not updated" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^aidle$/);
  expect(screen.getByRole("button", { name: "All trucks" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Assigned trucks" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^a$/);
  expect(screen.getByRole("button", { name: "Not updated" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 1 / 2");
  fireEvent.click(screen.getByRole("button", { name: "Updated" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^b$/);
  expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 1 / 2");
  fireEvent.click(screen.getByRole("button", { name: "All trucks" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^bhidden$/);
  expect(screen.getByRole("button", { name: "Updated" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("All trucks updated 2 / 4");
  fireEvent.click(screen.getByRole("button", { name: "All updates" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^abhiddenidle$/);
});


it("counts saved oil services as mileage checks and deduplicates a truck already updated", async () => {
  db.oil = true;
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All trucks updated 2 / 3"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 2");
  expect(db.calls).toContainEqual({ method: "in", args: ["entry_type", ["Oil Change", "Air Filter + Oil change"]] });
  expect(db.calls).toContainEqual({ method: "not", args: ["odometer", "is", null] });
  expect(db.calls).toContainEqual({ method: "eq", args: ["is_deleted", false] });
});
