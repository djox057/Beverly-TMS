import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecoveryLoads from "./RecoveryLoads";
const access = vi.hoisted(() => ({ role: "dispatch" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: (role: string) => role === access.role, profile: { full_name: "Jon" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useRecoveryLoadsRealtime", () => ({ useRecoveryLoadsRealtime: vi.fn() }));
vi.mock("@/components/recovery/AssignRecoveryLoadDialog", () => ({ AssignRecoveryLoadDialog: () => null }));
vi.mock("@/components/recovery/RecoveryLoadsStats", () => ({ RecoveryLoadsStats: () => null }));
const { saveNote } = vi.hoisted(() => ({ saveNote: vi.fn(async (..._args: unknown[]) => ({ data: [{ id: "p" }], error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: (values: unknown) => ({ eq: (column: string, id: string) => ({ select: () => saveNote(values, column, id) }) }), select: () => ({ or: () => ({ order: async () => ({ error: null, data: [
  { id: "p", broker_load_number: "PREBOOK-1", prebook: true, prebook_note: "Call tomorrow", status: "pending", p_status: "Covered", truck: { truck_number: "123" }, trailer: { trailer_number: "456" }, driver1: { name: "Driver One", dispatcher_id: null }, driver2: { name: "Driver Two" }, retrieval: false, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [{ id: "rc", file_category: "RC", file_path: "rc.pdf" }, { id: "bol", file_category: "BOL", file_path: "bol.pdf" }] },
  { id: "r", broker_load_number: "RECOVERY-1", prebook: false, retrieval: true, canceled: false, booked_by: "Jon", pickup_drops: [], order_files: [] },
  { id: "c", broker_load_number: "CANCELED-1", prebook: true, retrieval: false, canceled: true, pickup_drops: [], order_files: [] },
] }) }) }) }) } }));
afterEach(() => { cleanup(); access.role = "dispatch"; saveNote.mockClear(); });
it("opens Prebook first, keeping recovery separate and showing canceled prebooks", async () => {
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  expect(screen.getByRole("heading", { name: "Recovery Loads & Prebook" })).toBeInTheDocument();
  expect(await screen.findByText("PREBOOK-1")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Booked By" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Cancels At" })).not.toBeInTheDocument();
  expect(screen.getByText("Loaded")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View status for PREBOOK-1" })).toHaveClass("bg-sky-100");
  expect(screen.getByText("Jon")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Move to Recovery" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "RC" })[0]).toBeEnabled();
  const note = screen.getByRole("button", { name: "View prebook note for PREBOOK-1" });
  expect(note).toHaveClass("truncate");
  fireEvent.click(note);
  expect(screen.getByRole("dialog")).toHaveTextContent("Call tomorrow");
  expect(screen.queryByRole("textbox", { name: "Prebook note" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByText("RECOVERY-1")).not.toBeInTheDocument();
  expect(screen.getByText("CANCELED-1")).toBeInTheDocument();
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
  await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ p_status: "Available", canceled: false }, "id", "p"));
});

it("offers only Available, Covered and Canceled and saves the canceled flag", async () => {
  access.role = "admin";
  render(<QueryClientProvider client={new QueryClient()}><RecoveryLoads /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "View status for PREBOOK-1" }));
  expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Available", "Covered", "Canceled"]);
  expect(screen.getByRole("combobox", { name: "Prebook status" })).toHaveValue("Covered");
  fireEvent.change(screen.getByRole("combobox", { name: "Prebook status" }), { target: { value: "Canceled" } });
  fireEvent.click(screen.getByRole("button", { name: "Save status" }));
  await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ p_status: "Canceled", canceled: true }, "id", "p"));
});
