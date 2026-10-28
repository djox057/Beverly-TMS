import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PretripStatistics } from "./PretripStatistics";
import { fetchPretripDispatcherHistory, fetchPretripHistoricalTruckCounts, fetchPretripStatisticsEvidence } from "@/lib/pretripStatisticsQuery";
const state = vi.hoisted(() => ({ pending: false, error: false, countsEmpty: false, countsError: false, from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
vi.mock("@/lib/pretripConstants", () => ({ ACTIVE_PRETRIP_SHEET_ID: "active-sheet" }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => {
  return { data: queryKey[0] === "pretrip-dispatcher-history" ? { drivers: { a: { dispatcher_id: "d", created_at: "2026-01-01T00:00:00Z" } }, changes: [], names: { d: "Dan" } } : queryKey[0] === "pretrip-historical-truck-counts" ? { counts: (state.countsEmpty ? [] : ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]).map(date => ({ dispatcher_id: "d", date, truck_count: 10, driver_count: 10 })), names: { d: "Dan" } } : [{ truck_id: "t", inspection_date: "2026-09-28" }], isPending: state.pending, isError: state.error || (queryKey[0] === "pretrip-historical-truck-counts" && state.countsError), refetch: vi.fn() };
} }));
vi.mock("./SearchableSelect", () => ({ SearchableSelect: ({ value, onValueChange, options, placeholder }: { value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; placeholder: string }) => <select aria-label={placeholder} value={value} onChange={e => onValueChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));
const trucks = [{ id: "t", truck_number: "100", driver1_id: "a", driver2_id: null, driver_name: "Alice", dispatcher_id: "d", dispatcher_name: "Dan" }];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T16:00:00Z")); state.pending = false; state.error = false; state.countsEmpty = false; state.countsError = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("defaults to completed weeks and supports dispatcher/weekly views and search", () => {
  render(<PretripStatistics trucks={trucks} rosterLoading={false} rosterError={false} scope="all" />);
  expect(screen.getByLabelText("From week")).toHaveValue("2026-09-28");
  expect(screen.getByLabelText("Through week")).toHaveValue("2026-10-19");
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("Expected truck-weeks").parentElement).toHaveTextContent("40");
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

it("loads driver baselines, paginates later changes and resolves former dispatcher names", async () => {
  const queries: { table: string; query: Record<string, ReturnType<typeof vi.fn>> }[] = [];
  state.from.mockImplementation((table: string) => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "in", "gte", "eq", "order"]) query[method] = vi.fn(() => query);
    query.then = vi.fn(resolve => resolve({ data: table === "drivers" ? [{ id: "a", dispatcher_id: "new", created_at: "2026-01-01" }] : [{ user_id: "old", full_name: "Old dispatcher" }], error: null }));
    query.range = vi.fn(async (offset: number) => ({ data: offset === 0 ? Array.from({ length: 1000 }, (_, index) => ({ id: String(index), driver1_id: "a", old_dispatcher_id: "old", dispatcher_id: "new", changed_at: "2026-10-28T12:00:00Z" })) : [], error: null }));
    queries.push({ table, query }); return query;
  });
  const history = await fetchPretripDispatcherHistory("2026-09-28", ["a"]);
  expect(history.drivers.a.dispatcher_id).toBe("new");
  expect(history.changes).toHaveLength(1000);
  expect(history.names.old).toBe("Old dispatcher");
  const changes = queries.find(q => q.table === "assignment_history").query;
  expect(changes.eq).toHaveBeenCalledWith("change_type", "dispatcher_assignment");
  expect(changes.in).toHaveBeenCalledWith("driver1_id", ["a"]);
  expect(changes.gte).toHaveBeenCalledWith("changed_at", "2026-09-28T05:00:00.000Z");
  expect(queries.some(q => q.table === "assignment_history" && q.query.range.mock.calls.some((args: number[]) => args[0] === 1000 && args[1] === 1999))).toBe(true);
});

it("rejects unavailable driver history instead of falling back to current assignments", async () => {
  state.from.mockImplementation(() => {
    const query = { select: vi.fn(), in: vi.fn() };
    query.select.mockReturnValue(query);
    query.in.mockResolvedValue({ data: null, error: new Error("History unavailable") });
    return query;
  });
  await expect(fetchPretripDispatcherHistory("2026-09-28", ["a"])).rejects.toThrow("History unavailable");
});

it("paginates Analytics' saved daily counts for the selected weeks and dispatcher scope", async () => {
  const queries: { table: string; query: Record<string, ReturnType<typeof vi.fn>> }[] = [];
  state.from.mockImplementation((table: string) => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "gte", "lte", "eq", "in", "order"]) query[method] = vi.fn(() => query);
    query.range = vi.fn(async (offset: number) => ({ data: offset === 0 ? Array.from({ length: 1000 }, () => ({ dispatcher_id: "d", date: "2026-10-05", truck_count: 10, driver_count: 10 })) : [], error: null }));
    query.then = vi.fn(resolve => resolve({ data: [{ user_id: "d", full_name: "Dan" }], error: null }));
    queries.push({ table, query }); return query;
  });
  const result = await fetchPretripHistoricalTruckCounts("2026-09-28", "2026-10-05", "d");
  expect(result.counts).toHaveLength(1000);
  expect(result.names.d).toBe("Dan");
  const query = queries.find(q => q.table === "dispatcher_daily_driver_counts").query;
  expect(query.eq).toHaveBeenCalledWith("dispatcher_id", "d");
  expect(query.gte).toHaveBeenCalledWith("date", "2026-09-28");
  expect(query.lte).toHaveBeenCalledWith("date", "2026-10-11");
  expect(queries.some(q => q.query.range.mock.calls.some((args: number[]) => args[0] === 1000))).toBe(true);
});

it("shows unavailable historical totals instead of current-fleet expected counts", () => {
  state.countsEmpty = true;
  render(<PretripStatistics trucks={trucks} rosterLoading={false} rosterError={false} scope="all" />);
  expect(screen.getByText(/Historical truck counts are unavailable/)).toBeInTheDocument();
  expect(screen.getByText("Expected truck-weeks").parentElement).toHaveTextContent("—");
});

it("blocks partial totals if historical count reads fail", () => {
  state.countsError = true;
  render(<PretripStatistics trucks={trucks} rosterLoading={false} rosterError={false} scope="all" />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Expected truck-weeks")).not.toBeInTheDocument();
});
