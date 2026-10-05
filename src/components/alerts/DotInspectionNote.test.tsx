import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DotInspectionNote } from "./DotInspectionNote";
const mocks = vi.hoisted(() => ({ update: vi.fn(), select: vi.fn(), invalidate: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: mocks.update }) } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
describe("DOT inspection note", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.update.mockReturnValue({ eq: () => ({ select: mocks.select }) }); mocks.select.mockResolvedValue({ data: [{ id: "unit" }], error: null }); });
  it.each(["trucks", "trailers"] as const)("saves only the %s DOT note", async (table) => {
    render(<DotInspectionNote table={table} id="unit" unit="123" note={null} canEdit />);
    fireEvent.click(screen.getByText("Add note"));
    fireEvent.change(screen.getByLabelText("DOT inspection note"), { target: { value: "  Scheduled Tuesday  " } });
    fireEvent.click(screen.getByText("Save note"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ dot_inspection_note: "Scheduled Tuesday" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: [`expiring-${table}`] }));
  });
  it("allows viewing but not editing for view-only users", () => {
    render(<DotInspectionNote table="trucks" id="unit" unit="123" note="Scheduled" canEdit={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.getByLabelText("DOT inspection note")).toHaveAttribute("readonly");
    expect(screen.queryByText("Save note")).toBeNull();
  });
  it("reports a denied update without pretending to save", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    render(<DotInspectionNote table="trucks" id="unit" unit="123" note={null} canEdit />);
    fireEvent.click(screen.getByText("Add note"));
    fireEvent.click(screen.getByText("Save note"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
