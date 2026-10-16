import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecoveryLoads from "./RecoveryLoads";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: () => false, profile: { full_name: "Jon" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useRecoveryLoadsRealtime", () => ({ useRecoveryLoadsRealtime: vi.fn() }));
vi.mock("@/components/recovery/AssignRecoveryLoadDialog", () => ({ AssignRecoveryLoadDialog: () => null }));
vi.mock("@/components/recovery/RecoveryLoadsStats", () => ({ RecoveryLoadsStats: () => null }));
const { saveNote } = vi.hoisted(() => ({ saveNote: vi.fn(async (..._args: unknown[]) => ({ data: [{ id: "p" }], error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: (values: unknown) => ({ eq: (column: string, id: string) => ({ select: () => saveNote(values, column, id) }) }), select: () => ({ or: () => ({ order: async () => ({ error: null, data: [
  { id: "p", broker_load_number: "PREBOOK-1", prebook: true, prebook_note: "Call tomorrow", status: "pending", retrieval: false, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [] },
  { id: "r", broker_load_number: "RECOVERY-1", prebook: false, retrieval: true, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [] },
  { id: "c", broker_load_number: "CANCELED-1", prebook: true, retrieval: false, canceled: true, pickup_drops: [], order_files: [] },
] }) }) }) }) } }));
afterEach(cleanup);
it("opens Prebook first, keeping recovery and canceled loads out of that list", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  expect(screen.getByRole("heading", { name: "Recovery Loads & Prebook" })).toBeInTheDocument();
  expect(await screen.findByText("PREBOOK-1")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Booked By" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Cancels At" })).not.toBeInTheDocument();
  expect(screen.getByText("pending")).toBeInTheDocument();
  const note = screen.getByRole("textbox", { name: "Prebook note for PREBOOK-1" });
  expect(note).toHaveValue("Call tomorrow");
  fireEvent.change(note, { target: { value: "Confirmed tomorrow" } });
  fireEvent.blur(note);
  await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ prebook_note: "Confirmed tomorrow" }, "id", "p"));
  expect(screen.queryByText("RECOVERY-1")).not.toBeInTheDocument();
  expect(screen.queryByText("CANCELED-1")).not.toBeInTheDocument();
  expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Prebook loads", "Recovery loads"]);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Recovery loads" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText("RECOVERY-1")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Booked By" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Cancels At" })).toBeInTheDocument();
  expect(screen.queryByText("PREBOOK-1")).not.toBeInTheDocument();
});
