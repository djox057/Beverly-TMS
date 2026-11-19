import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Trips from "./Trips";
import { hasRoleAccess } from "@/lib/dispatchAccess";
import { driverWeekStatementKey } from "@/lib/tripStatement";

const mocks = vi.hoisted(() => ({
  role: "maintenance",
  assignedQuery: vi.fn(),
  assignedDriverIds: [] as string[],
  secondTruck: false,
  noTrips: false,
  payDriver: undefined as { id: string; name: string; hire_date: string; created_at: string; is_active: boolean; termination_date: string | null } | undefined,
  driverStatements: [] as { driver_id: string | null; week_start: string; paid_amount: number }[],
  statementDialog: vi.fn(),
  statements: undefined as Map<string, unknown> | undefined,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  roles: [mocks.role], getPrimaryRole: () => mocks.role,
  hasRole: (role: any) => hasRoleAccess([mocks.role as any], role),
  profile: { user_id: "maintenance-user", full_name: "Maintenance User" },
}) }));
vi.mock("@/hooks/useSupervisorTeam", () => ({ useSupervisorTeam: () => ({ isSupervisor: false, cacheScope: "all" }) }));
vi.mock("@/contexts/IndividualModeContext", () => ({ useIndividualMode: () => ({ individualMode: false }) }));
vi.mock("@/hooks/useTripsLazyOrders", () => ({ useTripsLazyOrders: () => ({
  data: mocks.noTrips ? [] : [{
    id: "other-order", truckId: "other-truck", truckNumber: "9999", driver1Id: "other-driver", driverName: "Other Dispatcher Driver",
    bookedBy: "Other Dispatcher", loadNumber: "12345", deliveryDate: "2026-11-17", mileage: 500, totalDriverPay: 350, totalFreightAmountNoLumper: 1000,
  }, ...(mocks.secondTruck ? [{
    id: "second-order", truckId: "second-truck", truckNumber: "1111", driver1Id: "other-driver", driverName: "Other Dispatcher Driver",
    bookedBy: "Other Dispatcher", loadNumber: "23456", deliveryDate: "2026-11-18", mileage: 500, totalDriverPay: 350, totalFreightAmountNoLumper: 1000,
  }] : [])],
  isLoading: false, isLazyMode: false, hasGlobalOrders: true, updateOrderLocally: vi.fn(),
}) }));
vi.mock("@/hooks/useAssignmentHistory", () => ({
  useAssignmentHistory: () => ({ data: [] }), buildChangeDescription: vi.fn(), extractDatePart: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}), useMutation: () => ({ mutate: vi.fn() }),
  useQuery: (options: any) => {
    if (options.queryKey[0] === "trips-dispatch-assigned-drivers") {
      mocks.assignedQuery(options.enabled);
      if (options.enabled) return { data: mocks.assignedDriverIds };
    }
    if (options.queryKey[0] === "trips-pay-driver" && options.enabled) return { data: mocks.payDriver };
    if (options.queryKey[0] === "trip-week-statements" && options.queryKey[1] === "driver-weeks" && options.enabled) {
      return { data: mocks.driverStatements };
    }
    if (options.queryKey[0] === "trip-week-statements" && options.enabled) return { data: mocks.statements };
    return { data: undefined };
  },
}));
vi.mock("@/components/StatementPreviewDialog", () => ({ StatementPreviewDialog: () => null }));
vi.mock("@/components/trips/TripStatementDialog", () => ({ TripStatementDialog: ({ target }: { target: unknown }) => {
  mocks.statementDialog(target);
  return null;
} }));
vi.mock("@/components/trips/BulkTripStatementImport", () => ({ BulkTripStatementImport: () => null }));
vi.mock("@/components/NestedDriverTripsDropdown", () => ({ NestedDriverTripsDropdown: () => null, NestedDriverTripsInlineContent: () => null }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.assignedDriverIds = [];
  mocks.secondTruck = false;
  mocks.noTrips = false;
  mocks.payDriver = undefined;
  mocks.driverStatements = [];
  mocks.statements = undefined;
});
it("lets Maintenance see another dispatcher's trips without edit, paid or statement-write controls", () => {
  mocks.role = "maintenance";
  render(<MemoryRouter><Trips /></MemoryRouter>);
  expect(screen.getByText("Other Dispatcher Driver")).toBeInTheDocument();
  expect(screen.getByText("9999")).toBeInTheDocument();
  expect(mocks.assignedQuery).toHaveBeenCalledWith(false);
  expect(screen.queryByRole("checkbox", { name: /Mark .* (paid|unpaid)/ })).not.toBeInTheDocument();
  expect(screen.queryByTitle("Export week to Excel")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Final" })).not.toBeInTheDocument();
  expect(document.querySelector(".lucide-square-pen, .lucide-pencil, .lucide-edit")).toBeNull();
});
it("keeps dispatchers limited to their own assignments", () => {
  mocks.role = "dispatch";
  render(<MemoryRouter><Trips /></MemoryRouter>);
  expect(mocks.assignedQuery).toHaveBeenCalledWith(true);
  expect(screen.queryByText("Other Dispatcher Driver")).not.toBeInTheDocument();
});

it.each(["dispatch", "afterhours"])("lets %s open a Paid statement without offering payment edits", (role) => {
  mocks.role = role;
  mocks.assignedDriverIds = ["other-driver"];
  const statement = { paid_amount: -42.5, truck_number: null };
  mocks.statements = new Map([[driverWeekStatementKey("other-driver", "2026-11-17"), statement]]);
  render(<MemoryRouter><Trips /></MemoryRouter>);

  expect(screen.getByRole("columnheader", { name: "Paid" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "$-42.50" }));
  expect(mocks.statementDialog).toHaveBeenCalledWith(expect.objectContaining({ mode: "view", statement }));
  expect(screen.queryByRole("button", { name: /Add statement|Replace weekly statement/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /Paid|Mark load/i })).not.toBeInTheDocument();
  expect(screen.queryByTitle("Export week to Excel")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Final" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Audit" })).not.toBeInTheDocument();
});
it("shows the imported weekly statement for a driver who used two trucks", () => {
  mocks.role = "admin";
  mocks.secondTruck = true;
  mocks.statements = new Map([[driverWeekStatementKey("other-driver", "2026-11-17"), { truck_number: null, paid_amount: 1234.56 }]]);
  render(<MemoryRouter><Trips /></MemoryRouter>);
  expect(screen.getByText("9999")).toBeInTheDocument();
  expect(screen.getByText("1111")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "$1,234.56" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Final" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Audit" })).toBeInTheDocument();
});

function searchPayDriver(hireDate = "2026-11-03") {
  vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
  mocks.payDriver = {
    id: "other-driver", name: "Other Dispatcher Driver", hire_date: hireDate,
    created_at: `${hireDate}T15:00:00Z`, is_active: true, termination_date: null,
  };
  localStorage.setItem("trips_searchFilter", mocks.payDriver.name);
  render(<MemoryRouter><Trips /></MemoryRouter>);
}

it("fills a no-load week with zero totals and allows a statement by driver without a truck", () => {
  mocks.role = "accounting";
  searchPayDriver();

  const week = screen.getByText("Week: Nov 10 - Nov 16, 2026").closest("tr")!;
  expect(within(week).getByText("No loads")).toBeInTheDocument();
  expect(within(week).getAllByText("$0.00")).toHaveLength(2);
  fireEvent.click(within(week).getByRole("button", { name: "Add statement" }));
  expect(mocks.statementDialog).toHaveBeenCalledWith(expect.objectContaining({
    driverId: "other-driver", driverName: "Other Dispatcher Driver", truckNumber: null,
    weekStart: "2026-11-10", mode: "upload",
  }));
});

it("shows zero and negative statements for a driver with no trips and keeps managers read-only", () => {
  mocks.role = "manager";
  mocks.noTrips = true;
  mocks.driverStatements = [
    { driver_id: "other-driver", week_start: "2026-11-17", paid_amount: 0 },
    { driver_id: null, week_start: "2026-10-27", paid_amount: -42.5 },
  ];
  searchPayDriver();

  const currentWeek = screen.getByText("Week: Nov 17 - Nov 23, 2026").closest("tr")!;
  const earlierWeek = screen.getByText("Week: Oct 27 - Nov 2, 2026").closest("tr")!;
  expect(within(currentWeek).getByRole("button", { name: "$0.00" })).toBeInTheDocument();
  expect(within(earlierWeek).getByRole("button", { name: "$-42.50" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add statement" })).not.toBeInTheDocument();
});

it("paginates no-load weeks and leaves the statement action available on older pages", () => {
  mocks.role = "accounting";
  mocks.noTrips = true;
  searchPayDriver("2025-11-25");

  expect(screen.getAllByRole("button", { name: "Add statement" })).toHaveLength(50);
  fireEvent.click(screen.getByLabelText("Go to next page"));
  const oldestWeek = screen.getByText("Week: Nov 25 - Dec 1, 2025").closest("tr")!;
  expect(within(oldestWeek).getByRole("button", { name: "Add statement" })).toBeInTheDocument();
  expect(screen.queryByText("Week: Nov 17 - Nov 23, 2026")).not.toBeInTheDocument();
});
