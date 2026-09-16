import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReportsLiveQueue, mergeLiveChange, type LiveChanges } from "./reportsLiveQueue";

describe("Reports live refresh queue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("unions keys, makes full reconciliation dominant, and bounds memory", () => {
    const pending: LiveChanges = new Map();
    mergeLiveChange(pending, "orders", ["a", "b"]);
    mergeLiveChange(pending, "orders", ["b", "c"]);
    expect([...pending.get("orders")!]).toEqual(["a", "b", "c"]);
    mergeLiveChange(pending, "orders", null);
    mergeLiveChange(pending, "orders", ["d"]);
    expect(pending.get("orders")).toBeNull();
    mergeLiveChange(pending, "drivers", Array.from({ length: 501 }, (_, i) => `${i}`));
    expect(pending.get("drivers")).toBeNull();
  });
  it("does not starve when changes keep arriving", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const queue = createReportsLiveQueue(refresh, vi.fn(), vi.fn());
    queue.add("orders", ["a"]);
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(90);
      queue.add("orders", [`${i}`]);
    }
    await vi.advanceTimersByTimeAsync(50);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0].get("orders").size).toBe(6);
    queue.stop();
  });
  it("serializes reads and retains changes that arrive during a read", async () => {
    let finish!: () => void;
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const queue = createReportsLiveQueue(refresh, vi.fn(), vi.fn());
    queue.add("orders", ["a"]);
    await vi.advanceTimersByTimeAsync(500);
    queue.add("orders", ["b"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect([...refresh.mock.calls[1][0].get("orders")]).toEqual(["b"]);
    queue.stop();
  });
  it("retries failed work together with new changes, without repeating completed sources", async () => {
    const refresh = vi.fn().mockImplementationOnce(async changes => {
      changes.delete("drivers"); // completed source is acknowledged before a later failure
      throw new Error("network");
    }).mockResolvedValue(undefined);
    const onError = vi.fn();
    const queue = createReportsLiveQueue(refresh, onError, vi.fn());
    queue.add("drivers", null); queue.add("orders", ["a"]);
    await vi.advanceTimersByTimeAsync(500);
    queue.add("orders", ["b"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect([...refresh.mock.calls[1][0].get("orders")]).toEqual(["a", "b"]);
    expect(refresh.mock.calls[1][0].has("drivers")).toBe(false);
    queue.stop();
  });
  it("stops pending work on unmount", async () => {
    const refresh = vi.fn();
    const queue = createReportsLiveQueue(refresh, vi.fn(), vi.fn());
    queue.add("orders", ["a"]); queue.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
