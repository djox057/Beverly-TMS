import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDriverMissingFuelReceipt } from "./useDriverMissingFuelReceipt";
import { useEfsMissingReceipts } from "./useEfsMissingReceipts";
import { useEfsMissingByDriver } from "./useEfsMissingByDriver";

const { from, cutoffs } = vi.hoisted(() => ({ from: vi.fn(), cutoffs: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); cutoffs.length = 0; });

describe("EFS missing receipt window", () => {
  it("uses the same inclusive 14-day boundary for blocking, lists, and driver indicators and excludes voided requests", async () => {
    const now = Date.parse("2026-10-17T13:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cutoff = "2026-10-03T13:00:00.000Z";
    const rows = [
      { id: "recent", driver_id: "recent-driver", requested_at: "2026-10-16T13:00:00Z" },
      { id: "boundary", driver_id: "boundary-driver", requested_at: cutoff },
      { id: "voided", driver_id: "voided-driver", requested_at: "2026-10-16T13:00:00Z", voided_at: "2026-10-17T12:00:00Z" },
      { id: "old", driver_id: "old-driver", requested_at: "2026-10-03T12:59:59.999Z" },
    ];
    from.mockImplementation(() => {
      let minimum = "";
      let activeOnly = false;
      const query: any = {
        select: () => query, eq: () => query,
        is: (column: string, value: unknown) => {
          if (column === "voided_at" && value === null) activeOnly = true;
          return query;
        },
        or: () => query, not: () => query, order: () => query,
        gte: (column: string, value: string) => {
          expect(column).toBe("requested_at");
          cutoffs.push(value); minimum = value; return query;
        },
        then: (resolve: any) => Promise.resolve({
          data: rows.filter(row => Date.parse(row.requested_at) >= Date.parse(minimum) && (!activeOnly || !row.voided_at)), error: null,
        }).then(resolve),
      };
      return query;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => ({
      blocking: useDriverMissingFuelReceipt("driver"),
      list: useEfsMissingReceipts(),
      drivers: useEfsMissingByDriver(),
    }), { wrapper });
    await waitFor(() => expect(result.current.blocking.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.drivers.isLoading).toBe(false));
    expect(cutoffs).toEqual([cutoff, cutoff, cutoff]);
    expect(result.current.blocking.data?.map(row => row.id)).toEqual(["recent", "boundary"]);
    expect(result.current.list.fuelRequests.map(row => row.id)).toEqual(["recent", "boundary"]);
    expect(result.current.drivers.hasDriverMissingData("old-driver")).toBe(false);
    expect(result.current.drivers.hasDriverMissingData("voided-driver")).toBe(false);
    expect(result.current.drivers.hasDriverMissingData("boundary-driver")).toBe(true);
    client.clear();
  });
});
