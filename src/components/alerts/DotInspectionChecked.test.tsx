import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DotInspectionChecked } from "./DotInspectionChecked";
const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), select: vi.fn(), invalidate: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
describe("DOT checked control", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.from.mockReturnValue({ update: mocks.update }); mocks.update.mockReturnValue({ eq: () => ({ select: mocks.select }) }); mocks.select.mockResolvedValue({ data: [{ id: "unit" }], error: null }); });
  it.each(["trucks", "trailers"] as const)("checks and unchecks only the %s DOT flag", async (table) => {
    const props = { table, id: "unit", unit: "123", canEdit: true };
    const { rerender } = render(<DotInspectionChecked {...props} checked={false} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "DOT reminders paused" })));
    expect(mocks.from).toHaveBeenCalledWith(table);
    expect(mocks.update).toHaveBeenCalledWith({ dot_inspection_checked: true });
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeDisabled());
    rerender(<DotInspectionChecked {...props} checked />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ dot_inspection_checked: false }));
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: [`expiring-${table}`] });
  });
  it("disables checking for view-only users", () => {
    render(<DotInspectionChecked table="trucks" id="unit" unit="123" checked={false} canEdit={false} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps unchecked and reports a denied update", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    render(<DotInspectionChecked table="trucks" id="unit" unit="123" checked={false} canEdit />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
