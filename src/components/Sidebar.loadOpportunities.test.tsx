import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Sidebar } from "./Sidebar";
import type { UserRole } from "@/hooks/useAuth";

const mocks = vi.hoisted(() => ({ role: "dispatch" as UserRole, legacy: vi.fn(), opportunities: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({
  profile: { full_name: "Test Dispatcher" }, user: { id: "dispatcher" }, signOut: vi.fn(),
  getPrimaryRole: () => mocks.role, hasRole: (role: string) => mocks.role === role,
}) }));
vi.mock("@/contexts/IndividualModeContext", () => ({ useIndividualMode: () => ({ individualMode: false, canUseIndividualMode: false }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));
vi.mock("@/hooks/useYardLoadsCount", () => ({ useYardLoadsCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/useDispatchAlertCount", () => ({ useDispatchAlertCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/usePretripMissingCount", () => ({ usePretripMissingCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/useDailyReportPermissions", () => ({ useDailyReportPermissions: () => ({ canView: false }) }));
vi.mock("@/hooks/useRecoveryLoadsCount", () => ({ useRecoveryLoadsCount: (options: unknown) => {
  mocks.legacy(options); return { data: { count: 99, hasMine: false } };
} }));
vi.mock("@/hooks/useDispatcherLoadOpportunities", () => ({ useDispatcherLoadOpportunities: (...args: unknown[]) => {
  mocks.opportunities(...args); return { data: { prebookCount: 3, recoveryCount: 2, truckIds: ["mine"], orderIds: [] }, isError: false, isFetching: false };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [] }) }) }) }) } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
function navigation() { return <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SidebarProvider><Sidebar /></SidebarProvider></MemoryRouter>; }

it("replaces the legacy counter only for dispatch and works with Individual mode off", async () => {
  mocks.role = "dispatch"; await act(async () => { render(navigation()); });
  expect(screen.getByLabelText(/^Prebook: 3/)).toBeInTheDocument();
  expect(screen.getByLabelText(/^Recovery: 2/)).toBeInTheDocument();
  expect(mocks.legacy).toHaveBeenCalledWith({ enabled: false });
  expect(mocks.opportunities).toHaveBeenCalledWith("dispatcher", "dispatch");
  expect(screen.queryByText("99")).not.toBeInTheDocument();
});
it.each(["admin", "manager", "supervisor"] as const)("preserves the legacy badge for %s", async role => {
  mocks.role = role; await act(async () => { render(navigation()); });
  expect(screen.queryByLabelText(/^Prebook:/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Recovery:/)).not.toBeInTheDocument();
  expect(screen.getByText("99")).toBeInTheDocument();
  expect(mocks.legacy).toHaveBeenCalledWith({ enabled: true });
});

it("shows PTI and ELD navigation for Chicago Management", async () => {
  mocks.role = "chicago_management";
  await act(async () => { render(navigation()); });
  expect(screen.getByRole("link", { name: "ELD" })).toHaveAttribute("href", "/eld");
  expect(screen.getByRole("link", { name: "Pre Trip Inspection" })).toHaveAttribute("href", "/pretrip-inspection");
});
