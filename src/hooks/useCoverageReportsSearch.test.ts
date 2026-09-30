import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ requests: [] as any[], response: null as any, inject: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mock.rpc,
  from: (table: string) => {
    const request: any = { table, filters: [] };
    const chain: any = {};
    for (const method of ["select", "or", "ilike", "eq", "in", "abortSignal"]) {
      chain[method] = (...args: any[]) => { request.filters.push([method, ...args]); return chain; };
    }
    chain.then = (resolve: any, reject: any) => {
      mock.requests.push(request);
      return Promise.resolve(mock.response(request)).then(resolve, reject);
    };
    return chain;
  },
} }));
vi.mock("./useReportsDateWindow", () => ({ injectOrdersIntoGlobalStore: mock.inject }));
import { lookupCoverageLoads, useCoverageReportsSearch } from "./useCoverageReportsSearch";
import { useAutoSwitchOffice } from "./useAutoSwitchOffice";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const today = "2026-09-30";
const truck = { driverId: a, driver: "Team", driver1Name: "John Smith", driver2Name: "Jane Doe", truckNumber: "460", allOrders: [] };
const groups = [{ office: "BG", dispatcher: "Matt", trucks: [truck] }];
const props = { enabled: true, groups, loading: false, filters: { driverIds: [a], today, unit: "", load: "" } };

beforeEach(() => { mock.requests.length = 0; mock.inject.mockReset(); mock.rpc.mockReset(); mock.response = () => ({ data: [], error: null }); });

describe("coverage search feedback and remote load lookup", () => {
  it("shows found for either team name, not_found outside the assignment, and idle on clear", () => {
    const { result, rerender } = renderHook(useCoverageReportsSearch, { initialProps: { ...props, filters: { ...props.filters, unit: "Jane" } } });
    expect(result.current.searchStatus.truck).toBe("found");
    rerender({ ...props, filters: { ...props.filters, unit: "1460" } });
    expect(result.current.searchStatus.truck).toBe("not_found");
    rerender({ ...props, filters: { ...props.filters, unit: "" } });
    expect(result.current.searchStatus.truck).toBe("idle");
    expect(mock.requests).toHaveLength(0);
  });
  it("recomputes green indicators when the assigned driver list changes", () => {
    const { result, rerender } = renderHook(useCoverageReportsSearch, { initialProps: { ...props, filters: { ...props.filters, unit: "460" } } });
    expect(result.current.searchStatus.truck).toBe("found");
    rerender({ ...props, filters: { ...props.filters, unit: "460", driverIds: [b] } });
    expect(result.current.searchStatus.truck).toBe("not_found");
  });
  it("does not run coverage DB searches in regular office mode", async () => {
    renderHook(useCoverageReportsSearch, { initialProps: { ...props, enabled: false, filters: { ...props.filters, load: "900" } } });
    await act(async () => {});
    expect(mock.requests).toHaveLength(0);
  });
  it("constrains both number fields to assigned current/yard/transfer drivers and rejects unrelated returned data", async () => {
    const own = { id: "own", driver1_id: a, broker_load_number: "ABC_900", pickup_datetime: "2026-10-05T08:00:00", pickup_drops: [], order_transfers: [] };
    const outsider = { ...own, id: "outside", driver1_id: b };
    mock.response = (req: any) => ({ data: req.filters[0][1].startsWith("*") ? [own, outsider] : [{ id: "own" }], error: null });
    expect(await lookupCoverageLoads("ABC_900", [a, "not-a-uuid"], today, new AbortController().signal)).toEqual([own]);
    expect(mock.requests).toHaveLength(5);
    for (const req of mock.requests.slice(0, 4)) {
      const scope = req.filters.find((f: any) => f[0] === "or");
      expect(scope[1]).toContain(a);
      expect(scope[1]).not.toContain(b);
      expect(scope[1]).not.toContain("not-a-uuid");
      expect(req.filters.find((f: any) => f[0] === "ilike")[2]).toBe("%ABC\\_900%");
    }
    expect(mock.requests[1].filters.find((f: any) => f[0] === "or")[2]).toEqual({ referencedTable: "order_transfers" });
  });
  it("loads an assigned order outside the date window, returns its date, and turns green only when rendered", async () => {
    const own = { id: "own", driver1_id: a, broker_load_number: "900", pickup_datetime: "2026-10-05T08:00:00", pickup_drops: [], order_transfers: [] };
    mock.response = (req: any) => ({ data: req.filters[0][1].startsWith("*") ? [own] : [{ id: "own" }], error: null });
    const initialProps = { ...props, filters: { ...props.filters, load: "900" } };
    const { result, rerender } = renderHook(useCoverageReportsSearch, { initialProps });
    await waitFor(() => expect(mock.inject).toHaveBeenCalledWith([own]));
    expect(result.current.foundOrderMeta?.pickupDate).toBe(own.pickup_datetime);
    expect(result.current.searchStatus.load).not.toBe("found");
    rerender({ ...initialProps, groups: [{ ...groups[0], trucks: [{ ...truck, allOrders: [own] }] }] } as any);
    expect(result.current.searchStatus.load).toBe("found");
  });
  it("ignores late responses after clearing or changing scope", async () => {
    let release: (value: any) => void;
    const pending = new Promise(resolve => { release = resolve; });
    mock.response = () => pending;
    const { result, rerender } = renderHook(useCoverageReportsSearch, { initialProps: { ...props, filters: { ...props.filters, load: "900" } } });
    await waitFor(() => expect(mock.requests).toHaveLength(4));
    rerender({ ...props, filters: { ...props.filters, load: "", driverIds: [b] } });
    await act(async () => { release!({ data: [{ id: "old" }], error: null }); });
    expect(mock.inject).not.toHaveBeenCalled();
    expect(result.current.foundOrderMeta).toBeNull();
    expect(result.current.searchStatus.load).toBe("idle");
    expect(mock.requests).toHaveLength(4);
  });
  it("returns not_found for a completed empty lookup without repeatedly requesting it", async () => {
    const initialProps = { ...props, filters: { ...props.filters, load: "900" } };
    const { result, rerender } = renderHook(useCoverageReportsSearch, { initialProps });
    await waitFor(() => expect(result.current.searchStatus.load).toBe("not_found"));
    rerender({ ...initialProps, loading: true });
    rerender(initialProps);
    await act(async () => {});
    expect(mock.requests).toHaveLength(4);
  });
});

describe("regular dispatcher search is disabled only while covering", () => {
  const options = { truckDriverFilter: "", dispatchNameFilter: "", loadNumberFilter: "",
    activeTab: "BG", offices: ["BG", "LALE"], groupedReports: groups, setActiveTab: vi.fn() };
  it("keeps regular local truck search working", () => {
    const setActiveTab = vi.fn();
    const { result } = renderHook(useAutoSwitchOffice, { initialProps: { ...options, truckDriverFilter: "460", setActiveTab } });
    expect(result.current.searchStatus.truck).toBe("found");
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("keeps regular load search switching offices", async () => {
    mock.rpc.mockResolvedValue({ data: [{ office: "LALE", driver1_id: b, pickup_datetime: "2026-10-05T08:00:00" }], error: null });
    const setActiveTab = vi.fn();
    const { result } = renderHook(useAutoSwitchOffice, { initialProps: { ...options, loadNumberFilter: "900", setActiveTab } });
    await waitFor(() => expect(setActiveTab).toHaveBeenCalledWith("LALE"));
    expect(result.current.searchStatus.load).toBe("found");
  });
  it("prevents an in-flight global load search switching offices after coverage is enabled", async () => {
    let release: (value: any) => void;
    mock.rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const setActiveTab = vi.fn();
    const initialProps = { ...options, enabled: true, loadNumberFilter: "900", setActiveTab };
    const { rerender } = renderHook(useAutoSwitchOffice, { initialProps });
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(1));
    rerender({ ...initialProps, enabled: false });
    await act(async () => { release!({ data: [{ office: "LALE", driver1_id: b }], error: null }); });
    expect(setActiveTab).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValue({ data: [{ office: "LALE", driver1_id: b }], error: null });
    rerender(initialProps);
    await waitFor(() => expect(setActiveTab).toHaveBeenCalledWith("LALE"));
  });
});
