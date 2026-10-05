import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMandatoryYardRepairs, type YardRepairInput } from "./useMandatoryYardRepairs";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), update: vi.fn(), single: vi.fn(), warning: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ roles: [], user: null }) }));
vi.mock("@/hooks/realtimeBus", () => ({ subscribeTable: vi.fn() }));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning, success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => ({ insert: mocks.insert, update: mocks.update }),
} }));
const values: YardRepairInput = { truck_id: "truck-1", driver_id: "driver-1", service_type: "mandatory_yard_repair", description: "Repair brakes", due_date: "2026-10-12", status: "pending", dispatch_informed: false, status_note: "" };
function hook() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useMandatoryYardRepairs(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
describe("repair creation and email integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { select: () => ({ single: mocks.single }) };
    mocks.insert.mockReturnValue(query);
    mocks.update.mockReturnValue({ eq: () => query });
    mocks.single.mockResolvedValue({ data: { id: "task-1", ...values }, error: null });
    mocks.invoke.mockResolvedValue({ data: { sent: true }, error: null });
  });
  it("emails the dispatcher once after a successful creation", async () => {
    const { result } = hook();
    await act(async () => { await result.current.save.mutateAsync({ values }); });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("notify-mandatory-yard-repair", { body: { taskId: "task-1" } });
  });
  it("retains the saved task and shows retry guidance if the email fails", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Unavailable") });
    const { result } = hook();
    await act(async () => { const saved = await result.current.save.mutateAsync({ values }); expect(saved.id).toBe("task-1"); });
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("Task saved"));
    expect(mocks.insert).toHaveBeenCalledOnce();
  });
  it("does not email on ordinary edits or when database creation fails", async () => {
    const { result } = hook();
    await act(async () => { await result.current.save.mutateAsync({ id: "task-1", values }); });
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.single.mockResolvedValue({ data: null, error: new Error("DB failure") });
    await act(async () => { await expect(result.current.save.mutateAsync({ values })).rejects.toThrow("DB failure"); });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("retries an existing task's email without creating another task", async () => {
    const { result } = hook();
    await act(async () => { await result.current.notifyDispatcher.mutateAsync("task-1"); });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("notify-mandatory-yard-repair", { body: { taskId: "task-1" } });
  });
});
