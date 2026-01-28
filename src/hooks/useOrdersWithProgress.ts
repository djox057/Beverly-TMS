import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLockedOrders } from "@/utils/ordersCache";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

interface LoadingProgress {
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  isLoadingMore: boolean;
  isComplete: boolean;
}

/**
 * Hook for Analytics page that loads ALL orders with progress tracking.
 * Uses Edge Function for bulk fetch - loads all unlocked orders in ~1 second.
 * CRITICAL: This hook MUST load 100% of unlocked orders from the database.
 */
export function useOrdersWithProgress() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<LoadingProgress>({
    unlockedLoaded: 0,
    unlockedTotal: null,
    lockedLoaded: 0,
    isLoadingMore: false,
    isComplete: false,
  });
  
  const isMountedRef = useRef(true);

  // Subscribe to real-time updates
  useOrdersRealtime();

  // Helper function to enrich locked orders
  const enrichLockedOrders = useCallback(async (lockedOrders: any[]) => {
    if (lockedOrders.length === 0) return [];

    const filterValidIds = (ids: any[]) => ids.filter(id => id && id !== "null" && id !== "NULL");
    
    const orderIds = lockedOrders.map((o) => o.id);
    const truckIds = [...new Set(filterValidIds([
      ...lockedOrders.map((o) => o.truck_id),
      ...lockedOrders.map((o) => o.original_truck_id)
    ]))];
    const trailerIds = [...new Set(filterValidIds([
      ...lockedOrders.map((o) => o.trailer_id),
      ...lockedOrders.map((o) => o.original_trailer_id)
    ]))];
    const allDriverIds = [...new Set(filterValidIds([
      ...lockedOrders.map((o) => o.driver1_id),
      ...lockedOrders.map((o) => o.driver2_id),
      ...lockedOrders.map((o) => o.original_driver1_id),
      ...lockedOrders.map((o) => o.original_driver2_id)
    ]))];
    const brokerIds = [...new Set(filterValidIds(lockedOrders.map((o) => o.broker_id)))];
    const companyIds = [...new Set(filterValidIds([
      ...lockedOrders.map((o) => o.company_id),
      ...lockedOrders.map((o) => o.booked_by_company_id)
    ]))];

    const batchFetch = async (table: string, select: string, ids: string[], batchSize = 50) => {
      if (ids.length === 0) return { data: [] };
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += batchSize) {
        batches.push(ids.slice(i, i + batchSize));
      }
      const results = await Promise.all(
        batches.map(async batch => {
          const { data } = await supabase.from(table as any).select(select).in("id", batch);
          return { data: data || [] };
        })
      );
      return { data: results.flatMap(r => r.data || []) };
    };

    const [trucksData, trailersData, driversData, brokersData, companiesData, pickupDropsData, orderFilesData, orderTransfersData] = await Promise.all([
      batchFetch("trucks", "id, truck_number", truckIds),
      batchFetch("trailers", "id, trailer_number", trailerIds),
      batchFetch("drivers", "id, name, company_id, company:companies(id, name)", allDriverIds),
      batchFetch("brokers", "id, name, mc_number, address", brokerIds),
      batchFetch("companies", "id, name", companyIds),
      (async () => {
        if (orderIds.length === 0) return { data: [] };
        const batches: string[][] = [];
        for (let i = 0; i < orderIds.length; i += 50) {
          batches.push(orderIds.slice(i, i + 50));
        }
        const results = await Promise.all(
          batches.map(batch => supabase.from("pickup_drops").select("*").in("order_id", batch))
        );
        return { data: results.flatMap(r => r.data || []) };
      })(),
      (async () => {
        if (orderIds.length === 0) return { data: [] };
        const batches: string[][] = [];
        for (let i = 0; i < orderIds.length; i += 50) {
          batches.push(orderIds.slice(i, i + 50));
        }
        const results = await Promise.all(
          batches.map(batch => supabase.from("order_files").select("id, order_id, file_category, file_name, file_path").in("order_id", batch))
        );
        return { data: results.flatMap(r => r.data || []) };
      })(),
      (async () => {
        if (orderIds.length === 0) return { data: [] };
        const batches: string[][] = [];
        for (let i = 0; i < orderIds.length; i += 50) {
          batches.push(orderIds.slice(i, i + 50));
        }
        const results = await Promise.all(
          batches.map(batch => supabase.from("order_transfers").select("*").in("order_id", batch))
        );
        return { data: results.flatMap(r => r.data || []) };
      })(),
    ]);

    const trucksMap = new Map(((trucksData.data || []) as any[]).map((t: any) => [t.id, t]));
    const trailersMap = new Map(((trailersData.data || []) as any[]).map((t: any) => [t.id, t]));
    const driversMap = new Map(((driversData.data || []) as any[]).map((d: any) => [d.id, d]));
    const brokersMap = new Map(((brokersData.data || []) as any[]).map((b: any) => [b.id, b]));
    const companiesMap = new Map(((companiesData.data || []) as any[]).map((c: any) => [c.id, c]));

    const pickupDropsByOrder = new Map<string, any[]>();
    ((pickupDropsData.data || []) as any[]).forEach((pd: any) => {
      if (!pickupDropsByOrder.has(pd.order_id)) pickupDropsByOrder.set(pd.order_id, []);
      pickupDropsByOrder.get(pd.order_id)!.push(pd);
    });

    const orderFilesByOrder = new Map<string, any[]>();
    ((orderFilesData.data || []) as any[]).forEach((of: any) => {
      if (!orderFilesByOrder.has(of.order_id)) orderFilesByOrder.set(of.order_id, []);
      orderFilesByOrder.get(of.order_id)!.push(of);
    });

    const orderTransfersByOrder = new Map<string, any[]>();
    ((orderTransfersData.data || []) as any[]).forEach((ot: any) => {
      if (!orderTransfersByOrder.has(ot.order_id)) orderTransfersByOrder.set(ot.order_id, []);
      orderTransfersByOrder.get(ot.order_id)!.push(ot);
    });

    return lockedOrders.map((order) => ({
      ...order,
      truck: order.truck_id ? trucksMap.get(order.truck_id) || null : null,
      trailer: order.trailer_id ? trailersMap.get(order.trailer_id) || null : null,
      driver1: order.driver1_id ? driversMap.get(order.driver1_id) || null : null,
      driver2: order.driver2_id ? driversMap.get(order.driver2_id) || null : null,
      original_driver1: order.original_driver1_id ? driversMap.get(order.original_driver1_id) || null : null,
      original_driver2: order.original_driver2_id ? driversMap.get(order.original_driver2_id) || null : null,
      original_truck: order.original_truck_id ? trucksMap.get(order.original_truck_id) || null : null,
      original_trailer: order.original_trailer_id ? trailersMap.get(order.original_trailer_id) || null : null,
      broker: order.broker_id ? brokersMap.get(order.broker_id) || null : null,
      company: order.company_id ? companiesMap.get(order.company_id) || null : null,
      booked_by_company: order.booked_by_company_id ? companiesMap.get(order.booked_by_company_id) || null : null,
      pickup_drops: pickupDropsByOrder.get(order.id) || [],
      order_files: orderFilesByOrder.get(order.id) || [],
      order_transfers: (orderTransfersByOrder.get(order.id) || []).sort((a, b) => a.sequence_number - b.sequence_number),
    }));
  }, []);

  // Main query - uses Edge Function for bulk fetch
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const startTime = Date.now();
      console.log("[OrdersWithProgress] Starting bulk fetch via Edge Function...");

      setProgress(prev => ({ ...prev, isLoadingMore: true }));

      // Use Edge Function to fetch ALL unlocked orders in a single call
      let allUnlockedOrders: any[] = [];
      let totalUnlockedCount: number | null = null;
      
      try {
        const { data: edgeFunctionResponse, error: edgeFunctionError } = await supabase.functions.invoke(
          "get-all-unlocked-orders",
          { body: {} }
        );

        if (edgeFunctionError) {
          console.error("[OrdersWithProgress] Edge Function error:", edgeFunctionError);
          throw edgeFunctionError;
        }

        if (edgeFunctionResponse?.orders) {
          allUnlockedOrders = edgeFunctionResponse.orders;
          totalUnlockedCount = edgeFunctionResponse.count;
          console.log(`[OrdersWithProgress] ✅ Edge Function returned ${allUnlockedOrders.length} orders in ${edgeFunctionResponse.fetchTimeMs}ms`);
        }
      } catch (edgeError) {
        // Fallback to direct database fetch if Edge Function fails
        console.warn("[OrdersWithProgress] Edge Function failed, falling back to direct fetch:", edgeError);
        
        // Get total count
        const { count } = await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("locked", false);
        
        totalUnlockedCount = count;
        
        // Fetch all unlocked orders in batches
        const BATCH_SIZE = 1000;
        let offset = 0;
        
        while (true) {
          const { data: batch, error: batchError } = await supabase
            .from("orders")
            .select(`
              *,
              pickup_drops (id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at, company_name, contact_name, contact_phone, special_instructions),
              order_files (id, file_category, file_name, file_path),
              order_transfers (id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, manual_driver_name, manual_truck_number, manual_trailer_number, transfer_date, transfer_city, transfer_state, transfer_address, transfer_datetime, transfer_latitude, transfer_longitude,
                driver1:drivers!order_transfers_driver1_id_fkey (id, name),
                driver2:drivers!order_transfers_driver2_id_fkey (id, name),
                truck:trucks!order_transfers_truck_id_fkey (id, truck_number),
                trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number)
              ),
              recovery_history (id, recovery_driver1_id, recovery_driver2_id, recovery_truck_id, recovery_trailer_id,
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
            `)
            .eq("locked", false)
            .order("created_at", { ascending: false })
            .range(offset, offset + BATCH_SIZE - 1);

          if (batchError || !batch || batch.length === 0) break;

          allUnlockedOrders = allUnlockedOrders.concat(batch);
          
          if (batch.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        }
      }

      const fetchTime = Date.now() - startTime;
      console.log(`[OrdersWithProgress] Unlocked orders fetched: ${allUnlockedOrders.length} in ${fetchTime}ms`);

      // Update progress with unlocked count
      setProgress(prev => ({ 
        ...prev, 
        unlockedLoaded: allUnlockedOrders.length,
        unlockedTotal: totalUnlockedCount,
      }));

      // Load locked orders from cache and DB
      let lockedOrders = await getLockedOrders() || [];
      
      const lockedOrderIds = new Set(lockedOrders.map((o: any) => o.id));
      let allDbLockedOrders: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .from("orders")
          .select("*")
          .eq("locked", true)
          .order("updated_at", { ascending: false })
          .range(offset, offset + batchSize - 1);
        
        if (batchError || !batch || batch.length === 0) break;
        allDbLockedOrders = [...allDbLockedOrders, ...batch];
        offset += batchSize;
        if (batch.length < batchSize) break;
      }

      if (allDbLockedOrders.length > 0) {
        const missingLockedOrders = allDbLockedOrders.filter((o: any) => !lockedOrderIds.has(o.id));
        if (missingLockedOrders.length > 0) {
          console.log(`[OrdersWithProgress] Added ${missingLockedOrders.length} locked orders from DB`);
          lockedOrders = [...lockedOrders, ...missingLockedOrders];
        }
      }

      const enrichedLockedOrders = await enrichLockedOrders(lockedOrders);
      
      // Deduplicate
      const unlockedOrderIds = new Set(allUnlockedOrders.map(o => o.id));
      const deduplicatedLockedOrders = enrichedLockedOrders.filter(order => !unlockedOrderIds.has(order.id));
      
      deduplicatedLockedOrders.sort((a, b) => {
        const dateA = a.pickup_datetime || '';
        const dateB = b.pickup_datetime || '';
        return dateB.localeCompare(dateA);
      });

      // Final progress update
      const totalTime = Date.now() - startTime;
      setProgress({
        unlockedLoaded: allUnlockedOrders.length,
        unlockedTotal: totalUnlockedCount,
        lockedLoaded: deduplicatedLockedOrders.length,
        isLoadingMore: false,
        isComplete: true,
      });

      const mergedOrders = transformOrders([...allUnlockedOrders, ...deduplicatedLockedOrders]);
      console.log(`[OrdersWithProgress] ✅ COMPLETE: ${allUnlockedOrders.length} unlocked + ${deduplicatedLockedOrders.length} locked = ${mergedOrders.length} total in ${totalTime}ms`);

      return mergedOrders;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  // Handle cache hit scenario (data already loaded by /orders page)
  useEffect(() => {
    isMountedRef.current = true;
    
    if (query.data && progress.unlockedTotal === null && !query.isLoading) {
      // Data exists but progress wasn't initialized (came from cache)
      const unlockedCount = query.data.filter((o: any) => !o.locked).length;
      const lockedCount = query.data.filter((o: any) => o.locked).length;
      
      console.log(`[OrdersWithProgress] Using cached data: ${unlockedCount} unlocked, ${lockedCount} locked`);
      
      // Verify we have all unlocked orders
      (async () => {
        const { count } = await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("locked", false);
        
        if (isMountedRef.current) {
          setProgress({
            unlockedLoaded: unlockedCount,
            unlockedTotal: count,
            lockedLoaded: lockedCount,
            isLoadingMore: false,
            isComplete: unlockedCount >= (count || 0),
          });
          
          if (unlockedCount < (count || 0)) {
            console.warn(`[OrdersWithProgress] Cache incomplete: ${unlockedCount}/${count}, triggering refetch`);
            queryClient.invalidateQueries({ queryKey: ["orders"] });
          }
        }
      })();
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [query.data, query.isLoading, progress.unlockedTotal, queryClient]);

  return {
    ...query,
    progress,
  };
}
