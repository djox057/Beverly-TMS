import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

interface UseOrdersOptions {
  bookedBy?: string | null;
}

export const useOrders = (options?: UseOrdersOptions) => {
  const queryClient = useQueryClient();

  // Set up real-time subscriptions for instant updates
  useEffect(() => {
    const channel = supabase
      .channel('orders-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pickup_drops' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_files' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trucks' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brokers' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ['orders', options?.bookedBy],
    queryFn: async () => {
      console.log("[useOrders] Fetching from materialized view...");
      
      // Query the pre-computed materialized view (refreshed every 5 minutes)
      let ordersQuery = supabase
        .from("orders_materialized_view")
        .select("*")
        .order("created_at", { ascending: false });

      if (options?.bookedBy) {
        ordersQuery = ordersQuery.eq("booked_by", options.bookedBy);
      }

      const { data, error } = await ordersQuery;

      if (error) {
        console.error("[useOrders] Error:", error);
        throw error;
      }

      console.log(`[useOrders] Fetched ${data?.length || 0} orders from materialized view`);

      // Transform the data to match the expected format
      return (data || []).map((order: any) => {
        // Parse JSONB fields back to arrays
        const pickupDrops = Array.isArray(order.pickup_drops) ? order.pickup_drops : [];
        const orderFiles = Array.isArray(order.order_files) ? order.order_files : [];

        return {
          ...order,
          // Transform flattened truck data back to nested structure
          trucks: order.truck_number ? {
            truck_number: order.truck_number,
            company: order.truck_company_id ? {
              id: order.truck_company_id,
              name: order.truck_company_name
            } : null
          } : null,
          // Transform trailer data
          trailers: order.trailer_number ? {
            trailer_number: order.trailer_number
          } : null,
          // Transform driver data
          drivers: order.driver1_name ? {
            name: order.driver1_name
          } : null,
          driver2: order.driver2_name ? {
            name: order.driver2_name
          } : null,
          // Transform original driver data
          original_driver1: order.original_driver1_name ? {
            name: order.original_driver1_name
          } : null,
          original_driver2: order.original_driver2_name ? {
            name: order.original_driver2_name
          } : null,
          // Transform original truck data
          original_truck: order.original_truck_number ? {
            truck_number: order.original_truck_number
          } : null,
          // Transform original trailer data
          original_trailer: order.original_trailer_number ? {
            trailer_number: order.original_trailer_number
          } : null,
          // Transform broker data
          brokers: order.broker_name ? {
            name: order.broker_name,
            address: order.broker_address,
            mc_number: order.broker_mc_number
          } : null,
          // Transform company data
          company: order.company_name ? {
            id: order.company_id,
            name: order.company_name
          } : null,
          // Transform booked by company data
          booked_by_company: order.booked_by_company_name ? {
            id: order.booked_by_company_id,
            name: order.booked_by_company_name
          } : null,
          // Include pickup/drops and files
          pickup_drops: pickupDrops,
          order_files: orderFiles
        };
      });
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    staleTime: 5 * 60 * 1000, // Data refreshes every 5 minutes via materialized view
  });

  return query;
};
