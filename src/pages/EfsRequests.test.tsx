import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EfsRequests from "./EfsRequests";

const mock = vi.hoisted(() => ({ roles: ["admin"], updates: [] as unknown[], fail: false, voided: false, migrated: true, entered: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({
  user: { id: "user" }, profile: { full_name: "Requester" }, hasRole: () => true,
}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let updating = false;
  let updates: Record<string, unknown> = {};
  const response = () => ({ data: table === "user_roles" ? mock.roles.map(role => ({ role })) : table === "efs_other_requests" ? [{
    id: "request", driver_name: "Test Driver", truck_number: "123", amount: 100, purpose: "Fuel",
    requested_at: "2026-10-21T12:00:00Z", requested_by: "Requester",
    entered_in_stuff: mock.entered, purpose_detail: null, is_trailer_repair: false,
    trailer_number: null, location_name: null, location_address: null, stuff_entered_at: null,
    ...(mock.migrated ? { voided_at: mock.voided ? "2026-10-21T13:00:00Z" : null,
      void_reason: mock.voided ? "Duplicate request" : null } : {}),
  }] : [], error: null });
  const chain = {
    select: () => chain, order: () => chain, eq: () => chain, is: () => chain,
    range: () => Promise.resolve(response()),
    update: (values: Record<string, unknown>) => { mock.updates.push({ table, values }); updates = values; updating = true; return chain; },
    single: async () => { if (mock.fail) return { data: null, error: new Error("Permission denied") }; if (updating && updates.voided_at) mock.voided = true; if (updating && typeof updates.entered_in_stuff === "boolean") mock.entered = updates.entered_in_stuff; return { data: { id: "request" }, error: null }; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(response()).then(resolve),
  };
  return chain;
} } }));

// Native select keeps these page behavior checks independent of Radix's pointer APIs.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => <select aria-label="Filter" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>, SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><EfsRequests /></QueryClientProvider>);
beforeEach(() => { mock.roles = ["admin"]; mock.updates = []; mock.fail = false; mock.voided = false; mock.migrated = true; mock.entered = false; Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true }); });
afterEach(cleanup);

it.each(["admin", "accounting", "manager", "supervisor", "dispatch", "afterhours", "safety", "claims", "maintenance", "chicago_management", "driver"])("uses the stored %s role despite inherited hasRole access", async role => {
  mock.roles = [role]; show();
  await screen.findByText("Test Driver");
  await waitFor(() => expect(screen.queryByRole("button", { name: "Delete request" }) !== null).toBe(role === "admin"));
  expect(screen.queryByRole("button", { name: "Void" }) !== null).toBe(["admin", "accounting", "manager", "supervisor", "dispatch", "afterhours"].includes(role));
});
it("requires a nonblank reason and saves a void instead of deleting", async () => {
  show(); fireEvent.click(await screen.findByRole("button", { name: "Void" }));
  const confirm = screen.getByRole("button", { name: "Void request" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "   " } });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "  Duplicate request  " } });
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(mock.updates).toEqual([{ table: "efs_other_requests", values: { voided_at: expect.any(String), void_reason: "Duplicate request" } }]);
  await waitFor(() => expect(screen.queryByText("Test Driver")).not.toBeInTheDocument());
  fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "voided" } });
  expect(await screen.findByText("Duplicate request")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Void" })).not.toBeInTheDocument();
});
it("keeps the dialog and reason when voiding fails", async () => {
  mock.fail = true; show(); fireEvent.click(await screen.findByRole("button", { name: "Void" }));
  fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Duplicate request" } });
  fireEvent.click(screen.getByRole("button", { name: "Void request" }));
  await waitFor(() => expect(mock.updates).toHaveLength(1));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(screen.getByLabelText("Reason (required)")).toHaveValue("Duplicate request");
});

it("preserves the request list and explains why voiding is unavailable before migration", async () => {
  mock.migrated = false;
  show();
  expect(await screen.findByText("Test Driver")).toBeInTheDocument();
  expect(await screen.findByText(/Voiding is pending a database update/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Void" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete request" })).toBeInTheDocument();
});

it("saves and copies detailed money code text for an older request", async () => {
  show(); fireEvent.click(await screen.findByRole("button", { name: "Money Code" }));
  const copy = screen.getByRole("button", { name: "Save & copy" });
  expect(copy).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Detailed purpose in English (required)"), { target: { value: "Diesel purchase for the next trip" } });
  fireEvent.change(screen.getByLabelText("Business name (required)"), { target: { value: "Road Ranger" } });
  fireEvent.change(screen.getByLabelText("Full address (required)"), { target: { value: "123 Main St, Toledo, OH 43612" } });
  fireEvent.click(copy);
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("EFS Money Code\n\nUnit: 123\nDriver: Test Driver\nPurpose: Diesel purchase for the next trip\nAmount: $100.00\nLocation: Road Ranger 123 Main St, Toledo, OH 43612"));
  expect(mock.updates).toContainEqual({ table: "efs_other_requests", values: expect.objectContaining({ purpose_detail: "Diesel purchase for the next trip", location_name: "Road Ranger" }) });
});
it("persists a manually checked Stuff status", async () => {
  mock.roles = ["accounting"]; show();
  const checkbox = await screen.findByRole("checkbox", { name: "Entered in Stuff for Test Driver" });
  await waitFor(() => expect(checkbox).toBeEnabled());
  fireEvent.click(checkbox);
  await waitFor(() => expect(mock.updates).toContainEqual({ table: "efs_other_requests", values: { entered_in_stuff: true } }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Entered in Stuff for Test Driver" })).toBeChecked());
});
it("keeps Stuff status read-only for roles without edit permission", async () => {
  mock.roles = ["maintenance"]; show();
  expect(await screen.findByRole("checkbox", { name: "Entered in Stuff for Test Driver" })).toBeDisabled();
});
