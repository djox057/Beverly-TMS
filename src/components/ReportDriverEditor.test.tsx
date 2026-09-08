import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDriverEditor } from "./ReportDriverEditor";

const db = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), single: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: db }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ user: { id: "staff-a" } }) }));
vi.mock("@/components/EditDriverDialog", () => ({
  EditDriverDialog: ({ driver, onSuccess, onOpenChange }: any) => (
    <div>
      <span>{driver.name}</span>
      <input aria-label="Driver phone" defaultValue={driver.phone} />
      <button onClick={() => { onOpenChange(false); onSuccess(); }}>Save driver</button>
    </div>
  ),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockReturnValue(db);
  db.select.mockReturnValue(db);
  db.eq.mockReturnValue(db);
  db.abortSignal.mockReturnValue(db);
  db.single.mockResolvedValue({ data: { id: "driver-a", name: "Ann", phone: "123" }, error: null });
});

describe("Reports driver editor", () => {
  it("does no work while closed, fetches one driver on open, and refreshes Reports after saving", async () => {
    const client = new QueryClient();
    const close = vi.fn();
    const surface = (open: boolean) => (
      <QueryClientProvider client={client}>
        {open && <ReportDriverEditor driverId="driver-a" onClose={close} />}
      </QueryClientProvider>
    );
    const { rerender } = render(surface(false));
    expect(db.from).not.toHaveBeenCalled();
    rerender(surface(true));
    expect(await screen.findByText("Ann")).toBeInTheDocument();
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith("drivers");
    expect(db.eq).toHaveBeenCalledWith("id", "driver-a");
    expect(db.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    fireEvent.change(screen.getByLabelText("Driver phone"), { target: { value: "unsaved edit" } });
    fireEvent.focus(window);
    expect(screen.getByLabelText("Driver phone")).toHaveValue("unsaved edit");
    expect(db.from).toHaveBeenCalledTimes(1);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByText("Save driver"));
    expect(close).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["adapter-drivers"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["adapter-trucks"] });
    rerender(surface(false));
    client.clear();
  });

  it("shows a retryable failure instead of opening an empty editable form", async () => {
    db.single.mockResolvedValue({ data: null, error: new Error("unavailable") });
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    render(<QueryClientProvider client={client}><ReportDriverEditor driverId="driver-a" onClose={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("Try again")).toBeInTheDocument());
    expect(screen.queryByText("Save driver")).not.toBeInTheDocument();
    db.single.mockResolvedValue({ data: { id: "driver-a", name: "Ann" }, error: null });
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("Ann")).toBeInTheDocument();
    client.clear();
  });
});

