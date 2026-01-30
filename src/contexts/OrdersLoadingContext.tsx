import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLockedOrders } from '@/utils/ordersCache';
import { transformOrders } from '@/utils/ordersTransform';
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime';

// ============= Types =============

interface OrdersLoadingProgress {
  phase: 'idle' | 'unlocked' | 'locked' | 'complete' | 'error';
  unlockedLoaded: number;
  unlockedTotal: number;
  lockedLoaded: number;
  lockedTotal: number;
}

interface OrdersLoadingContextType {
  startLoading: () => void;
  progress: OrdersLoadingProgress;
  isLoading: boolean;
  isLoadingLocked: boolean;
}

// ============= Context =============

const OrdersLoadingContext = createContext<OrdersLoadingContextType | undefined>(undefined);

// ============= Enrichment Helper =============

async function enrichLockedOrdersWithLookups(lockedOrders: any[]): Promise<any[]> {
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

  const fetchLivePaidStatus = async (): Promise<Map<string, boolean>> => {
    const paidMap = new Map<string, boolean>();
    if (orderIds.length === 0) return paidMap;

    try {
      if (orderIds.length > 2000) {
        const pageSize = 1000;
        let offset = 0;

        while (true) {
          const { data, error } = await supabase
            .from("orders")
            .select("id, paid")
            .eq("locked", true)
            .range(offset, offset + pageSize - 1);

          if (error || !data || data.length === 0) break;
          data.forEach((row: any) => paidMap.set(row.id, row.paid === true));
          if (data.length < pageSize) break;
          offset += pageSize;
        }
        return paidMap;
      }

      const batchSize = 200;
      for (let i = 0; i < orderIds.length; i += batchSize) {
        const batch = orderIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("orders")
          .select("id, paid")
          .in("id", batch);

        if (error || !data) continue;
        data.forEach((row: any) => paidMap.set(row.id, row.paid === true));
      }
    } catch (error) {
      console.warn("[GlobalOrders] Could not fetch live paid status:", error);
    }

    return paidMap;
  };

  const [trucksData, trailersData, driversData, brokersData, companiesData, pickupDropsData, orderFilesData, orderTransfersData, livePaidStatus] = await Promise.all([
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
    fetchLivePaidStatus(),
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
    paid: livePaidStatus.has(order.id) ? livePaidStatus.get(order.id) : order.paid,
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
}

// ============= Provider =============

export const OrdersLoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const loadingStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  
  // Subscribe to real-time updates - this updates the React Query cache automatically
  useOrdersRealtime();

  const [progress, setProgress] = useState<OrdersLoadingProgress>({
    phase: 'idle',
    unlockedLoaded: 0,
    unlockedTotal: 0,
    lockedLoaded: 0,
    lockedTotal: 0,
  });

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const startLoading = useCallback(async () => {
    // Idempotent - only run once
    if (loadingStartedRef.current) {
      console.log('[GlobalOrders] Loading already started, skipping');
      return;
    }
    loadingStartedRef.current = true;

    console.log('[GlobalOrders] Starting global orders loading...');

    try {
      // ============= Phase 1: Unlocked Orders =============
      setProgress({ 
        phase: 'unlocked', 
        unlockedLoaded: 0, 
        unlockedTotal: 0, 
        lockedLoaded: 0, 
        lockedTotal: 0 
      });

      const startTime = Date.now();
      
      // Use Edge Function for bulk fetch
      const { data: edgeFunctionResponse, error: edgeFunctionError } = await supabase.functions.invoke(
        "get-all-unlocked-orders",
        { body: {} }
      );

      if (!isMountedRef.current) return;

      if (edgeFunctionError) {
        console.error("[GlobalOrders] Phase 1 Edge Function error:", edgeFunctionError);
        throw edgeFunctionError;
      }

      const allUnlocked = edgeFunctionResponse?.orders || [];
      const totalUnlocked = edgeFunctionResponse?.count || allUnlocked.length;
      
      console.log(`[GlobalOrders] Phase 1: ✅ Fetched ${allUnlocked.length} unlocked orders in ${Date.now() - startTime}ms`);
      
      // Transform unlocked orders
      const transformedUnlocked = transformOrders(allUnlocked);
      
      // Update React Query cache with partial data
      queryClient.setQueryData(['orders'], {
        orders: transformedUnlocked,
        isPartialData: true,
        totalUnlocked: transformedUnlocked.length,
        totalLocked: 0,
      });
      
      if (!isMountedRef.current) return;

      setProgress({
        phase: 'locked',
        unlockedLoaded: transformedUnlocked.length,
        unlockedTotal: totalUnlocked,
        lockedLoaded: 0,
        lockedTotal: 0,
      });

      // ============= Phase 2: Locked Orders =============
      const lockedStartTime = Date.now();
      console.log('[GlobalOrders] Phase 2: Starting locked orders loading...');

      // Get locked orders count
      const { count: lockedTotal } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("locked", true);

      if (!isMountedRef.current) return;
      
      setProgress(prev => ({ ...prev, lockedTotal: lockedTotal || 0 }));

      // Load from cache first
      let lockedOrders = await getLockedOrders() || [];
      console.log(`[GlobalOrders] Phase 2: Loaded ${lockedOrders.length} from cache`);
      
      // Fetch missing locked orders from DB
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
        
        // Update progress during DB fetch
        if (isMountedRef.current) {
          setProgress(prev => ({
            ...prev,
            lockedLoaded: allDbLockedOrders.length,
          }));
        }
      }

      // Merge missing orders
      if (allDbLockedOrders.length > 0) {
        const missingLockedOrders = allDbLockedOrders.filter((o: any) => !lockedOrderIds.has(o.id));
        if (missingLockedOrders.length > 0) {
          console.log(`[GlobalOrders] Phase 2: Added ${missingLockedOrders.length} locked orders from DB`);
          lockedOrders = [...lockedOrders, ...missingLockedOrders];
        }
      }

      if (!isMountedRef.current) return;

      // Enrich locked orders
      console.log(`[GlobalOrders] Phase 2: Enriching ${lockedOrders.length} locked orders...`);
      const enrichedLockedOrders = await enrichLockedOrdersWithLookups(lockedOrders);
      
      // Deduplicate against unlocked orders
      const unlockedOrderIds = new Set(transformedUnlocked.map(o => o.id));
      const deduplicatedLockedOrders = enrichedLockedOrders.filter(
        order => !unlockedOrderIds.has(order.id)
      );
      
      // Sort by pickup_datetime descending
      deduplicatedLockedOrders.sort((a, b) => {
        const dateA = a.pickup_datetime || '';
        const dateB = b.pickup_datetime || '';
        return dateB.localeCompare(dateA);
      });
      
      // Transform locked orders
      const transformedLocked = transformOrders(deduplicatedLockedOrders);
      
      // Merge all orders
      const allOrders = [...transformedUnlocked, ...transformedLocked];
      
      // Update React Query cache with complete data
      queryClient.setQueryData(['orders'], {
        orders: allOrders,
        isPartialData: false,
        totalUnlocked: transformedUnlocked.length,
        totalLocked: transformedLocked.length,
      });
      
      if (!isMountedRef.current) return;

      setProgress({
        phase: 'complete',
        unlockedLoaded: transformedUnlocked.length,
        unlockedTotal: totalUnlocked,
        lockedLoaded: transformedLocked.length,
        lockedTotal: lockedTotal || 0,
      });
      
      console.log(`[GlobalOrders] Phase 2: ✅ Complete! ${transformedLocked.length} locked orders in ${Date.now() - lockedStartTime}ms`);
      console.log(`[GlobalOrders] Total: ${allOrders.length} orders loaded`);
      
    } catch (error) {
      console.error('[GlobalOrders] Error loading orders:', error);
      if (isMountedRef.current) {
        setProgress(prev => ({ ...prev, phase: 'error' }));
      }
    }
  }, [queryClient]);

  const isLoading = progress.phase !== 'complete' && progress.phase !== 'idle' && progress.phase !== 'error';
  const isLoadingLocked = progress.phase === 'locked';

  return (
    <OrdersLoadingContext.Provider
      value={{
        startLoading,
        progress,
        isLoading,
        isLoadingLocked,
      }}
    >
      {children}
    </OrdersLoadingContext.Provider>
  );
};

// ============= Hook =============

export const useOrdersLoadingContext = () => {
  const context = useContext(OrdersLoadingContext);
  if (context === undefined) {
    throw new Error('useOrdersLoadingContext must be used within an OrdersLoadingProvider');
  }
  return context;
};
