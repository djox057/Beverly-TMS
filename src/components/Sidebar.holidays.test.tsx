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

it.each(['admin', 'manager', 'supervisor', 'dispatch', 'afterhours', 'accounting', 'safety', 'claims', 'maintenance', 'chicago_management', 'yard', 'recruiting', 'driver'] as const)('shows Holidays only for the exact admin/manager primary role: %s', async role => {
  mocks.role = role;
  await act(async () => { render(navigation()); });
  const link = screen.queryByRole('link', { name: 'Holidays' });
  if (['admin', 'manager', 'supervisor', 'dispatch', 'accounting'].includes(role)) expect(link).toHaveAttribute('href', '/holidays');
  else expect(link).not.toBeInTheDocument();
});
