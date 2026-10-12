import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { filterMileageUpdateTrucks } from "@/lib/mileageUpdatePeriod";
import { useMileageUpdateSummary } from "@/hooks/useMileageUpdateSummary";
import { MileageUpdateSummary } from "./MileageUpdateSummary";

const db = vi.hoisted(() => ({ calls: [] as { method: string; args: unknown[] }[], fail: false, large: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    db.calls.push({ method: "from", args: [table] });
    const chain: Record<string, (...args: unknown[]) => unknown> = Object.fromEntries(["select", "eq", "not", "gte", "lt", "order"].map((method) => [method, (...args: unknown[]) => {
      db.calls.push({ method, args }); return chain;
    }]));
    chain.range = async (...args: unknown[]) => {
      const [start, end] = args as number[];
      db.calls.push({ method: "range", args: [start, end] });
      if (db.fail) return { data: null, error: new Error("History unavailable") };
      const data = db.large && start === 0 ? Array.from({ length: 1000 }, () => ({ truck_id: "a", changed_by: "person1" }))
        : [{ truck_id: "b", changed_by: "person2" }, { truck_id: "hidden", changed_by: "person3" }];
      return { data, error: null };
    };
    return chain;
  } },
}));

function SummaryHarness({ trucks }: { trucks: { id: string; driver1_id: string | null }[] }) {
  const summary = useMileageUpdateSummary();
  const visible = filterMileageUpdateTrucks(trucks, summary.edits, summary.view);
  return <><MileageUpdateSummary summary={summary} trucks={trucks} trucksLoading={false} trucksError={false} />
    <ul aria-label="Visible trucks">{visible.map((truck) => <li key={truck.id}>{truck.id}</li>)}</ul></>;

}
function show(trucks = [{ id: "a", driver1_id: "driver-a" }, { id: "b", driver1_id: "driver-b" }, { id: "c", driver1_id: "driver-c" }]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SummaryHarness trucks={trucks} /></QueryClientProvider>);
}
beforeEach(() => { db.calls = []; db.fail = false; db.large = false; });
afterEach(cleanup);

it("uses history and filters out people from hidden trucks", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 1 / 3"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 1");
  expect(db.calls).toContainEqual({ method: "eq", args: ["field", "miles"] });
  expect(db.calls).toContainEqual({ method: "not", args: ["new_value", "is", null] });
});

it("fetches beyond the first 1000 history entries", async () => {
  db.large = true;
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 2 / 3"));
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
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated"));
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

it("filters assigned trucks by the selected period without changing the completion denominator", async () => {
  show([{ id: "a", driver1_id: "driver-a" }, { id: "b", driver1_id: "driver-b" }, { id: "hidden", driver1_id: null }]);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 1 / 2"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 1");
  fireEvent.click(screen.getByRole("button", { name: "Updated assigned" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^b$/);
  expect(screen.getByRole("status")).toHaveTextContent("Assigned trucks updated 1 / 2");
  fireEvent.click(screen.getByRole("button", { name: "Not updated assigned" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^a$/);
  fireEvent.click(screen.getByRole("button", { name: "Assigned trucks" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent(/^ab$/);
  fireEvent.click(screen.getByRole("button", { name: "All trucks" }));
  expect(screen.getByRole("list", { name: "Visible trucks" })).toHaveTextContent("hidden");
});

it("picks months and years from buttons and resets a custom range to the selected month", async () => {
  show();
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-24" } });
  fireEvent.click(screen.getByLabelText("Month"));
  expect(screen.getByRole("dialog", { name: "Choose month" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Month" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
  fireEvent.click(screen.getByRole("button", { name: "February" }));
  expect(screen.getByLabelText("Month")).toHaveTextContent("February 2025");
  expect(screen.getByLabelText("From")).toHaveValue("2025-02-01");
  expect(screen.getByLabelText("To")).toHaveValue("2025-02-07");
  expect(screen.queryByRole("dialog", { name: "Choose month" })).not.toBeInTheDocument();
});
