import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef } from "react";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

interface UseOrdersOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

export const useOrders = (options?: UseOrdersOptions) => {
  const queryClient = useQueryClient();

  // Subscribe to real-time updates
  useOrdersRealtime();

  // Use base key when no filters, or filtered key when filters are provided
  const hasFilters = Boolean(options?.bookedBy || options?.dispatcherUserId);
  const queryKey = hasFilters 
    ? ["orders", "filtered", options?.bookedBy, options?.dispatcherUserId] 
    : ["orders"];

  // Store total unlocked count for background loading verification
  const totalUnlockedCountRef = useRef<number | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const startTime = Date.now();
      console.log("[useOrders] Starting bulk fetch via Edge Functions...");

      // If dispatcher user ID is provided, fetch driver IDs assigned to them
      let dispatcherDriverIds: string[] = [];
      if (options?.dispatcherUserId) {
        const { data: assignedDrivers } = await supabase
          .from("drivers")
          .select("id")
          .eq("dispatcher_id", options.dispatcherUserId);
        
        dispatcherDriverIds = (assignedDrivers || []).map(d => d.id);
      }

      // Fetch ALL orders (unlocked + locked) in parallel via Edge Functions
      const [unlockedResponse, lockedResponse] = await Promise.all([
        supabase.functions.invoke("get-all-unlocked-orders", {
          body: {
            bookedBy: options?.bookedBy || null,
            dispatcherDriverIds: options?.dispatcherUserId ? dispatcherDriverIds : [],
          },
        }),
        supabase.functions.invoke("get-all-locked-orders", {
          body: {
            bookedBy: options?.bookedBy || null,
            dispatcherDriverIds: options?.dispatcherUserId ? dispatcherDriverIds : [],
          },
        }),
      ]);

      let allUnlockedOrders: any[] = [];
      let allLockedOrders: any[] = [];

      // Process unlocked orders
      if (unlockedResponse.error) {
        console.error("[useOrders] Unlocked Edge Function error:", unlockedResponse.error);
        throw unlockedResponse.error;
      }
      if (unlockedResponse.data?.orders) {
        allUnlockedOrders = unlockedResponse.data.orders;
        totalUnlockedCountRef.current = unlockedResponse.data.count;
        console.log(`[useOrders] ✅ Fetched ${allUnlockedOrders.length} unlocked orders in ${unlockedResponse.data.fetchTimeMs}ms`);
      }

      // Process locked orders
      if (lockedResponse.error) {
        console.error("[useOrders] Locked Edge Function error:", lockedResponse.error);
        // Don't throw - continue with unlocked orders only
      } else if (lockedResponse.data?.orders) {
        allLockedOrders = lockedResponse.data.orders;
        console.log(`[useOrders] ✅ Fetched ${allLockedOrders.length} locked orders in ${lockedResponse.data.fetchTimeMs}ms`);
      }

      // Deduplicate: remove locked orders if unlocked version exists
      const unlockedOrderIds = new Set(allUnlockedOrders.map(o => o.id));
      const deduplicatedLockedOrders = allLockedOrders.filter(
        order => !unlockedOrderIds.has(order.id)
      );
      
      // Sort locked orders by pickup_datetime descending
      deduplicatedLockedOrders.sort((a, b) => {
        const dateA = a.pickup_datetime || '';
        const dateB = b.pickup_datetime || '';
        return dateB.localeCompare(dateA);
      });

      const fetchTime = Date.now() - startTime;
      const mergedOrders = transformOrders([...allUnlockedOrders, ...deduplicatedLockedOrders]);
      console.log(`[useOrders] ✅ COMPLETE: ${allUnlockedOrders.length} unlocked + ${deduplicatedLockedOrders.length} locked = ${mergedOrders.length} total in ${fetchTime}ms`);

      return mergedOrders;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  return {
    orders: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    totalUnlockedCount: totalUnlockedCountRef.current,
    invalidate: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  };
};
