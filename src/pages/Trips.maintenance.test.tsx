import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Trips from "./Trips";
import { hasRoleAccess } from "@/lib/dispatchAccess";
import { driverWeekStatementKey } from "@/lib/tripStatement";

const mocks = vi.hoisted(() => ({
  role: "maintenance",
  assignedQuery: vi.fn(),
  secondTruck: false,
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
  data: [{
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
    if (options.queryKey[0] === "trips-dispatch-assigned-drivers") mocks.assignedQuery(options.enabled);
    if (options.queryKey[0] === "trip-week-statements" && options.enabled) return { data: mocks.statements };
    return { data: undefined };
  },
}));
vi.mock("@/components/StatementPreviewDialog", () => ({ StatementPreviewDialog: () => null }));
vi.mock("@/components/trips/TripStatementDialog", () => ({ TripStatementDialog: () => null }));
vi.mock("@/components/trips/BulkTripStatementImport", () => ({ BulkTripStatementImport: () => null }));
vi.mock("@/components/NestedDriverTripsDropdown", () => ({ NestedDriverTripsDropdown: () => null, NestedDriverTripsInlineContent: () => null }));

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); mocks.secondTruck = false; mocks.statements = undefined; });
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
it("shows the imported weekly statement for a driver who used two trucks", () => {
  mocks.role = "admin";
  mocks.secondTruck = true;
  mocks.statements = new Map([[driverWeekStatementKey("other-driver", "2026-11-17"), { truck_number: null, paid_amount: 1234.56 }]]);
  render(<MemoryRouter><Trips /></MemoryRouter>);
  expect(screen.getByText("9999")).toBeInTheDocument();
  expect(screen.getByText("1111")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "$1,234.56" })).toBeInTheDocument();
});
