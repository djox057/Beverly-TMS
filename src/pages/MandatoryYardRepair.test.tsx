import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MandatoryYardRepair from "./MandatoryYardRepair";
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
HTMLElement.prototype.scrollIntoView = vi.fn();
const mocks = vi.hoisted(() => ({ roles: ["maintenance"], save: vi.fn(), task: {
  id: "task-1", truck_id: "truck-1", driver_id: "driver-1", service_type: "mandatory_yard_repair", description: "Repair brakes", due_date: "2026-10-04", reported_date: "2026-09-28", reported_by_name: "Maintenance Worker", dispatch_informed: false, status: "pending", status_note: ""
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ roles: mocks.roles }) }));
vi.mock("@/hooks/useMandatoryYardRepairs", () => ({
  YARD_REPAIR_EDIT_ROLES: ["admin", "manager", "maintenance"],
  useChicagoToday: () => "2026-10-05",
  useMandatoryYardRepairs: () => ({ tasks: [mocks.task], save: { mutateAsync: mocks.save, isPending: false }, notifyDispatcher: { mutate: vi.fn(), isPending: false }, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useTrucks", () => ({ useTrucks: () => ({ data: [{ id: "truck-1", truck_number: "7346", driver1_id: "driver-1", dispatcher: { full_name: "Assigned Dispatcher" } }] }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ data: [{ id: "driver-1", name: "Driver Name" }] }) }));

describe("Mandatory Yard Repair page", () => {
  beforeEach(() => { mocks.roles = ["maintenance"]; mocks.save.mockReset().mockResolvedValue({}); });
  it("shows driver, current dispatch, original reporter/date, and overdue unit", () => {
    render(<MandatoryYardRepair />);
    expect(screen.getByText("7346")).toHaveClass("text-red-600");
    for (const text of ["Driver Name", "Assigned Dispatcher", "Maintenance Worker", "09/28/2026", "Overdue"]) expect(screen.getByText(text)).toBeInTheDocument();
  });
  it("asks for the unit first and autofills its driver without a Type field", async () => {
    render(<MandatoryYardRepair />);
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));
    expect(screen.getByRole("button", { name: "Save Task" })).toBeDisabled();
    fireEvent.click(screen.getByText("Select unit number"));
    fireEvent.click(screen.getByRole("option", { name: "7346" }));
    expect(within(screen.getByRole("dialog")).getByText("7346")).toBeInTheDocument();
    expect(screen.getByLabelText("Driver")).toHaveValue("Driver Name");
    expect(screen.getByLabelText("Driver")).toHaveAttribute("readonly");
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Description of the Problem *"), { target: { value: "Inspect steering" } });
    fireEvent.change(screen.getByLabelText("Due Date *"), { target: { value: "2026-10-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Task" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ values: { truck_id: "truck-1", driver_id: "driver-1", due_date: "2026-10-12", description: "Inspect steering", service_type: "mandatory_yard_repair" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("retains automatic audit fields when a task is edited", async () => {
    render(<MandatoryYardRepair />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Description of the Problem *"), { target: { value: "Replace brakes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Task" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const request = mocks.save.mock.calls[0][0];
    expect(request.id).toBe("task-1");
    expect(request.values.description).toBe("Replace brakes");
    expect(request.values).not.toHaveProperty("reported_date");
    expect(request.values).not.toHaveProperty("reported_by_name");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("retains edits when saving fails", async () => {
    mocks.save.mockRejectedValue(new Error("Network failure"));
    render(<MandatoryYardRepair />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Status Note"), { target: { value: "Waiting for parts" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Task" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Status Note")).toHaveValue("Waiting for parts");
  });
  it("makes dispatch and Chicago management read only", () => {
    for (const role of ["dispatch", "supervisor", "chicago_management"]) {
      mocks.roles = [role];
      const { unmount } = render(<MandatoryYardRepair />);
      expect(screen.queryByRole("button", { name: "Add Task" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      unmount();
    }
  });
});
