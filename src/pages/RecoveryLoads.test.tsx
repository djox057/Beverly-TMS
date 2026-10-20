import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecoveryLoads from "./RecoveryLoads";
const access = vi.hoisted(() => ({ role: "dispatch" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: (role: string) => role === access.role, profile: { full_name: "Jon" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useRecoveryLoadsRealtime", () => ({ useRecoveryLoadsRealtime: vi.fn() }));
vi.mock("@/components/recovery/AssignRecoveryLoadDialog", () => ({ AssignRecoveryLoadDialog: () => null }));
vi.mock("@/components/recovery/RecoveryLoadsStats", () => ({ RecoveryLoadsStats: () => null }));
vi.mock("@/components/recovery/PrebookManagerStats", () => ({ PrebookManagerStats: () => <div>Prebook performance by manager</div> }));
const { saveNote } = vi.hoisted(() => ({ saveNote: vi.fn(async (..._args: unknown[]) => ({ data: [{ id: "p" }], error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: (values: unknown) => ({ eq: (column: string, id: string) => { const chain = { eq: () => chain, select: () => saveNote(values, column, id) }; return chain; } }), select: () => ({ or: () => ({ order: async () => ({ error: null, data: [
  { id: "p", broker_load_number: "PREBOOK-1", prebook: true, truck_id: "truck", driver1_id: "driver", prebook_original_booked_by: "Original Booker", prebook_note: "Call tomorrow", status: "pending", p_status: "Covered", truck: { truck_number: "123" }, trailer: { trailer_number: "456" }, driver1: { name: "Driver One", dispatcher_id: null }, driver2: { name: "Driver Two" }, retrieval: false, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [{ id: "rc", file_category: "RC", file_path: "rc.pdf" }, { id: "bol", file_category: "BOL", file_path: "bol.pdf" }] },
  { id: "r", broker_load_number: "RECOVERY-1", prebook: false, retrieval: true, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [] },
  { id: "c", broker_load_number: "CANCELED-1", prebook: true, retrieval: false, canceled: true, pickup_drops: [], order_files: [] },
  { id: "done", broker_load_number: "COMPLETED-1", prebook: true, canceled: false, order_files: [{ file_category: "POD" }] },
  { id: "available", broker_load_number: "AVAILABLE-1", prebook: true, canceled: false, p_status: "Available", order_files: [] },
  { id: "covered", broker_load_number: "COVERED-1", prebook: true, canceled: false, p_status: "Covered", order_files: [] },
] }) }) }) }) } }));
afterEach(() => { cleanup(); access.role = "dispatch"; saveNote.mockClear(); });
it.each(['admin','manager'])('shows manager performance only to admin, checking %s',async role=>{
  access.role=role;
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  await screen.findByText('PREBOOK-1');
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Statistics'}),{button:0,ctrlKey:false});
  await screen.findByRole('heading',{name:'All Prebook loads'});
  if(role==='admin') expect(screen.getByText('Prebook performance by manager')).toBeInTheDocument();
  else expect(screen.queryByText('Prebook performance by manager')).not.toBeInTheDocument();
});
it("opens Prebook first, keeping recovery separate and archiving canceled prebooks", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  expect(screen.getByRole("heading", { name: "Recovery Loads & Prebook" })).toBeInTheDocument();
  expect(await screen.findByText("PREBOOK-1")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Booked By" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Cancels At" })).not.toBeInTheDocument();
  expect(screen.getByText("Loaded")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View status for PREBOOK-1" })).toHaveClass("text-sky-700");
  expect(screen.getByText("Original Booker")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Move to Recovery" })).not.toBeInTheDocument();
  expect(within(screen.getByText("PREBOOK-1").closest("tr")!).getByRole("button", { name: "RC" })).toBeEnabled();
  const note = screen.getByRole("button", { name: "View prebook note for PREBOOK-1" });
  expect(note).toHaveClass("truncate");
  fireEvent.click(note);
  expect(screen.getByRole("dialog")).toHaveTextContent("Call tomorrow");
  expect(screen.queryByRole("textbox", { name: "Prebook note" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByText("RECOVERY-1")).not.toBeInTheDocument();
  expect(screen.queryByText("CANCELED-1")).not.toBeInTheDocument();
  expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Prebook loads", "Recovery loads"]);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Recovery loads" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText("RECOVERY-1")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Booked By" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Cancels At" })).toBeInTheDocument();
  expect(screen.queryByText("PREBOOK-1")).not.toBeInTheDocument();
});

it.each(["admin", "manager"])("allows %s to edit a note in the popup", async role => {
  access.role = role;
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "View prebook note for PREBOOK-1" }));
  const note = screen.getByRole("textbox", { name: "Prebook note" });
  expect(note).toHaveValue("Call tomorrow");
  fireEvent.change(note, { target: { value: "Confirmed tomorrow" } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ prebook_note: "Confirmed tomorrow" }, "id", "p"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("shows assignment details to dispatchers without status editing", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "View status for PREBOOK-1" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("123");
  expect(screen.getByRole("dialog")).toHaveTextContent("456");
  expect(screen.getByRole("dialog")).toHaveTextContent("Driver One");
  expect(screen.getByRole("dialog")).toHaveTextContent("Driver Two");
  expect(screen.queryByLabelText("Prebook status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save status" })).not.toBeInTheDocument();
});
it("lets managers manually change Covered back to Available", async () => {
  access.role = "manager";
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "View status for PREBOOK-1" }));
  fireEvent.change(screen.getByLabelText("Prebook status"), { target: { value: "Available" } });
  fireEvent.click(screen.getByRole("button", { name: "Save status" }));
  await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ p_status: "Available" }, "id", "p"));
});

it("offers Available and Covered without a cancellation option", async () => {
  access.role = "admin";
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "View status for PREBOOK-1" }));
  expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Available", "Covered"]);
});
it("shows all prebooks in Statistics, including canceled and POD-completed loads", async () => {
  access.role = "admin";
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  await screen.findByText("PREBOOK-1");
  expect(screen.queryByText("COMPLETED-1")).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Statistics" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText("COMPLETED-1")).toBeInTheDocument();
  expect(screen.getByText("CANCELED-1")).toBeInTheDocument();
  expect(screen.getByText("PREBOOK-1")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "All Prebook loads" })).toBeInTheDocument();
});
it("colors Available green and Covered red", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  expect(await screen.findByRole("button", { name: "View status for AVAILABLE-1" })).toHaveClass("text-green-700");
  expect(screen.getByRole("button", { name: "View status for COVERED-1" })).toHaveClass("text-red-700");
});

it("lets managers revert the assignment and reset availability", async () => {
  access.role = "manager";
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Revert assign" }));
  await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ truck_id: null, trailer_id: null, driver1_id: null, driver2_id: null, p_status: "Available", recovery_assigned: false }, "id", "p"));
});
it("does not offer revert assignment to dispatchers", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  await screen.findByText("PREBOOK-1");
  expect(screen.queryByRole("button", { name: "Revert assign" })).not.toBeInTheDocument();
});
