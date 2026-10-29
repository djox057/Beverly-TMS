import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EfsRequestDialog } from "./EfsRequestDialog";
import { FunctionsHttpError } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), refetch: vi.fn(), close: vi.fn(), toast: vi.fn(), recoveryLookup: vi.fn(), migrated: true, missingReceipts: [] as any[], receiptsLoading: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke }, from: (table: string) => ({ select: () => table === "drivers" ? { eq: () => ({ maybeSingle: mocks.recoveryLookup }) } : { limit: () => Promise.resolve({ error: mocks.migrated ? null : { code: "42703", message: "column purpose_detail does not exist" } }) } }) } }));
vi.mock("@/hooks/useDriverCashAdvance", () => ({ useDriverCashAdvance: () => ({ data: { weeklyAmount: 0, remainingAmount: 200, canRequest: true }, refetch: mocks.refetch, isLoading: false }) }));
vi.mock("@/hooks/useDriverMissingFuelReceipt", () => ({ useDriverMissingFuelReceipt: () => ({ data: mocks.missingReceipts, isLoading: mocks.receiptsLoading }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => <select aria-label="Purpose category" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>, SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));
const show = (truckNumber = "7348") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EfsRequestDialog open onOpenChange={mocks.close} driverId="driver" driverName="Tyrell Lipscomb" truckNumber={truckNumber} trailerNumber="407613" companyName="BF Prime LLC" /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); mocks.migrated = true; mocks.missingReceipts = []; mocks.receiptsLoading = false; mocks.recoveryLookup.mockResolvedValue({ data: { is_recovery: false }, error: null }); mocks.invoke.mockResolvedValue({ data: { success: true }, error: null }); });
afterEach(cleanup);
it("automatically submits Cash advance as the explanation", async () => {
  show(); const request = screen.getByRole("button", { name: "Request $50" });
  expect(screen.queryByLabelText("Explanation (required)")).not.toBeInTheDocument();
  expect(screen.queryByText("Explanation: Cash advance")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Business name/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Full address/)).not.toBeInTheDocument();
  await waitFor(() => expect(request).toBeEnabled()); fireEvent.click(request);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("send-cash-advance-request", { body: expect.objectContaining({ purposeDetail: "Cash advance", amount: 50 }) }));
});
it("includes the assigned trailer and the named shop address for trailer repairs", async () => {
  show(); fireEvent.mouseDown(screen.getByRole("tab", { name: "Other" }), { button: 0, ctrlKey: false });
  fireEvent.change(await screen.findByRole("combobox", { name: "Purpose category" }), { target: { value: "repairs" } });
  fireEvent.change(await screen.findByLabelText("Explanation (required)"), { target: { value: "Trailer alignment" } });
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
  expect(screen.queryByLabelText("Explanation (required)")).not.toBeInTheDocument();
  const request = screen.getByRole("button", { name: "Request $50" });
  await waitFor(() => expect(request).toBeEnabled()); fireEvent.click(request);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
  expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty("purposeDetail");
});

async function fillFuel(custom = false) {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Other" }), { button: 0, ctrlKey: false });
  fireEvent.change(await screen.findByRole("combobox", { name: "Purpose category" }), { target: { value: custom ? "custom" : "fuel" } });
  if (custom) fireEvent.change(screen.getByLabelText("Custom Purpose"), { target: { value: " fuel " } });
  fireEvent.change(await screen.findByLabelText("Explanation (required)"), { target: { value: "Diesel purchase for next trip" } });
  fireEvent.change(screen.getByLabelText("Business name (required)"), { target: { value: "Pilot" } });
  fireEvent.change(screen.getByLabelText("Full address (required)"), { target: { value: "123 Main Street, Blue Island IL" } });
  fireEvent.change(await screen.findByLabelText("City"), { target: { value: "Blue Island" } });
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "il" } });
  fireEvent.change(screen.getByLabelText("Amount ($)"), { target: { value: "300" } });
}

it.each(["", "5607"])("lets a verified recovery driver request fuel with missing receipts and truck '%s'", async truck => {
  mocks.recoveryLookup.mockResolvedValue({ data: { is_recovery: true }, error: null });
  mocks.missingReceipts = [{ id: "previous-request" }];
  mocks.receiptsLoading = true;
  show(truck); await fillFuel();
  const send = screen.getByRole("button", { name: "Send Request" });
  await waitFor(() => expect(send).toBeEnabled());
  expect(screen.queryByText(/Fuel request blocked:/)).not.toBeInTheDocument();
  fireEvent.click(send);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("send-efs-other-request", { body: expect.objectContaining({ truckNumber: truck, purpose: "Fuel", city: "Blue Island", state: "IL", amount: 300 }) }));
});

it.each([false, null])("keeps the receipt blocker for non-recovery or unknown drivers (%s)", async recovery => {
  mocks.recoveryLookup.mockResolvedValue({ data: { is_recovery: recovery }, error: null });
  mocks.missingReceipts = [{ id: "previous-request" }];
  show(); await fillFuel();
  await waitFor(() => expect(mocks.recoveryLookup).toHaveBeenCalled());
  expect(screen.getByText(/Fuel request blocked:/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send Request" })).toBeDisabled();
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("submits city and state for Custom fuel, matching the backend validation", async () => {
  mocks.recoveryLookup.mockResolvedValue({ data: { is_recovery: true }, error: null });
  mocks.missingReceipts = [{ id: "previous-request" }];
  show(""); await fillFuel(true);
  const send = screen.getByRole("button", { name: "Send Request" });
  await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("send-efs-other-request", { body: expect.objectContaining({ truckNumber: "", purpose: "fuel", city: "Blue Island", state: "IL" }) }));
});

it("keeps fuel disabled while verifying recovery status", async () => {
  mocks.recoveryLookup.mockReturnValue(new Promise(() => {}));
  mocks.missingReceipts = [{ id: "previous-request" }];
  show(); await fillFuel();
  await screen.findByLabelText("Explanation (required)");
  expect(screen.queryByText(/Fuel request blocked:/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send Request" })).toBeDisabled();
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it.each(["scale_ticket", "escort", "truck_wash", "straps", "repairs"])("submits %s for a recovery driver without a truck", async purpose => {
  mocks.recoveryLookup.mockResolvedValue({ data: { is_recovery: true }, error: null });
  show("");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Other" }), { button: 0, ctrlKey: false });
  fireEvent.change(await screen.findByRole("combobox", { name: "Purpose category" }), { target: { value: purpose } });
  const explanation = await screen.findByLabelText("Explanation (required)");
  fireEvent.change(explanation, { target: { value: "Equipment purchase for next trip" } });
  if (purpose === "repairs") {
    fireEvent.change(screen.getByLabelText("Business name (required)"), { target: { value: "Shop" } });
    fireEvent.change(screen.getByLabelText("Full address (required)"), { target: { value: "123 Main Street, Blue Island IL" } });
  }
  fireEvent.change(screen.getByLabelText("Amount ($)"), { target: { value: "50" } });
  const send = screen.getByRole("button", { name: "Send Request" });
  await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("send-efs-other-request", { body: expect.objectContaining({ truckNumber: "", driverId: "driver", amount: 50 }) }));
});

it("lets regular drivers request fuel when no receipt is missing", async () => {
  show(); await fillFuel();
  const send = screen.getByRole("button", { name: "Send Request" });
  await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
});

it("does not grant an exemption when the recovery lookup fails", async () => {
  mocks.recoveryLookup.mockResolvedValue({ data: null, error: new Error("Lookup unavailable") });
  show(); await fillFuel();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not check the driver's recovery status");
  expect(screen.getByRole("button", { name: "Send Request" })).toBeDisabled();
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("shows the backend validation reason instead of a generic non-2xx error", async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: "Fuel requests require city and state" }), { status: 400 })) });
  show(); await fillFuel();
  const send = screen.getByRole("button", { name: "Send Request" });
  await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send);
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Fuel requests require city and state", variant: "destructive" })));
});

it("blocks other requests when explanation storage is unavailable", async () => {
  mocks.migrated = false; show();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Other" }), { button: 0, ctrlKey: false });
  fireEvent.change(await screen.findByRole("combobox", { name: "Purpose category" }), { target: { value: "escort" } });
  fireEvent.change(screen.getByLabelText("Amount ($)"), { target: { value: "50" } });
  expect(screen.getByRole("button", { name: "Send Request" })).toBeDisabled();
});
