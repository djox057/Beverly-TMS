import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripStatementDialog, StatementTarget } from "./TripStatementDialog";
const mocks = vi.hoisted(() => ({ read: vi.fn(), upload: vi.fn(), remove: vi.fn(), insert: vi.fn(), update: vi.fn(), single: vi.fn(), signed: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/tripStatement", async importOriginal => ({ ...await importOriginal<object>(), readStatement: mocks.read }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.signed }) },
  from: () => ({ insert: mocks.insert, update: mocks.update }),
} }));
const target: StatementTarget = { truckNumber: "3135", driverName: "Test Driver", weekStart: "2026-10-20", mode: "upload" };
function setup(canEdit = true, customTarget = target) {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const chain = { select: () => ({ single: mocks.single }), eq: () => chain };
  mocks.insert.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  render(<QueryClientProvider client={client}><TripStatementDialog target={customTarget} canEdit={canEdit} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}
async function selectStatement() {
  fireEvent.change(screen.getByLabelText("Statement (PDF or XLSX)"), { target: { files: [new File(["statement"], "weekly.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(screen.getByLabelText("Paid amount")).toHaveValue("1294.03"));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ amount: 1294.03 });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.single.mockResolvedValue({ data: { id: "saved" }, error: null });
  mocks.remove.mockResolvedValue({ error: null });
});
describe("weekly statement upload", () => {
  it("stores the extracted payment and uploaded file against the selected week", async () => {
    const close = setup();
    await selectStatement();
    fireEvent.click(screen.getByRole("button", { name: "Save statement" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ truck_number: "3135", driver_name: "Test Driver", week_start: "2026-10-20", paid_amount: 1294.03, file_name: "weekly.pdf" }));
  });
  it("cleans up the new upload when saving metadata fails", async () => {
    mocks.single.mockResolvedValue({ error: { message: "conflict" } });
    const close = setup();
    await selectStatement();
    fireEvent.click(screen.getByRole("button", { name: "Save statement" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
    expect(close).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
  });
  it("allows correction of an unrecognized total, including zero", async () => {
    mocks.read.mockResolvedValue({ amount: null });
    setup();
    fireEvent.change(screen.getByLabelText("Statement (PDF or XLSX)"), { target: { files: [new File(["x"], "weekly.pdf")] } });
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Save statement" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Paid amount"), { target: { value: "0.00" } });
    expect(screen.getByRole("button", { name: "Save statement" })).toBeEnabled();
  });
  it("never enables uploads for a reader", async () => {
    setup(false);
    await selectStatement();
    expect(screen.getByRole("button", { name: "Save statement" })).toBeDisabled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
