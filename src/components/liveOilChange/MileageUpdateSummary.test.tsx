import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

function show(trucks = [{ id: "a" }, { id: "b" }, { id: "c" }]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MileageUpdateSummary trucks={trucks} trucksLoading={false} trucksError={false} /></QueryClientProvider>);
}
beforeEach(() => { db.calls = []; db.fail = false; db.large = false; });
afterEach(cleanup);

it("uses history and filters out people from hidden trucks", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Trucks updated 1 / 3"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 1");
  expect(db.calls).toContainEqual({ method: "eq", args: ["field", "miles"] });
  expect(db.calls).toContainEqual({ method: "not", args: ["new_value", "is", null] });
});

it("fetches beyond the first 1000 history entries", async () => {
  db.large = true;
  show();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Trucks updated 2 / 3"));
  expect(screen.getByRole("status")).toHaveTextContent("People who updated mileage 2");
  expect(db.calls).toContainEqual({ method: "range", args: [1000, 1999] });
});

it("applies presets in another month and allows an inclusive custom period", async () => {
  show();
  fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-09" } });
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
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Trucks updated"));
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
