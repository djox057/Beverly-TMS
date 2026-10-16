import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecoveryLoads from "./RecoveryLoads";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: () => false, profile: { full_name: "Jon" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useRecoveryLoadsRealtime", () => ({ useRecoveryLoadsRealtime: vi.fn() }));
vi.mock("@/components/recovery/AssignRecoveryLoadDialog", () => ({ AssignRecoveryLoadDialog: () => null }));
vi.mock("@/components/recovery/RecoveryLoadsStats", () => ({ RecoveryLoadsStats: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ or: () => ({ order: async () => ({ error: null, data: [
  { id: "p", broker_load_number: "PREBOOK-1", prebook: true, retrieval: false, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [] },
  { id: "r", broker_load_number: "RECOVERY-1", prebook: false, retrieval: true, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [] },
  { id: "c", broker_load_number: "CANCELED-1", prebook: true, retrieval: false, canceled: true, pickup_drops: [], order_files: [] },
] }) }) }) }) } }));
afterEach(cleanup);
it("opens Prebook first, keeping recovery and canceled loads out of that list", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  expect(screen.getByRole("heading", { name: "Recovery Loads & Prebook" })).toBeInTheDocument();
  expect(await screen.findByText("PREBOOK-1")).toBeInTheDocument();
  expect(screen.queryByText("RECOVERY-1")).not.toBeInTheDocument();
  expect(screen.queryByText("CANCELED-1")).not.toBeInTheDocument();
  expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Prebook loads", "Recovery loads"]);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Recovery loads" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText("RECOVERY-1")).toBeInTheDocument();
  expect(screen.queryByText("PREBOOK-1")).not.toBeInTheDocument();
});
