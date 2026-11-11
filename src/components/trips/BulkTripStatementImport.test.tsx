import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkTripStatementImport } from "./BulkTripStatementImport";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), range: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/tripStatement", async original => ({ ...await original<object>(), readStatement: mocks.read }));
vi.mock("@/lib/saveTripStatement", () => ({ insertTripStatement: mocks.save }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const chain = { select: () => chain, order: () => chain, in: () => chain, range: (...args: number[]) => mocks.range(table, ...args) };
  return chain;
} } }));
const result = (driver = "Edward Butcher", truck = "3135", amount: number | null = 1294.03) => ({ amount, lines: ["Issue date 11/5/26", "Pay Period 10/20/2026-10/26/2026", `Driver name ${driver}`, `Truck number ${truck}`] });
function setup(canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BulkTripStatementImport canEdit={canEdit} /></QueryClientProvider>);
  if (canEdit) fireEvent.click(screen.getByRole("button", { name: "Bulk import salaries" }));
}
function select(files = [new File(["x"], "3135 Edward Butcher 11-5-2026.pdf")], folder = false) {
  fireEvent.change(screen.getByLabelText(folder ? "Choose salary folder" : "Choose salary PDFs"), { target: { files } });
}
beforeEach(() => {
  vi.resetAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  mocks.read.mockResolvedValue(result());
  mocks.save.mockResolvedValue(undefined);
  mocks.range.mockImplementation((table: string) => Promise.resolve({ data: table === "drivers" ? [{ id: "1", name: "Edward Butcher", company_name: "UES" }, { id: "2", name: "Donald Young", company_name: "BF" }] : table === "trucks" ? [{ truck_number: "3135" }, { truck_number: "5931" }] : [], error: null }));
});
describe("bulk salary folder import", () => {
  it("previews mixed companies and saves both PDFs to their actual pay week", async () => {
    mocks.read.mockResolvedValueOnce(result()).mockResolvedValueOnce(result("Donald Young", "5931", 0));
    setup();
    select([new File(["x"], "Edward.pdf"), new File(["x"], "Donald.PDF"), new File(["x"], "readme.txt")], true);
    const button = await screen.findByRole("button", { name: "Import 2 statements" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByLabelText("Week starting 1")).toHaveValue("2026-10-20");
    expect(screen.getByLabelText("Paid amount 2")).toHaveValue("0.00");
    expect(screen.getByText("Ignored 1 non-PDF file(s).")).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save).toHaveBeenNthCalledWith(1, expect.any(File), expect.objectContaining({ driverName: "Edward Butcher", truckNumber: "3135", weekStart: "2026-10-20", amount: 1294.03 }));
    expect(mocks.save).toHaveBeenNthCalledWith(2, expect.any(File), expect.objectContaining({ driverName: "Donald Young", truckNumber: "5931", amount: 0 }));
    await waitFor(() => expect(screen.getAllByText("Imported")).toHaveLength(2));
  });
  it("blocks duplicates until one copy is unchecked", async () => {
    setup(); select([new File(["x"], "one.pdf"), new File(["x"], "two.pdf")]);
    await screen.findByLabelText("Driver 2");
    await waitFor(() => expect(screen.getAllByText(/Duplicate in this folder/)).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Import 0 statements" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Import two.pdf"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 1 statement" })).toBeEnabled());
  });
  it("skips an existing statement instead of replacing it", async () => {
    const original = mocks.range.getMockImplementation()!;
    mocks.range.mockImplementation((table: string) => table === "trip_week_statements" ? Promise.resolve({ data: [{ truck_number: "3135", driver_name: "Edward Butcher", week_start: "2026-10-20" }], error: null }) : original(table));
    setup(); select();
    await screen.findByText("Statement already exists — skipped");
    expect(screen.getByRole("button", { name: "Import 0 statements" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("allows correction of an unmatched name, missing amount, and missing pay period", async () => {
    mocks.read.mockResolvedValue({ amount: null, lines: ["Driver name Ed Butcher", "Truck number 3135", "Issue date 11/5/26"] });
    setup(); select();
    await screen.findByLabelText("Driver 1");
    expect(screen.getByRole("button", { name: "Import 0 statements" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Driver 1"), { target: { value: "Edward Butcher" } });
    fireEvent.change(screen.getByLabelText("Week starting 1"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Paid amount 1"), { target: { value: "-125.00" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 1 statement" })).toBeEnabled());
    expect(screen.getByLabelText("Week ending 1")).toHaveValue("2026-10-26");
  });
  it("retains per-file failures and retries only failed files", async () => {
    mocks.read.mockResolvedValueOnce(result()).mockResolvedValueOnce(result("Donald Young", "5931"));
    mocks.save.mockRejectedValueOnce(new Error("Upload failed")).mockResolvedValue(undefined);
    setup(); select([new File(["x"], "one.pdf"), new File(["x"], "two.pdf")]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 2 statements" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Import 2 statements" }));
    await screen.findByText("Upload failed");
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 1 statement" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Import 1 statement" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][0].name).toBe("one.pdf");
    await waitFor(() => expect(screen.getAllByText("Imported")).toHaveLength(2));
  });
  it("does not allow import while reading or after PDF/read checks fail", async () => {
    let finish!: (value: unknown) => void;
    mocks.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setup(); select();
    expect(screen.getByRole("button", { name: "Import 0 statements" })).toBeDisabled();
    finish({ amount: null, lines: [] });
    await screen.findByText(/PDF has no readable text/);
    expect(screen.getByRole("button", { name: "Import 0 statements" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("fails closed when reference checks are unavailable", async () => {
    mocks.range.mockResolvedValue({ data: null, error: new Error("Forbidden") });
    setup(); select();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Import 0 statements" })).toBeDisabled();
  });
  it("offers no bulk import or data access to a reader", () => {
    setup(false);
    expect(screen.queryByRole("button", { name: "Bulk import salaries" })).not.toBeInTheDocument();
    expect(mocks.range).not.toHaveBeenCalled();
  });
});
