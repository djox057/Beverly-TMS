import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EfsRequestDialog } from "./EfsRequestDialog";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), refetch: vi.fn(), close: vi.fn(), migrated: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke }, from: () => ({ select: () => ({ limit: () => Promise.resolve({ error: mocks.migrated ? null : { code: "42703", message: "column purpose_detail does not exist" } }) }) }) } }));
vi.mock("@/hooks/useDriverCashAdvance", () => ({ useDriverCashAdvance: () => ({ data: { weeklyAmount: 0, remainingAmount: 150, canRequest: true }, refetch: mocks.refetch, isLoading: false }) }));
vi.mock("@/hooks/useDriverMissingFuelReceipt", () => ({ useDriverMissingFuelReceipt: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => <select aria-label="Purpose category" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>, SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));
const show = () => render(<QueryClientProvider client={new QueryClient()}><EfsRequestDialog open onOpenChange={mocks.close} driverId="driver" driverName="Tyrell Lipscomb" truckNumber="7348" trailerNumber="407613" companyName="BF Prime LLC" /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); mocks.migrated = true; mocks.invoke.mockResolvedValue({ data: { success: true }, error: null }); });
afterEach(cleanup);
it("requires and submits a detailed purpose for a cash advance", async () => {
  show(); const request = screen.getByRole("button", { name: "Request $50" });
  expect(request).toBeDisabled();
  fireEvent.change(await screen.findByLabelText("Detailed purpose in English (required)"), { target: { value: "Cash Advance" } });
  expect(request).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Detailed purpose in English (required)"), { target: { value: "Meals and personal expenses for this week" } });
  await waitFor(() => expect(request).toBeEnabled());
  fireEvent.click(request);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("send-cash-advance-request", { body: expect.objectContaining({ purposeDetail: "Meals and personal expenses for this week", truckNumber: "7348", amount: 50 }) }));
});
it("includes the assigned trailer and the named shop address for trailer repairs", async () => {
  show(); fireEvent.mouseDown(screen.getByRole("tab", { name: "Other" }), { button: 0, ctrlKey: false });
  fireEvent.change(await screen.findByRole("combobox", { name: "Purpose category" }), { target: { value: "repairs" } });
  fireEvent.change(await screen.findByLabelText("Detailed purpose in English (required)"), { target: { value: "Trailer alignment" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "This is a trailer repair" }));
  expect(screen.getByLabelText("Trailer number (required)")).toHaveValue("407613");
  fireEvent.change(screen.getByLabelText("Business name (required)"), { target: { value: "All American Truck & Trailer" } });
  fireEvent.change(screen.getByLabelText("Full address (required)"), { target: { value: "4425 Stickney Ave, Toledo, OH 43612" } });
  fireEvent.change(screen.getByLabelText("Amount ($)"), { target: { value: "608.49" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Request" }));
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("send-efs-other-request", { body: expect.objectContaining({ purposeDetail: "Trailer alignment", isTrailerRepair: true, trailerNumber: "407613", amount: 608.49, locationName: "All American Truck & Trailer", locationAddress: "4425 Stickney Ave, Toledo, OH 43612" }) }));
});

it("preserves existing cash requests before the Money Code migration", async () => {
  mocks.migrated = false; show();
  expect(await screen.findByText(/Saved Money Code details are pending a database update/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Detailed purpose in English (required)")).not.toBeInTheDocument();
  const request = screen.getByRole("button", { name: "Request $50" });
  await waitFor(() => expect(request).toBeEnabled()); fireEvent.click(request);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
  expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty("purposeDetail");
});
