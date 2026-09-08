import { supabase } from "@/integrations/supabase/client";
import { fetchPickupDropsForOrders, fetchOrderTransfersForOrders, removeOrderFromGlobalStore,
  patchOrderInGlobalStore, hasOrderInGlobalStore, flushGlobalStoreNotifications } from "@/hooks/useReportsDateWindow";

/** Re-read changed records under RLS; zero returned rows must evict stale records. */
export async function refreshReportsOrders(ids: string[], driverIds: string[], isCurrent: () => boolean) {
      const allIds = [...new Set(ids)];
      for (let i = 0; i < allIds.length; i += 100) {
        const batch = allIds.slice(i, i + 100);
        const { data, error } = await supabase.from("orders").select("*").in("id", batch);
        if (error) throw error;
        const rows = data || [];
        const [drops, transfers] = await Promise.all([
          fetchPickupDropsForOrders(rows.map(row => row.id)),
          fetchOrderTransfersForOrders(rows.map(row => row.id)),
        ]);
        if (!isCurrent()) return;
        const found = new Set(rows.map(row => row.id));
        for (const id of batch) if (!found.has(id)) removeOrderFromGlobalStore(id, false);
        const scope = new Set(driverIds);
        for (const row of rows) {
          const related = transfers.filter(t => t.order_id === row.id);
          const relevant = hasOrderInGlobalStore(row.id) ||
            [row.driver1_id, row.driver2_id, row.original_driver1_id, row.original_driver2_id].some(id => scope.has(id)) ||
            related.some(t => scope.has(t.driver1_id) || scope.has(t.driver2_id));
          if (relevant) patchOrderInGlobalStore({ ...row,
            pickup_drops: drops.filter(d => d.order_id === row.id).sort((a,b) => a.sequence_number - b.sequence_number),
            order_transfers: related.sort((a,b) => a.sequence_number - b.sequence_number),
          }, false);
        }
        flushGlobalStoreNotifications();
      }

}
