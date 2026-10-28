import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pretripDueDate } from "@/lib/pretripDates";
import PreTripInspection from "./PreTripInspection";

const state = vi.hoisted(() => ({ loading: false, error: false, role: "admin" }));
const trucks = [
  { id: "submitted", truck_number: "1001", is_active: true, driver1_id: "a", driver2_id: null },
  { id: "manual", truck_number: "1002", is_active: true, driver1_id: null, driver2_id: "b" },
  { id: "missing", truck_number: "1003", is_active: true, driver1_id: "c", driver2_id: null },
  { id: "unassigned", truck_number: "1004", is_active: true, driver1_id: null, driver2_id: null },
  { id: "inactive", truck_number: "1005", is_active: false, driver1_id: "d", driver2_id: null },
];
const queryClient = { invalidateQueries: vi.fn() };
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClient,
  useMutation: () => ({}),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "pretrip-trucks" ? trucks : {}, isLoading: false, isPending: false, isError: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ getPrimaryRole: () => state.role, roles: [state.role], profile: { user_id: "viewer" } }),
}));
const allDispatchers: never[] = [];
vi.mock("@/hooks/useFleetManagement", () => ({ useFleetManagement: () => ({ allDispatchers }) }));
vi.mock("@/hooks/realtimeBus", () => ({ busChannel: () => ({ on() { return this; }, subscribe: () => ({ unsubscribe: vi.fn() }) }) }));
vi.mock("@/components/PretripFormSubmissions", () => ({
  PretripFormCell: () => null,
  usePretripSubmissions: (date: string) => ({
    data: date === pretripDueDate() ? [
      { truck_id: "submitted", status: "pending" }, { truck_id: "submitted", status: "imported" },
      { truck_id: "unassigned", status: "imported" },
    ] : [], isPending: state.loading, isError: state.error,
  }),
}));
vi.mock("@/components/PretripPhotosCell", () => ({
  PretripPhotosCell: () => null,
  usePretripPhotos: (date: string) => ({
    data: date === pretripDueDate() ? { submitted: [{}, {}], manual: [{}], unassigned: [{}] } : {},
    isPending: false, isError: false,
  }),
}));
vi.mock("@/components/PretripProblemsCell", () => ({ PretripProblemsCell: () => null }));

beforeEach(() => { state.loading = false; state.error = false; state.role = "admin"; });
afterEach(cleanup);

it("shows assigned trucks and one completion per truck despite repeated forms and photos", () => {
  render(<PreTripInspection />);
  expect(screen.getByRole("status")).toHaveTextContent("Completed 2 / 3 trucks");
  expect(screen.getByRole("status")).toHaveTextContent("1 remaining");
  expect(screen.getByText("1002")).toBeInTheDocument();
  expect(screen.queryByText("1004")).not.toBeInTheDocument();
  expect(screen.queryByText("1005")).not.toBeInTheDocument();
});

it("updates the counter with the visible search results", () => {
  render(<PreTripInspection />);
  fireEvent.change(screen.getByPlaceholderText("Search unit or driver..."), { target: { value: "1003" } });
  expect(screen.getByRole("status")).toHaveTextContent("Completed 0 / 1 trucks");
  expect(screen.queryByText("1001")).not.toBeInTheDocument();
});

it("recomputes completion when selecting another inspection week", () => {
  render(<PreTripInspection />);
  fireEvent.click(screen.getByTitle("Previous inspection week"));
  expect(screen.getByRole("status")).toHaveTextContent("Completed 0 / 3 trucks");
  expect(screen.getByRole("status")).toHaveTextContent("3 remaining");
});

it("waits for submissions before presenting a numeric total", () => {
  state.loading = true;
  render(<PreTripInspection />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading completion count");
  expect(screen.getByRole("status")).not.toHaveTextContent("Completed");
});

it("shows a count error instead of a misleading partial total", () => {
  state.error = true;
  render(<PreTripInspection />);
  expect(screen.getByRole("status")).toHaveTextContent("Could not load completion count");
});

vi.mock("@/components/PretripStatistics", () => ({
  PretripStatistics: ({ trucks, scope }: { trucks: { id: string }[]; scope: string }) => <div>Statistics roster: {trucks.length}, scope: {scope}</div>,
}));

it("opens statistics with only active assigned trucks and returns to the inspection report", () => {
  render(<PreTripInspection />);
  fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
  expect(screen.getByText("Statistics roster: 3, scope: all")).toBeInTheDocument();
  expect(screen.queryByPlaceholderText("Search unit or driver...")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspection report" }));
  expect(screen.getByRole("status")).toHaveTextContent("Completed 2 / 3 trucks");
});

it("hides statistics for the dispatcher role while keeping the inspection report available", () => {
  state.role = "dispatch";
  render(<PreTripInspection />);
  expect(screen.queryByRole("button", { name: "Statistics" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Completed 2 / 3 trucks");
});
