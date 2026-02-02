import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { transformOrders } from "@/utils/ordersTransform";

/**
 * Hook that subscribes to real-time changes on orders and related tables.
 * Updates ALL matching React Query caches directly via setQueryData to avoid expensive refetches.
 */
export function useOrdersRealtime() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Only subscribe once globally
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    // Helper to fetch a single order with all joins including order_files for document indicators
    const fetchSingleOrder = async (orderId: string) => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          pickup_drops (*),
          order_files (id, file_category, file_name, file_path),
          order_transfers (
            *,
            driver1:drivers!order_transfers_driver1_id_fkey (id, name),
            driver2:drivers!order_transfers_driver2_id_fkey (id, name),
            truck:trucks!order_transfers_truck_id_fkey (id, truck_number),
            trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number)
          ),
          recovery_history (
            *,
            recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (id, name),
            recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (id, name),
            recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (id, truck_number),
            recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (id, trailer_number)
          ),
          broker:brokers (id, name, mc_number, address),
          company:companies!orders_company_id_fkey (id, name),
          booked_by_company:companies!orders_booked_by_company_id_fkey (id, name),
          truck:trucks!orders_truck_id_fkey (id, truck_number, company:companies (id, name)),
          trailer:trailers!orders_trailer_id_fkey (id, trailer_number),
          driver1:drivers!orders_driver1_id_fkey (id, name, company_id, company:companies (id, name)),
          driver2:drivers!orders_driver2_id_fkey (id, name, company_id, company:companies (id, name)),
          original_driver1:drivers!orders_original_driver1_id_fkey (id, name),
          original_driver2:drivers!orders_original_driver2_id_fkey (id, name),
          original_truck:trucks!orders_original_truck_id_fkey (id, truck_number),
          original_trailer:trailers!orders_original_trailer_id_fkey (id, trailer_number)
        `
        )
        .eq("id", orderId)
        .single();

      if (error) {
        console.error("[Realtime] Error fetching order:", error);
        return null;
      }
      return data;
    };

    // Transform raw order to match the UI shape (single source of truth)
    const transformOrder = (order: any) => transformOrders([order])[0];


    // Update ALL orders caches that start with ["orders"]
    const updateAllOrdersCaches = (
      orderId: string,
      transformedOrder: any | null,
      isDelete: boolean = false
    ) => {
      // Get all queries that start with "orders"
      const cache = queryClient.getQueryCache();
      // IMPORTANT: exact=false so this matches both ["orders"] and ["orders","filtered",...]
      const orderQueries = cache.findAll({ queryKey: ["orders"], exact: false });

      console.log(`[Realtime] Updating ${orderQueries.length} orders caches for order ${orderId}`);

      orderQueries.forEach((query) => {
        queryClient.setQueryData(query.queryKey, (old: any[] | undefined) => {
          if (!old) return isDelete ? old : (transformedOrder ? [transformedOrder] : old);

          if (isDelete) {
            return old.filter((o) => o.id !== orderId);
          }

          if (!transformedOrder) return old;

          const existingIndex = old.findIndex((o) => o.id === orderId);
          if (existingIndex >= 0) {
            // Update existing order
            const updated = [...old];
            updated[existingIndex] = transformedOrder;
            return updated;
          } else {
            // Insert new order at the beginning
            return [transformedOrder, ...old];
          }
        });
      });
    };

    // Handle order changes
    const handleOrderChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const eventType = payload.eventType;
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const orderId = newRecord?.id || oldRecord?.id;

      console.log(`[Realtime] Order ${eventType}:`, orderId);

      if (eventType === "DELETE") {
        updateAllOrdersCaches(oldRecord.id, null, true);
        return;
      }

      // For INSERT and UPDATE, fetch the full order with joins
      if (!orderId) return;

      const fullOrder = await fetchSingleOrder(orderId);
      if (!fullOrder) {
        console.error("[Realtime] Could not fetch order:", orderId);
        return;
      }

      const transformedOrder = transformOrder(fullOrder);
      updateAllOrdersCaches(orderId, transformedOrder);
    };

    // Handle related table changes (pickup_drops, order_transfers, order_files)
    const handleRelatedTableChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const orderId = newRecord?.order_id || oldRecord?.order_id;
      const tableName = (payload as any).table || '';

      if (!orderId) return;

      console.log(`[Realtime] Related table change for order:`, orderId, `table:`, tableName);

      // For order_files changes, also invalidate the Reports adapter cache
      if (tableName === 'order_files') {
        queryClient.invalidateQueries({ 
          queryKey: ["adapter-order-files"],
          refetchType: 'active'  // Only refetch currently mounted queries
        });
      }

      // Fetch the full updated order
      const fullOrder = await fetchSingleOrder(orderId);
      if (!fullOrder) return;

      const transformedOrder = transformOrder(fullOrder);
      updateAllOrdersCaches(orderId, transformedOrder);
    };

    // Create channel and subscribe
    // Create channel and subscribe (orders, pickup_drops, order_transfers, order_files)
    const channel = supabase
      .channel("orders-realtime-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        handleOrderChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_drops" },
        handleRelatedTableChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_transfers" },
        handleRelatedTableChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_files" },
        handleRelatedTableChange
      )
      .subscribe((status) => {
        console.log("[Realtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      console.log("[Realtime] Unsubscribing from orders channel");
      isSubscribedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
