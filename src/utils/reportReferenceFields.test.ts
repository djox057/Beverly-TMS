import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { watchReportReferenceChanges } from "./reportReferenceFields";

describe("report reference invalidation", () => {
  it("ignores fetch lifecycle, new object identities, row order and unused fields", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["drivers", "v2"];
    client.setQueryData(key, [{ id: "a", name: "Ann", phone: "1" }, { id: "b", name: "Ben" }]);
    const changed = vi.fn();
    const stop = watchReportReferenceChanges(client, changed);
    await client.invalidateQueries({ queryKey: key, refetchType: "none" });
    await client.fetchQuery({
      queryKey: key,
      queryFn: async () => [{ id: "b", name: "Ben" }, { id: "a", name: "Ann", phone: "1", note: "private editor note", updated_at: "new" }],
    });
    expect(changed).not.toHaveBeenCalled();
    stop();
    client.clear();
  });

  it("invalidates only the affected dataset for assignments, HOS and deletions", () => {
    const client = new QueryClient();
    client.setQueryData(["drivers", "v2"], [{ id: "a", name: "Ann", hos_drive_minutes: 90, is_active: true }]);
    client.setQueryData(["trucks", "v2"], [{ id: "t", driver1_id: "a" }]);
    const changed = vi.fn();
    const stop = watchReportReferenceChanges(client, changed);
    client.setQueryData(["drivers", "v2"], [{ id: "a", name: "Ann", hos_drive_minutes: 80, is_active: true }]);
    expect(changed.mock.calls).toEqual([["drivers"]]);
    client.setQueryData(["trucks", "v2"], [{ id: "t", driver1_id: "b" }]);
    expect(changed.mock.calls).toEqual([["drivers"], ["trucks"]]);
    client.setQueryData(["drivers", "v2"], []);
    expect(changed.mock.calls).toEqual([["drivers"], ["trucks"], ["drivers"]]);
    stop();
    client.clear();
  });

  it("does not treat a failed fetch as deletion and still detects an in-place edit", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["trucks", "v2"];
    const rows = [{ id: "t", oos: false }];
    client.setQueryData(key, rows);
    const changed = vi.fn();
    const stop = watchReportReferenceChanges(client, changed);
    await expect(client.fetchQuery({ queryKey: key, queryFn: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
    expect(changed).not.toHaveBeenCalled();
    rows[0].oos = true;
    client.setQueryData(key, rows);
    expect(changed.mock.calls).toEqual([["trucks"]]);
    stop();
    client.setQueryData(key, []);
    expect(changed).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

