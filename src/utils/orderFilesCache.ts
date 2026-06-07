import { supabase } from "@/integrations/supabase/client";

/**
 * Shared module-scope cache for order_files used by the Reports page.
 *
 * Previously lived inside `useReportsDateWindowAdapter`. Extracted so that
 * the order-loading layer (`useReportsDateWindow`) can prime the cache in
 * parallel with pickup_drops/order_transfers — eliminating the visible
 * "files load after orders" phase the user sees on /reports.
 */

export type OrderFileLite = {
  id: string;
  order_id: string;
  file_category: string | null;
  file_name: string | null;
  file_path: string | null;
};

export const orderFilesCacheByOrderId = new Map<string, OrderFileLite[]>();
export const orderFilesLoadedOrderIds = new Set<string>();
let orderFilesFetchInFlight: Promise<void> | null = null;

export const clearOrderFilesCache = () => {
  orderFilesCacheByOrderId.clear();
  orderFilesLoadedOrderIds.clear();
};

export const seedOrderFilesCache = (
  files: OrderFileLite[] | null | undefined,
  orderIds: string[] = [],
) => {
  const byOrderId = new Map<string, OrderFileLite[]>();
  for (const file of files || []) {
    if (!file?.order_id) continue;
    const arr = byOrderId.get(file.order_id) || [];
    arr.push(file);
    byOrderId.set(file.order_id, arr);
  }

  for (const orderId of orderIds) {
    if (!orderId) continue;
    orderFilesCacheByOrderId.set(orderId, byOrderId.get(orderId) || []);
    orderFilesLoadedOrderIds.add(orderId);
  }

  for (const [orderId, rows] of byOrderId) {
    orderFilesCacheByOrderId.set(orderId, rows);
    orderFilesLoadedOrderIds.add(orderId);
  }
};

export const invalidateOrderFilesCacheForOrder = (
  orderId: string | null | undefined,
) => {
  if (!orderId) return;
  orderFilesCacheByOrderId.delete(orderId);
  orderFilesLoadedOrderIds.delete(orderId);
};

export const getCachedOrderFilesFlat = (orderIds: string[]): OrderFileLite[] => {
  const all: OrderFileLite[] = [];
  for (const id of orderIds) {
    const files = orderFilesCacheByOrderId.get(id);
    if (files && files.length) all.push(...files);
  }
  return all;
};

/**
 * Fetch order_files for the given order IDs (only the ones not already cached)
 * and write them into the module-scope cache. Safe to call multiple times in
 * parallel — the second caller will await the first call's in-flight promise.
 */
export const fetchAndCacheOrderFilesForOrders = async (orderIds: string[]) => {
  const unique = Array.from(new Set(orderIds)).filter(Boolean);
  const missing = unique.filter((id) => !orderFilesLoadedOrderIds.has(id));
  if (missing.length === 0) return;

  if (orderFilesFetchInFlight) {
    await orderFilesFetchInFlight;
    const stillMissing = missing.filter((id) => !orderFilesLoadedOrderIds.has(id));
    if (stillMissing.length === 0) return;
  }

  const run = async () => {
    const ORDER_ID_BATCH_SIZE = 300;
    const RESULT_PAGE_SIZE = 1000;

    for (let i = 0; i < missing.length; i += ORDER_ID_BATCH_SIZE) {
      const batchOrderIds = missing.slice(i, i + ORDER_ID_BATCH_SIZE);
      const batchFiles: OrderFileLite[] = [];

      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("order_files")
          .select("id, order_id, file_category, file_name, file_path")
          .in("order_id", batchOrderIds)
          .order("id", { ascending: true })
          .range(offset, offset + RESULT_PAGE_SIZE - 1);

        if (error) {
          console.error("[orderFilesCache] Error fetching order_files batch:", error);
          break;
        }

        const rows = (data || []) as OrderFileLite[];
        if (rows.length) batchFiles.push(...rows);

        hasMore = rows.length === RESULT_PAGE_SIZE;
        offset += RESULT_PAGE_SIZE;
      }

      const byOrderId = new Map<string, OrderFileLite[]>();
      for (const f of batchFiles) {
        const arr = byOrderId.get(f.order_id) || [];
        arr.push(f);
        byOrderId.set(f.order_id, arr);
      }

      // Mark all requested order IDs as loaded (even if 0 files) so we don't
      // refetch on every subsequent render.
      for (const oid of batchOrderIds) {
        orderFilesCacheByOrderId.set(oid, byOrderId.get(oid) || []);
        orderFilesLoadedOrderIds.add(oid);
      }
    }
  };

  orderFilesFetchInFlight = run().finally(() => {
    orderFilesFetchInFlight = null;
  });
  await orderFilesFetchInFlight;
};