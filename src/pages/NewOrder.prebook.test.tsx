import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import NewOrder from "./NewOrder";
const state = vi.hoisted(() => ({
  role: "manager",
  companies: [{ id: "company", name: "BF Prime LLC" }],
  trucks: [], drivers: [], brokers: [],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ hasRole: (role: string) => role === state.role, roles: [state.role], profile: { full_name: "Test", office: "CACAK" } }) }));
vi.mock("@/hooks/useCompanies", () => ({ useCompanies: () => ({ data: state.companies, isLoading: false }) }));
vi.mock("@/hooks/useTrucks", () => ({ useTrucks: () => ({ data: state.trucks, isLoading: false }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ data: state.drivers, isLoading: false }) }));
vi.mock("@/hooks/useBrokers", () => ({ useBrokers: () => ({ data: state.brokers, isLoading: false }) }));
vi.mock("@/hooks/useNextInternalLoadNumber", () => ({ useNextInternalLoadNumber: () => ({ data: "1019001", isLoading: false }) }));
vi.mock("@/hooks/useApprovalManagers", () => ({ useApprovalManagers: () => ({ data: [] }) }));
vi.mock("@/hooks/useTruckLastDelivery", () => ({ useTruckLastDelivery: () => ({ data: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) } } }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const mount = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><NewOrder /></MemoryRouter></QueryClientProvider>);
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["manager", "admin"])("shows Prebook and Multi load only for %s", role => {
  state.role = role; mount();
  expect(screen.getByRole("switch", { name: "Prebook" })).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "Multi load" })).toBeInTheDocument();
});
it("hides both toggles for dispatchers", () => {
  state.role = "dispatch"; mount();
  expect(screen.queryByRole("switch", { name: "Prebook" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Multi load" })).not.toBeInTheDocument();
});
it("hides assignments for Prebook and uploads three RCs without automatic extraction", async () => {
  state.role = "manager";
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { brokerLoadNumber: "EXTRACTED" } }) }));
  vi.stubGlobal("fetch", fetcher);
  mount();
  fireEvent.click(screen.getByRole("switch", { name: "Prebook" }));
  expect(screen.queryByText("Truck #", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("Driver 1 (Auto-filled)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("switch", { name: "Multi load" }));
  fireEvent.click(screen.getByRole("button", { name: "Add another load" }));
  for (let i = 1; i <= 3; i++) {
    fireEvent.change(screen.getByLabelText(`RC for load ${i}`), { target: { files: [new File(["RC"], `${i}.pdf`, { type: "application/pdf" })] } });
  }
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button", { name: "Extract with AI" })).toHaveLength(3);
  fireEvent.click(screen.getAllByRole("button", { name: "Extract with AI" })[1]);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByLabelText("Load 2 · Broker Load #")).toHaveValue("EXTRACTED"));
  expect(screen.getByLabelText("Load 1 · Broker Load #")).toHaveValue("");
});
