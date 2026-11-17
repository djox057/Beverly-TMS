import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AssignTransferDriverDialog } from "./AssignTransferDriverDialog";

vi.mock("@/hooks/useAvailableTrucks", () => ({ useAvailableTrucks: () => ({ data: [
  { id: "truck-1", truck_number: "1001", driver1_id: "regular-driver" },
] }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ data: [
  { id: "recovery-driver", name: "Recovery Driver", is_recovery: true },
  { id: "regular-driver", name: "Regular Driver", is_recovery: false },
] }) }));
vi.mock("@/components/ui/combobox", () => ({ Combobox: ({ options, value, onValueChange, placeholder, disabled }: any) => (
  <select aria-label={placeholder} value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
) }));
afterEach(cleanup);

function openDialog(extra = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  const onOpenChange = vi.fn();
  render(<AssignTransferDriverDialog open onOpenChange={onOpenChange} onSave={onSave}
    originalDriverName="Original Driver" originalTruckNumber="999" originalTrailerNumber="123"
    originalMiles={921} originalDriverPrice={1200} recoveryMiles={505}
    yardLoadTrailerId="trailer-1" yardLoadTrailerNumber="123" {...extra} />);
  return { onSave, onOpenChange };
}

it("allows a recovery driver without a truck and submits a null truck ID", async () => {
  const { onSave } = openDialog();
  fireEvent.change(screen.getByRole("combobox", { name: "Select driver" }), { target: { value: "recovery-driver" } });
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "350" } });
  expect(screen.getByText("Truck (optional)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Assign Transfer Driver" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    transferDriverId: "recovery-driver", transferTruckId: null, transferTrailerId: "trailer-1", recoveryDriverPrice: 350,
  })));
});

it("requires a truck for a regular driver", () => {
  const { onSave } = openDialog();
  fireEvent.change(screen.getByRole("combobox", { name: "Select driver" }), { target: { value: "regular-driver" } });
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "350" } });
  fireEvent.click(screen.getByRole("button", { name: "Assign Transfer Driver" }));
  expect(screen.getByText(/Only recovery drivers can be assigned without a truck/)).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

it("requires a driver even when a truck is selected", () => {
  const { onSave } = openDialog();
  fireEvent.change(screen.getByRole("combobox", { name: "Select truck" }), { target: { value: "truck-1" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Select driver" }), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Assign Transfer Driver" }));
  expect(screen.getByText("Please select a transfer driver")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

it("adds a truck later while preserving the recovery driver, trailer, miles and rate", async () => {
  const { onSave } = openDialog({ assignedDriverId: "recovery-driver", assignedDriverName: "Recovery Driver", assignedDriverPrice: 350 });
  expect(screen.getByRole("combobox", { name: "Select driver" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Assign Truck" }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Select truck" }), { target: { value: "truck-1" } });
  expect(screen.getByRole("combobox", { name: "Select driver" })).toHaveValue("recovery-driver");
  fireEvent.click(screen.getByRole("button", { name: "Assign Truck" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    transferTruckId: "truck-1", transferDriverId: "recovery-driver", transferTrailerId: "trailer-1", recoveryMiles: 505, recoveryDriverPrice: 350,
  })));
});

it("keeps the dialog open when saving fails", async () => {
  const onSave = vi.fn().mockResolvedValue(false);
  const { onOpenChange } = openDialog({ onSave });
  fireEvent.change(screen.getByRole("combobox", { name: "Select driver" }), { target: { value: "recovery-driver" } });
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "350" } });
  fireEvent.click(screen.getByRole("button", { name: "Assign Transfer Driver" }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onOpenChange).not.toHaveBeenCalled();
});
