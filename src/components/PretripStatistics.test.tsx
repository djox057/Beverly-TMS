import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PretripStatistics } from "./PretripStatistics";
import { fetchPretripStatisticsEvidence } from "@/lib/pretripStatisticsQuery";
const state = vi.hoisted(() => ({ pending: false, error: false, from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
vi.mock("@/lib/pretripConstants", () => ({ ACTIVE_PRETRIP_SHEET_ID: "active-sheet" }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => {
  return { data: [{ truck_id: "t", inspection_date: "2026-09-28" }], isPending: state.pending, isError: state.error, refetch: vi.fn() };
} }));
vi.mock("./SearchableSelect", () => ({ SearchableSelect: ({ value, onValueChange, options, placeholder }: { value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; placeholder: string }) => <select aria-label={placeholder} value={value} onChange={e => onValueChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));
const trucks = [{ id: "t", truck_number: "100", driver1_id: "a", driver2_id: null, driver_name: "Alice", dispatcher_id: "d", dispatcher_name: "Dan" }];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T16:00:00Z")); state.pending = false; state.error = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("defaults to completed weeks and supports dispatcher/weekly views and search", () => {
  render(<PretripStatistics trucks={trucks} rosterLoading={false} rosterError={false} scope="all" />);
  expect(screen.getByLabelText("From week")).toHaveValue("2026-09-28");
  expect(screen.getByLabelText("Through week")).toHaveValue("2026-10-19");
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Trucks" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dispatchers" }));
  expect(screen.getByText("Dan")).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Trucks" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("columnheader")).toHaveLength(5);
  fireEvent.change(screen.getByLabelText("Search statistics"), { target: { value: "nobody" } });
  expect(screen.getByText("No matching statistics.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Through week"), { target: { value: "2026-10-26" } });
  expect(screen.getByText(/Current week is in progress/)).toBeInTheDocument();
});
it("hides counts on a failed or incomplete query", () => {
  state.error = true;
  const { rerender } = render(<PretripStatistics trucks={trucks} rosterLoading={false} rosterError={false} scope="all" />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Expected truck-weeks")).not.toBeInTheDocument();
  state.error = false; state.pending = true;
  rerender(<PretripStatistics trucks={trucks} rosterLoading={false} rosterError={false} scope="all" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
});
it("paginates completion metadata and filters retired forms and imported photo copies", async () => {
  const queries: { table: string; query: Record<string, ReturnType<typeof vi.fn>> }[] = [];
  state.from.mockImplementation((table: string) => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "gte", "lte", "eq", "neq", "is", "order"]) query[method] = vi.fn(() => query);
    query.range = vi.fn(async (offset: number) => ({ data: table === "pretrip_form_submissions" && offset === 0 ? Array.from({ length: 1000 }, () => ({ truck_id: "t", inspection_date: "2026-09-28" })) : [], error: null }));
    queries.push({ table, query }); return query;
  });
  const data = await fetchPretripStatisticsEvidence("2026-09-28", "2026-10-19");
  expect(data).toHaveLength(1000);
  const forms = queries.find(q => q.table === "pretrip_form_submissions").query;
  expect(forms.eq).toHaveBeenCalledWith("sheet_id", "active-sheet");
  expect(forms.neq).toHaveBeenCalledWith("status", "superseded");
  expect(queries.some(q => q.query.range.mock.calls.some((args: number[]) => args[0] === 1000))).toBe(true);
  expect(queries.find(q => q.table === "pretrip_photos").query.is).toHaveBeenCalledWith("form_submission_id", null);
});
it("rejects failed data reads instead of reporting partial totals", async () => {
  state.from.mockImplementation(() => {
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "gte", "lte", "eq", "neq", "is", "order"]) query[method] = () => query;
    query.range = async () => ({ data: null, error: new Error("Permission denied") });
    return query;
  });
  await expect(fetchPretripStatisticsEvidence("2026-09-28", "2026-10-19")).rejects.toThrow("Permission denied");
});
