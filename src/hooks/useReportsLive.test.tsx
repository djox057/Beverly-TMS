import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ channels: [] as any[], select: vi.fn(), removeChannel: vi.fn(), user: { id: "u1" } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ user: mock.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: mock.select }), removeChannel: mock.removeChannel,
  channel: () => {
    const channel: any = { on: vi.fn((_type, _filter, callback) => { channel.event = callback; return channel; }),
      subscribe: vi.fn(callback => { channel.status = callback; return channel; }) };
    mock.channels.push(channel); return channel;
  },
} }));
import { REPORTS_LIVE_SOURCES, useReportsLive } from "./useReportsLive";
const snapshot = (versions: Record<string, number> = {}) => ({ data: REPORTS_LIVE_SOURCES.map(source => ({ source, revision: versions[source] || 0 })), error: null });
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("Reports live transport", () => {
  beforeEach(() => {
    vi.useFakeTimers(); mock.channels.length = 0; mock.user = { id: "u1" };
    mock.select.mockReset().mockResolvedValue(snapshot()); mock.removeChannel.mockReset();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });
  afterEach(() => vi.useRealTimers());
  it("connects once, reconciles initial data, and uses keys only for consecutive changes", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result, rerender, unmount } = renderHook(() => useReportsLive(true, refresh));
    await act(async () => { mock.channels[0].status("SUBSCRIBED"); });
    await tick(500);
    expect(refresh.mock.calls[0][0].get("drivers")).toBeNull();
    expect(result.current).toBe("live"); rerender();
    expect(mock.channels).toHaveLength(1);
    act(() => mock.channels[0].event({ new: { source: "orders", revision: 1, keys: ["o1"] } }));
    await tick(500);
    expect([...refresh.mock.calls[1][0].get("orders")]).toEqual(["o1"]);
    act(() => mock.channels[0].event({ new: { source: "orders", revision: 3, keys: ["o3"] } }));
    await tick(500);
    expect(refresh.mock.calls[2][0].get("orders")).toBeNull(); unmount();
  });
  it("catches missed messages with the tiny version heartbeat, and pauses hidden tabs", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useReportsLive(true, refresh));
    await tick(500); refresh.mockClear();
    mock.select.mockResolvedValue(snapshot({ order_files: 2 }));
    await tick(60000);
    expect(refresh.mock.calls[0][0].get("order_files")).toBeNull();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    const reads = mock.select.mock.calls.length;
    await tick(120000);
    expect(mock.select).toHaveBeenCalledTimes(reads);
    expect(mock.removeChannel).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(mock.channels).toHaveLength(2); unmount();
  });
  it("reconciles again when returning to Reports and removes the old account subscription", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(() => useReportsLive(true, refresh));
    await tick(500); refresh.mockClear();
    mock.user = { id: "u2" }; rerender(); await tick(500);
    expect(mock.removeChannel).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0].size).toBe(REPORTS_LIVE_SOURCES.length);
    unmount();
  });
});
