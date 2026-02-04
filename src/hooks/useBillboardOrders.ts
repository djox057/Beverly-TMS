import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { transformOrders } from "@/utils/ordersTransform";

/**
 * Hook to fetch orders for the Billboard page.
 * Only fetches orders with delivery_datetime in the last 30 days
 * to optimize data loading and ensure complete dispatcher statistics.
 */
export const useBillboardOrders = () => {
  return useQuery({
    queryKey: ["orders", "billboard"],
    queryFn: async () => {
      console.log("[useBillboardOrders] Fetching orders for last 30 days...");
      
      const response = await supabase.functions.invoke("get-billboard-orders");
      
      if (response.error) {
        console.error("[useBillboardOrders] Error:", response.error);
        throw response.error;
      }
      
      const { orders, count, fetchTimeMs, cutoffDate } = response.data;
      console.log(`[useBillboardOrders] Received ${count} orders (cutoff: ${cutoffDate}) in ${fetchTimeMs}ms`);
      
      return transformOrders(orders || []);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - billboard data doesn't need frequent refreshes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });
};
