import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLockedOrders } from "@/utils/ordersCache";
import { transformOrders } from "@/utils/ordersTransform";
import { useOrdersRealtime } from "./useOrdersRealtime";

interface ProgressiveLoadingProgress {
  phase: 1 | 2 | "complete";
  unlockedLoaded: number;
  unlockedTotal: number | null;
  lockedLoaded: number;
  lockedTotal: number | null;
  isLoadingLocked: boolean;
  percentComplete: number;
}

interface UseOrdersProgressiveOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

// Helper to enrich locked orders with lookup data
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

  // Fetch live paid status
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
      console.warn("[Progressive] Could not fetch live paid status:", error);
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

/**
 * Progressive loading hook for /orders page
 * 
 * Phase 1: Load unlocked orders → Display first 100 immediately (1-2s)
 * Phase 2: Background load locked orders with progress indicator (5-8s)
 */
export function useOrdersProgressive(options?: UseOrdersProgressiveOptions) {
  const queryClient = useQueryClient();
  const isMountedRef = useRef(true);
  
  // Phase 1 state: unlocked orders (quick display)
  const [phase1Data, setPhase1Data] = useState<any[] | null>(null);
  const [phase1Loading, setPhase1Loading] = useState(true);
  
  // Phase 2 state: locked orders (background load)
  const [phase2Data, setPhase2Data] = useState<any[] | null>(null);
  const [phase2Loading, setPhase2Loading] = useState(false);
  
  // Progress tracking
  const [progress, setProgress] = useState<ProgressiveLoadingProgress>({
    phase: 1,
    unlockedLoaded: 0,
    unlockedTotal: null,
    lockedLoaded: 0,
    lockedTotal: null,
    isLoadingLocked: false,
    percentComplete: 0,
  });

  // Subscribe to real-time updates
  useOrdersRealtime();

  // Get dispatcher driver IDs if needed
  const fetchDispatcherDriverIds = useCallback(async (): Promise<string[]> => {
    if (!options?.dispatcherUserId) return [];
    
    const { data: assignedDrivers } = await supabase
      .from("drivers")
      .select("id")
      .eq("dispatcher_id", options.dispatcherUserId);
    
    return (assignedDrivers || []).map(d => d.id);
  }, [options?.dispatcherUserId]);

  // PHASE 1: Fetch unlocked orders and display first 100 immediately
  useEffect(() => {
    let cancelled = false;
    
    const loadPhase1 = async () => {
      const startTime = Date.now();
      console.log("[Progressive] Phase 1: Starting unlocked orders fetch...");
      
      try {
        const dispatcherDriverIds = await fetchDispatcherDriverIds();
        
        // Use Edge Function for bulk fetch
        const { data: edgeFunctionResponse, error: edgeFunctionError } = await supabase.functions.invoke(
          "get-all-unlocked-orders",
          {
            body: {
              bookedBy: options?.bookedBy || null,
              dispatcherDriverIds: options?.dispatcherUserId ? dispatcherDriverIds : [],
            },
          }
        );

        if (cancelled) return;

        if (edgeFunctionError) {
          console.error("[Progressive] Phase 1 Edge Function error:", edgeFunctionError);
          throw edgeFunctionError;
        }

        if (edgeFunctionResponse?.orders) {
          const allUnlocked = edgeFunctionResponse.orders;
          const totalUnlocked = edgeFunctionResponse.count;
          
          console.log(`[Progressive] Phase 1: ✅ Fetched ${allUnlocked.length} unlocked orders in ${Date.now() - startTime}ms`);
          
          // Transform immediately - show all unlocked orders
          const transformedUnlocked = transformOrders(allUnlocked);
          
          if (!cancelled) {
            setPhase1Data(transformedUnlocked);
            setPhase1Loading(false);
            setProgress(prev => ({
              ...prev,
              phase: 2,
              unlockedLoaded: allUnlocked.length,
              unlockedTotal: totalUnlocked,
              percentComplete: 30, // Phase 1 complete = 30%
            }));
            
            // Start Phase 2 immediately
            loadPhase2(allUnlocked, dispatcherDriverIds);
          }
        }
      } catch (error) {
        console.error("[Progressive] Phase 1 failed:", error);
        if (!cancelled) {
          setPhase1Loading(false);
          setProgress(prev => ({ ...prev, phase: "complete" }));
        }
      }
    };
    
    const loadPhase2 = async (unlockedOrders: any[], dispatcherDriverIds: string[]) => {
      const startTime = Date.now();
      console.log("[Progressive] Phase 2: Starting locked orders background load...");
      
      if (!isMountedRef.current) return;
      
      setPhase2Loading(true);
      setProgress(prev => ({ ...prev, isLoadingLocked: true }));
      
      try {
        // Get locked orders count first for progress
        const { count: lockedTotal } = await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("locked", true);
        
        setProgress(prev => ({ ...prev, lockedTotal }));
        
        // Load from cache first (fast)
        let lockedOrders = await getLockedOrders() || [];
        console.log(`[Progressive] Phase 2: Loaded ${lockedOrders.length} from cache`);
        
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
          
          // Update progress during DB fetch
          if (isMountedRef.current) {
            const loadedSoFar = allDbLockedOrders.length;
            const percent = 30 + Math.min(30, (loadedSoFar / (lockedTotal || 1)) * 30);
            setProgress(prev => ({
              ...prev,
              lockedLoaded: loadedSoFar,
              percentComplete: Math.round(percent),
            }));
          }
          
          if (batch.length < batchSize) break;
        }

        // Merge missing orders
        if (allDbLockedOrders.length > 0) {
          const missingLockedOrders = allDbLockedOrders.filter((o: any) => !lockedOrderIds.has(o.id));
          if (missingLockedOrders.length > 0) {
            console.log(`[Progressive] Phase 2: Added ${missingLockedOrders.length} locked orders from DB`);
            lockedOrders = [...lockedOrders, ...missingLockedOrders];
          }
        }

        // Filter for dispatcher if needed
        if (options?.dispatcherUserId && lockedOrders) {
          lockedOrders = lockedOrders.filter(order => {
            const matchesBookedBy = options?.bookedBy && order.booked_by === options.bookedBy;
            const matchesDriver = dispatcherDriverIds.includes(order.driver1_id);
            return matchesBookedBy || matchesDriver;
          });
        }

        // Update progress before enrichment
        setProgress(prev => ({
          ...prev,
          lockedLoaded: lockedOrders.length,
          percentComplete: 60,
        }));

        // Enrich locked orders (this takes a bit longer)
        console.log(`[Progressive] Phase 2: Enriching ${lockedOrders.length} locked orders...`);
        const enrichedLockedOrders = await enrichLockedOrdersWithLookups(lockedOrders);
        
        // Deduplicate
        const unlockedOrderIds = new Set(unlockedOrders.map(o => o.id));
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
        
        if (isMountedRef.current) {
          setPhase2Data(transformedLocked);
          setPhase2Loading(false);
          setProgress({
            phase: "complete",
            unlockedLoaded: unlockedOrders.length,
            unlockedTotal: unlockedOrders.length,
            lockedLoaded: transformedLocked.length,
            lockedTotal: lockedTotal,
            isLoadingLocked: false,
            percentComplete: 100,
          });
          
          console.log(`[Progressive] Phase 2: ✅ Complete! ${transformedLocked.length} locked orders in ${Date.now() - startTime}ms`);
        }
      } catch (error) {
        console.error("[Progressive] Phase 2 failed:", error);
        if (isMountedRef.current) {
          setPhase2Loading(false);
          setProgress(prev => ({ ...prev, phase: "complete", isLoadingLocked: false }));
        }
      }
    };
    
    loadPhase1();
    
    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [options?.bookedBy, options?.dispatcherUserId, fetchDispatcherDriverIds]);

  // Reset mount ref on options change
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [options?.bookedBy, options?.dispatcherUserId]);

  // Merge phase 1 and phase 2 data
  const mergedData = useMemo(() => {
    if (!phase1Data) return [];
    if (!phase2Data) return phase1Data;
    
    // Combine unlocked + locked, already deduplicated
    return [...phase1Data, ...phase2Data];
  }, [phase1Data, phase2Data]);

  // Update React Query cache when complete
  useEffect(() => {
    if (progress.phase === "complete" && mergedData.length > 0) {
      // Determine query key based on filter options
      const hasFilters = Boolean(options?.bookedBy || options?.dispatcherUserId);
      const queryKey = hasFilters 
        ? ["orders", "filtered", options?.bookedBy, options?.dispatcherUserId] 
        : ["orders"];
      
      queryClient.setQueryData(queryKey, mergedData);
      console.log(`[Progressive] Updated React Query cache with ${mergedData.length} orders`);
    }
  }, [progress.phase, mergedData, options, queryClient]);

  return {
    data: mergedData,
    isLoading: phase1Loading,
    isLoadingLocked: phase2Loading,
    progress,
    // Computed helpers
    unlockedCount: phase1Data?.length || 0,
    lockedCount: phase2Data?.length || 0,
    totalCount: mergedData.length,
    isPartialData: progress.phase !== "complete",
  };
}
