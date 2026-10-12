import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryDrugTestSection } from "./RecoveryDrugTestSection";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  upsert: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: db.select, upsert: db.upsert }) },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: db.toast }));

const companies = [{ id: "bf", name: "BF Prime LLC" }, { id: "bg", name: "BG Prime Inc" }];
function show(props: Partial<React.ComponentProps<typeof RecoveryDrugTestSection>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RecoveryDrugTestSection driverId="recovery-driver" isRecovery companies={companies} canManage={false} canView {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.select.mockReturnValue({ eq: db.eq });
  db.eq.mockResolvedValue({ data: [{ company_id: "bf", is_tested: true }], error: null });
  db.upsert.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Recovery company drug test permissions", () => {
  it("shows checked statuses and missing companies read-only without seeding records", async () => {
    show();
    const bf = await screen.findByRole("checkbox", { name: "BF Prime LLC" });
    expect(bf).toBeChecked();
    expect(bf).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "BG Prime Inc" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "BG Prime Inc" })).toBeDisabled();
    fireEvent.click(bf);
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.eq).toHaveBeenCalledWith("driver_id", "recovery-driver");
  });

  it("keeps authorized editing and missing-company initialization working", async () => {
    show({ canManage: true });
    const bg = await screen.findByRole("checkbox", { name: "BG Prime Inc" });
    expect(bg).toBeEnabled();
    expect(db.upsert).toHaveBeenCalledWith([{ driver_id: "recovery-driver", company_id: "bg", is_tested: false }]);
    fireEvent.click(bg);
    await waitFor(() => expect(db.upsert).toHaveBeenCalledWith({ driver_id: "recovery-driver", company_id: "bg", is_tested: true }));
  });

  it.each([
    { canView: false },
    { isRecovery: false },
    { driverId: undefined },
  ])("does not show or fetch tests when access or recovery eligibility is absent: %j", (props) => {
    show(props);
    expect(screen.queryByText("Drug Tests by Company")).not.toBeInTheDocument();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("does not display failed reads as unchecked test statuses", async () => {
    db.eq.mockResolvedValue({ data: null, error: new Error("read failed") });
    show();
    expect(await screen.findByText("Could not load company drug tests.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
