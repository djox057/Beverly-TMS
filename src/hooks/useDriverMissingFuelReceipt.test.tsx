import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useDriverMissingFuelReceipt } from "./useDriverMissingFuelReceipt";
const api = vi.hoisted(() => ({ driver: vi.fn(), receipts: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: api.driver }) }) }) } }));
vi.mock("@/lib/activeEfsRequests", () => ({ fetchActiveEfsRows: api.receipts }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useDriverMissingFuelReceipt("thierno"), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
it("never fetches a blocking receipt list for a confirmed recovery driver", async () => {
  api.driver.mockResolvedValue({ data: { is_recovery: true }, error: null });
  const { result } = show();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([]);
  expect(api.receipts).not.toHaveBeenCalled();
});
it("preserves the missing receipt list for a regular driver", async () => {
  api.driver.mockResolvedValue({ data: { is_recovery: false }, error: null });
  api.receipts.mockResolvedValue({ data: [{ id: "missing-receipt" }], error: null });
  const { result } = show();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([{ id: "missing-receipt" }]);
});
