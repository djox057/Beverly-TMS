import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MaintenanceNoteHistory } from "./MaintenanceNoteHistory";
const api = vi.hoisted(() => ({ range: vi.fn(), gte: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ gte: api.gte }) }) }) } }));
const rows = [
  { id: "2", old_note: "Waiting for parts", new_note: null, changed_by_name: "Alex", changed_at: "2026-10-27T17:00:00Z" },
  { id: "1", old_note: "Service booked", new_note: "Waiting for parts", changed_by_name: "Shane", changed_at: "2026-10-26T17:00:00Z" },
];
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  api.gte.mockReturnValue({ order: () => ({ order: () => ({ range: api.range }) }) });
  api.range.mockResolvedValue({ data: rows, error: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });
function show() { render(<QueryClientProvider client={client}><MaintenanceNoteHistory truckId="truck-1" /></QueryClientProvider>); }
it("loads only on opening and browses cleared and replaced notes with authors", async () => {
  show(); expect(api.range).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /3-month history/ }));
  expect(await screen.findByText(/Alex/)).toBeInTheDocument();
  expect(screen.getByText("Cleared:")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Newer note" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Older note" }));
  expect(screen.getByText(/Shane/)).toBeInTheDocument();
  expect(screen.getByText("Service booked")).toBeInTheDocument();
  expect(screen.getByText("With:")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Older note" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Newer note" }));
  expect(screen.getByText(/Alex/)).toBeInTheDocument();
  expect(api.gte).toHaveBeenCalledWith("changed_at", expect.any(String));
});
it("handles empty history and disables navigation", async () => {
  api.range.mockResolvedValue({ data: [], error: null }); show();
  fireEvent.click(screen.getByRole("button", { name: /3-month history/ }));
  expect(await screen.findByText("No note edits in the last 3 months.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Older note" })).toBeDisabled();
});
it("allows retrying a failed history load", async () => {
  api.range.mockResolvedValueOnce({ data: null, error: new Error("Offline") }); show();
  fireEvent.click(screen.getByRole("button", { name: /3-month history/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load history");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByText(/Alex/)).toBeInTheDocument());
});
