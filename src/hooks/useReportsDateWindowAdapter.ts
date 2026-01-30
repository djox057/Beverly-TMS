/**
 * useReportsDateWindowAdapter - Adapter layer for useReportsDateWindow
 *
 * This adapter transforms the output of useReportsDateWindow to match
 * the expected shape of the existing useReports hook, ensuring UI compatibility.
 *
 * It also re-exports mutations from useReports.ts to maintain full functionality.
 */

import { useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useReportsDateWindow, useOrderFilesOnDemand } from "./useReportsDateWindow";
import { useReports } from "./useReports";
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { useIndividualMode } from "@/contexts/IndividualModeContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Feature flag - set to true to use date-window based loading
export const USE_DATE_WINDOW_LOADING = true;

interface UseReportsDateWindowAdapterOptions {
  priorityOffice?: string | null;
  dispatcherId: string | null;
  dispatcherProfileId?: string | null;
  selectedDate: Date;
  /** When true, bypasses Individual Mode office restrictions (for search results) */
  hasActiveSearch?: boolean;
}

/**
 * Helper to get transfer-aware stops for a driver
 * Copied from useReports.ts to maintain consistency
 */
const getTransferAwareStops = (driverId: string, order: any, originalPickupStop: any, originalDeliveryStop: any) => {
  const transfers = order.order_transfers || [];

  if (transfers.length === 0) {
    return {
      effectivePickupStop: originalPickupStop,
      effectiveDeliveryStop: originalDeliveryStop,
      isTransferDriver: false,
      driverSequenceNumber: 0,
      segmentLabel: "",
    };
  }

  const sortedTransfers = [...transfers].sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));

  const isActualOriginalDriver = order.original_driver1_id === driverId || order.original_driver2_id === driverId;

  if (isActualOriginalDriver) {
    const originalDriverTransfer = sortedTransfers.find(
      (t: any) =>
        (t.driver1_id === driverId || t.driver2_id === driverId) &&
        (t.sequence_number === 0 || t.sequence_number === undefined || t.sequence_number === null),
    );

    if (originalDriverTransfer?.transfer_city) {
      return {
        effectivePickupStop: originalPickupStop,
        effectiveDeliveryStop: null,
        isTransferDriver: false,
        driverSequenceNumber: 0,
        segmentLabel: "Orig",
        transferDeliveryInfo: {
          city: originalDriverTransfer.transfer_city,
          state: originalDriverTransfer.transfer_state || "",
          address: originalDriverTransfer.transfer_address,
          datetime: originalDriverTransfer.transfer_datetime,
        },
      };
    }

    const firstTransfer = sortedTransfers[0];
    if (firstTransfer?.transfer_city) {
      return {
        effectivePickupStop: originalPickupStop,
        effectiveDeliveryStop: null,
        isTransferDriver: false,
        driverSequenceNumber: 0,
        segmentLabel: "Orig",
        transferDeliveryInfo: {
          city: firstTransfer.transfer_city,
          state: firstTransfer.transfer_state || "",
          address: firstTransfer.transfer_address,
          datetime: firstTransfer.transfer_datetime,
        },
      };
    }

    return {
      effectivePickupStop: originalPickupStop,
      effectiveDeliveryStop: originalDeliveryStop,
      isTransferDriver: false,
      driverSequenceNumber: 0,
      segmentLabel: transfers.length > 0 ? "Orig" : "",
    };
  }

  const driverTransfer = sortedTransfers.find((t: any) => t.driver1_id === driverId || t.driver2_id === driverId);

  if (driverTransfer) {
    const seqNum = driverTransfer.sequence_number || 1;
    const previousTransfer = sortedTransfers.find((t: any) => (t.sequence_number || 0) === seqNum - 1);
    const nextTransfer = sortedTransfers.find((t: any) => (t.sequence_number || 0) > seqNum);

    const pickupSource =
      previousTransfer?.transfer_city || previousTransfer?.transfer_state
        ? previousTransfer
        : driverTransfer.transfer_city || driverTransfer.transfer_state
          ? driverTransfer
          : undefined;

    const pickupInfo = pickupSource
      ? {
          city: pickupSource.transfer_city,
          state: pickupSource.transfer_state || "",
          address: pickupSource.transfer_address,
          datetime: driverTransfer.transfer_datetime || pickupSource.transfer_datetime,
        }
      : undefined;

    const deliveryInfo =
      nextTransfer?.transfer_city || nextTransfer?.transfer_state
        ? {
            city: nextTransfer.transfer_city,
            state: nextTransfer.transfer_state || "",
            address: nextTransfer.transfer_address,
            datetime: nextTransfer.transfer_datetime,
          }
        : undefined;

    return {
      effectivePickupStop: pickupInfo ? null : originalPickupStop,
      effectiveDeliveryStop: deliveryInfo ? null : originalDeliveryStop,
      isTransferDriver: true,
      driverSequenceNumber: seqNum,
      segmentLabel: `Rec ${seqNum}`,
      transferPickupInfo: pickupInfo,
      transferDeliveryInfo: deliveryInfo,
    };
  }

  return {
    effectivePickupStop: originalPickupStop,
    effectiveDeliveryStop: originalDeliveryStop,
    isTransferDriver: false,
    driverSequenceNumber: 0,
    segmentLabel: "",
  };
};

/**
 * Adapter hook that wraps useReportsDateWindow and transforms output
 * to match the shape expected by Reports.tsx
 */
export const useReportsDateWindowAdapter = (options: UseReportsDateWindowAdapterOptions) => {
  const { priorityOffice, dispatcherId, dispatcherProfileId, selectedDate, hasActiveSearch } = options;
  const queryClient = useQueryClient();
  
  // Get individual mode state - this controls database-level filtering
  const { individualMode, currentUserDispatcherId } = useIndividualMode();
  
  // Track previous mode to detect changes and invalidate cache
  const prevModeRef = useRef<{ individualMode: boolean; userId: string | null } | null>(null);
  
  // Fetch user's office to determine if viewing their own office
  const { data: userOffice } = useQuery({
    queryKey: ['user-office', currentUserDispatcherId],
    queryFn: async () => {
      if (!currentUserDispatcherId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('office')
        .eq('user_id', currentUserDispatcherId)
        .single();
      if (error) return null;
      return data?.office || null;
    },
    staleTime: 300000, // 5 minutes
    enabled: !!currentUserDispatcherId,
  });
  
  // Check if we're viewing a different office than user's own
  const isViewingOtherOffice = !!(userOffice && priorityOffice && userOffice !== priorityOffice);
  
  // Determine if we're viewing a non-user office in Individual Mode
  // In this case, we should show a message instead of loading data
  // EXCEPT: When there's an active search, we should load data for the search result
  const isViewingOtherOfficeInIndividualMode = individualMode && 
    isViewingOtherOffice &&
    !hasActiveSearch; // Allow loading when search is active
  
  // When searching across offices in Individual Mode, bypass the dispatcher filter
  // This allows search results from other offices to load properly
  const shouldBypassIndividualMode = hasActiveSearch && isViewingOtherOffice;
  
  // When individual mode changes, invalidate all adapter queries to force refetch with new scope
  useEffect(() => {
    const currentModeKey = { individualMode, userId: currentUserDispatcherId };
    const prevModeKey = prevModeRef.current;
    
    if (prevModeKey !== null) {
      const modeChanged = prevModeKey.individualMode !== currentModeKey.individualMode;
      
      if (modeChanged) {
        console.log(`[adapter] Individual mode changed: ${prevModeKey.individualMode} -> ${currentModeKey.individualMode}, invalidating queries`);
        
        // Invalidate all adapter queries to force refetch with new scope
        queryClient.invalidateQueries({ queryKey: ['reports-date-window'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-trucks'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-drivers'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-truck-notes'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-lost-day-notes'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-last-loads'] });
      }
    }
    
    prevModeRef.current = currentModeKey;
  }, [individualMode, currentUserDispatcherId, queryClient]);

  // Get date-window data (disabled when feature flag is OFF)
  // Pass individualMode and currentUserDispatcherId for database-level filtering
  // BUT: Skip fetching entirely when viewing another office in Individual Mode (without search)
  // When searching in another office, bypass Individual Mode to load the search target
  const dateWindowHook = useReportsDateWindow({
    dispatcherId: USE_DATE_WINDOW_LOADING && !isViewingOtherOfficeInIndividualMode ? dispatcherId : null,
    dispatcherProfileId,
    selectedDate,
    priorityOffice,
    // Disable individual mode filtering when: 1) viewing other office without search, or 2) searching in other office
    individualMode: (isViewingOtherOfficeInIndividualMode || shouldBypassIndividualMode) ? false : individualMode,
    currentUserDispatcherId: (isViewingOtherOfficeInIndividualMode || shouldBypassIndividualMode) ? null : currentUserDispatcherId,
  });

  // Legacy hook (for fallback when feature flag is OFF). When feature flag is ON,
  // we still call this hook, but in mutation-only mode (disableFetch=true).
  const legacyReportsHook = useReports({ priorityOffice, disableFetch: USE_DATE_WINDOW_LOADING });

  // Fetch additional data needed for transformation
  const driverIdsForScope = dateWindowHook.driverIds || [];
  const scopeEnabled = USE_DATE_WINDOW_LOADING && !!dispatcherId && driverIdsForScope.length > 0;
  
  // Create a mode-specific key suffix to force refetch on individual mode toggle
  const modeKeySuffix = individualMode ? `individual-${currentUserDispatcherId}` : 'all';

  const { data: trucks } = useQuery({
    queryKey: ["adapter-trucks", priorityOffice, modeKeySuffix],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select("*")
        .eq("is_active", true)
        .or(`driver1_id.in.(${driverIdsForScope.join(",")}),driver2_id.in.(${driverIdsForScope.join(",")})`);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: scopeEnabled,
  });

  // Get all trailer IDs from trucks to fetch trailer numbers
  const trailerIdsFromTrucks = useMemo(() => {
    if (!trucks) return [];
    const ids = new Set<string>();
    for (const t of trucks) {
      if (t.trailer_id) ids.add(t.trailer_id);
    }
    return Array.from(ids);
  }, [trucks]);

  const { data: trailers } = useQuery({
    queryKey: ["adapter-trailers", trailerIdsFromTrucks.join(","), modeKeySuffix],
    queryFn: async () => {
      if (trailerIdsFromTrucks.length === 0) return [];
      const { data, error } = await supabase
        .from("trailers")
        .select("id, trailer_number, dot_inspection_date")
        .in("id", trailerIdsFromTrucks);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: scopeEnabled && trailerIdsFromTrucks.length > 0,
  });

  const { data: drivers } = useQuery({
    queryKey: ["adapter-drivers", priorityOffice, modeKeySuffix],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("is_active", true)
        .in("id", driverIdsForScope);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: scopeEnabled,
  });

  // Get unique dispatcher IDs from the drivers we're loading - use stable string for queryKey
  const dispatcherIdsFromDrivers = useMemo(() => {
    if (!drivers) return [];
    const ids = new Set<string>();
    for (const d of drivers) {
      if (d.dispatcher_id) ids.add(d.dispatcher_id);
    }
    return Array.from(ids).sort();
  }, [drivers]);

  // Create a stable string key to prevent React Query re-renders
  const dispatcherIdsKey = dispatcherIdsFromDrivers.join(",");

  const { data: dispatchers } = useQuery({
    queryKey: ["adapter-dispatchers", dispatcherIdsKey],
    queryFn: async () => {
      if (!dispatcherIdsKey) return [];
      const ids = dispatcherIdsKey.split(",");
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, office, ext, created_at")
        .in("user_id", ids);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
    enabled: scopeEnabled && dispatcherIdsKey.length > 0,
  });

  const { data: companies } = useQuery({
    queryKey: ["adapter-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
    enabled: scopeEnabled,
  });

  const { data: truckNotes } = useQuery({
    queryKey: ["adapter-truck-notes", priorityOffice, modeKeySuffix],
    queryFn: async () => {
      // Order by updated_at DESC so when there are duplicates, the most recent comes first
      const { data, error } = await supabase
        .from("truck_notes")
        .select("*")
        .in("driver_id", driverIdsForScope)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: scopeEnabled,
  });

  const { data: lostDayNotes } = useQuery({
    queryKey: ["adapter-lost-day-notes", priorityOffice, modeKeySuffix],
    queryFn: async () => {
      const { data, error } = await supabase.from("lost_day_notes").select("*").in("driver_id", driverIdsForScope);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: scopeEnabled,
  });

  // Get order IDs from date window for order_files fetch
  const windowOrderIds = useMemo(() => {
    if (!dateWindowHook.orders || dateWindowHook.orders.length === 0) return [];
    return dateWindowHook.orders.map((o) => o.id);
  }, [dateWindowHook.orders]);

  // Create a robust hash of all order IDs to prevent cache collisions between offices
  // Uses a simple but effective string hash function
  const orderIdsHash = useMemo(() => {
    if (windowOrderIds.length === 0) return "";
    // Sort IDs to ensure consistent hashing regardless of order
    const sortedIds = [...windowOrderIds].sort();
    const str = sortedIds.join(",");
    // Simple hash: djb2 algorithm
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${windowOrderIds.length}-${Math.abs(hash).toString(36)}`;
  }, [windowOrderIds]);

  // Store order IDs as JSON in query key to avoid stale closure issues
  const orderIdsForQuery = useMemo(() => {
    return JSON.stringify(windowOrderIds);
  }, [windowOrderIds]);

  // Fetch order_files for all orders in the date window (minimal fields for coloring)
  // P1: Paginate result rows with stable ordering to avoid PostgREST 1000-row cap
  const { data: orderFiles, isLoading: isOrderFilesLoading } = useQuery({
    queryKey: ["adapter-order-files", priorityOffice, orderIdsHash, orderIdsForQuery],
    queryFn: async ({ queryKey }) => {
      // Extract order IDs from query key to avoid stale closure
      const orderIdsJson = queryKey[3] as string;
      const orderIds: string[] = orderIdsJson ? JSON.parse(orderIdsJson) : [];
      
      if (orderIds.length === 0) return [];
      
      // Fetch in batches of order IDs, AND paginate result rows per batch
      const ORDER_ID_BATCH_SIZE = 300; // Smaller batch to reduce result rows per request
      const RESULT_PAGE_SIZE = 1000;
      const allFiles: any[] = [];
      let truncationWarnings = 0;
      
      for (let i = 0; i < orderIds.length; i += ORDER_ID_BATCH_SIZE) {
        const batch = orderIds.slice(i, i + ORDER_ID_BATCH_SIZE);
        
        // Paginate result rows for this batch
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
          const { data, error } = await supabase
            .from("order_files")
            .select("id, order_id, file_category, file_name, file_path")
            .in("order_id", batch)
            .order("id", { ascending: true }) // Stable ordering for pagination
            .range(offset, offset + RESULT_PAGE_SIZE - 1);
          
          if (error) {
            console.error("[adapter] Error fetching order_files batch:", error);
            break;
          }
          
          if (data) {
            allFiles.push(...data);
            
            // P1: Warn if we hit exactly the page size (strong signal of truncation)
            if (data.length === RESULT_PAGE_SIZE) {
              truncationWarnings++;
              console.warn(
                `[adapter] order_files batch returned exactly ${RESULT_PAGE_SIZE} rows - paginating to fetch more (batch ${Math.floor(i / ORDER_ID_BATCH_SIZE) + 1}, page ${Math.floor(offset / RESULT_PAGE_SIZE) + 1})`
              );
            }
            
            // Continue if we got a full page
            hasMore = data.length === RESULT_PAGE_SIZE;
            offset += RESULT_PAGE_SIZE;
          } else {
            hasMore = false;
          }
        }
      }
      
      if (truncationWarnings > 0) {
        console.log(`[adapter] Successfully paginated through ${truncationWarnings} truncated batches`);
      }
      console.log(`[adapter] Fetched ${allFiles.length} order_files for ${orderIds.length} orders`);
      return allFiles;
    },
    staleTime: 30000,
    enabled: scopeEnabled && windowOrderIds.length > 0,
  });

  // Track drivers who have orders in the date window
  const driversWithOrdersInWindow = useMemo(() => {
    const driverSet = new Set<string>();
    for (const order of dateWindowHook.orders || []) {
      if (order.driver1_id) driverSet.add(order.driver1_id);
      if (order.driver2_id) driverSet.add(order.driver2_id);
      // Also check transfer drivers
      for (const transfer of order.order_transfers || []) {
        if (transfer.driver1_id) driverSet.add(transfer.driver1_id);
        if (transfer.driver2_id) driverSet.add(transfer.driver2_id);
      }
    }
    return driverSet;
  }, [dateWindowHook.orders]);

  // Identify drivers with no loads in the date window (need their last load)
  const driversNeedingLastLoad = useMemo(() => {
    if (!drivers || drivers.length === 0) return [];
    return drivers.filter(d => !driversWithOrdersInWindow.has(d.id)).map(d => d.id);
  }, [drivers, driversWithOrdersInWindow]);

  // Create stable query key for last loads
  const driversNeedingLastLoadKey = useMemo(() => {
    return driversNeedingLastLoad.sort().join(",");
  }, [driversNeedingLastLoad]);

  // Fetch last load for drivers with no orders in the date window
  const { data: lastLoadsData } = useQuery({
    queryKey: ["adapter-last-loads", priorityOffice, driversNeedingLastLoadKey, modeKeySuffix],
    queryFn: async () => {
      if (driversNeedingLastLoad.length === 0) return { orders: [], files: [] };
      
      console.log(`[adapter] Fetching last load for ${driversNeedingLastLoad.length} drivers with no recent loads`);
      
      // Fetch the most recent order for each driver (by delivery_datetime DESC)
      // We need to get one order per driver, so fetch recent orders and pick the latest per driver
      const driverIdsStr = driversNeedingLastLoad.join(',');
      
      const { data: recentOrders, error } = await supabase
        .from("orders")
        .select(`
          id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
          created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
          canceled, driver1_id, driver2_id, truck_id, trailer_id, broker_id, company_id, booked_by_company_id,
          is_recovery, locked, mileage, loaded_miles, dh_miles, original_driver1_id, original_driver2_id,
          freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
          tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver, booked_by
        `)
        .or(`driver1_id.in.(${driverIdsStr}),driver2_id.in.(${driverIdsStr})`)
        .eq("canceled", false)
        .order("delivery_datetime", { ascending: false })
        .limit(driversNeedingLastLoad.length * 3); // Get a few per driver to ensure we have one for each
      
      if (error) {
        console.error("[adapter] Error fetching last loads:", error);
        return { orders: [], files: [] };
      }
      
      // Pick the most recent order per driver
      const lastOrderByDriver = new Map<string, any>();
      for (const order of recentOrders || []) {
        if (order.driver1_id && driversNeedingLastLoad.includes(order.driver1_id) && !lastOrderByDriver.has(order.driver1_id)) {
          lastOrderByDriver.set(order.driver1_id, order);
        }
        if (order.driver2_id && driversNeedingLastLoad.includes(order.driver2_id) && !lastOrderByDriver.has(order.driver2_id)) {
          lastOrderByDriver.set(order.driver2_id, order);
        }
      }
      
      const lastOrders = Array.from(lastOrderByDriver.values());
      
      if (lastOrders.length === 0) {
        return { orders: [], files: [] };
      }
      
      // Fetch pickup_drops and order_transfers for these orders
      const orderIds = lastOrders.map(o => o.id);
      
      const [pickupDrops, transfers, files] = await Promise.all([
        (async () => {
          const { data } = await supabase
            .from("pickup_drops")
            .select("id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at")
            .in("order_id", orderIds);
          return data || [];
        })(),
        (async () => {
          const { data } = await supabase
            .from("order_transfers")
            .select("id, order_id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, transfer_city, transfer_state, transfer_address, transfer_datetime")
            .in("order_id", orderIds);
          return data || [];
        })(),
        (async () => {
          const { data } = await supabase
            .from("order_files")
            .select("id, order_id, file_category, file_name, file_path")
            .in("order_id", orderIds);
          return data || [];
        })()
      ]);
      
      // Build lookup maps
      const pickupDropsByOrderId = new Map<string, any[]>();
      for (const pd of pickupDrops) {
        const arr = pickupDropsByOrderId.get(pd.order_id) || [];
        arr.push(pd);
        pickupDropsByOrderId.set(pd.order_id, arr);
      }
      
      const transfersByOrderId = new Map<string, any[]>();
      for (const t of transfers) {
        const arr = transfersByOrderId.get(t.order_id) || [];
        arr.push(t);
        transfersByOrderId.set(t.order_id, arr);
      }
      
      // Attach relations and mark as "last load"
      const enrichedOrders = lastOrders.map(order => ({
        ...order,
        pickup_drops: (pickupDropsByOrderId.get(order.id) || [])
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)),
        order_transfers: (transfersByOrderId.get(order.id) || [])
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)),
        isLastLoadFallback: true, // Mark this as a fallback last load
      }));
      
      console.log(`[adapter] Fetched ${enrichedOrders.length} last loads for drivers with no recent activity`);
      
      return { orders: enrichedOrders, files };
    },
    staleTime: 60000,
    enabled: scopeEnabled && driversNeedingLastLoad.length > 0,
  });

  // P2: Subscribe to order_files realtime changes to invalidate adapter cache
  const orderFilesChannelRef = useRef<RealtimeChannel | null>(null);
  
  useEffect(() => {
    if (!scopeEnabled) return;
    
    // Subscribe to order_files changes
    const channel = supabase
      .channel("adapter-order-files-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_files" },
        (payload) => {
          const orderId = (payload.new as any)?.order_id || (payload.old as any)?.order_id;
          console.log(`[adapter] order_files realtime: ${payload.eventType} for order ${orderId}`);
          
          // Invalidate adapter-order-files queries (only active ones to avoid refetch storms)
          queryClient.invalidateQueries({
            queryKey: ["adapter-order-files"],
            refetchType: "active",
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[adapter] Subscribed to order_files realtime");
        }
      });
    
    orderFilesChannelRef.current = channel;
    
    return () => {
      if (orderFilesChannelRef.current) {
        supabase.removeChannel(orderFilesChannelRef.current);
        orderFilesChannelRef.current = null;
      }
    };
  }, [scopeEnabled, queryClient]);

  // P3: Subscribe to truck_notes realtime changes and patch cache directly (no refetch)
  const truckNotesChannelRef = useRef<RealtimeChannel | null>(null);
  const driverIdsSetRef = useRef<Set<string>>(new Set());
  
  // Keep driver IDs in a ref to avoid stale closures in subscription callback
  useEffect(() => {
    driverIdsSetRef.current = new Set(driverIdsForScope);
  }, [driverIdsForScope]);
  
  useEffect(() => {
    if (!scopeEnabled || driverIdsForScope.length === 0) {
      // Cleanup any existing channel when disabled
      if (truckNotesChannelRef.current) {
        supabase.removeChannel(truckNotesChannelRef.current);
        truckNotesChannelRef.current = null;
      }
      return;
    }
    
    // Avoid duplicate subscriptions
    if (truckNotesChannelRef.current) return;
    
    const channelName = `adapter-truck-notes-realtime-${priorityOffice || 'default'}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "truck_notes" },
        (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const driverId = newRecord?.driver_id || oldRecord?.driver_id;
          const eventType = payload.eventType;
          
          // Scope filtering: ignore events for drivers not in current scope
          if (!driverId || !driverIdsSetRef.current.has(driverId)) {
            console.log(`[adapter] truck_notes realtime: ${eventType} ignored - driver ${driverId} not in scope`);
            return;
          }
          
          console.log(`[adapter] truck_notes realtime: ${eventType} for driver ${driverId}`);
          
          // Patch the cache directly using setQueryData
          queryClient.setQueryData(
            ["adapter-truck-notes", priorityOffice],
            (oldData: any[] | undefined) => {
              if (!oldData) return oldData;
              
              if (eventType === "DELETE") {
                // Remove note by id
                return oldData.filter((note) => note.id !== oldRecord.id);
              }
              
              if (eventType === "INSERT") {
                // Append if not already present
                const exists = oldData.some((note) => note.id === newRecord.id);
                if (exists) {
                  // Update instead (in case of race condition)
                  return oldData.map((note) => (note.id === newRecord.id ? newRecord : note));
                }
                return [...oldData, newRecord];
              }
              
              if (eventType === "UPDATE") {
                // Replace existing by id
                const existingIndex = oldData.findIndex((note) => note.id === newRecord.id);
                if (existingIndex >= 0) {
                  const updated = [...oldData];
                  updated[existingIndex] = newRecord;
                  return updated;
                }
                // If not in cache yet, append it
                return [...oldData, newRecord];
              }
              
              return oldData;
            }
          );
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[adapter] Subscribed to truck_notes realtime for office: ${priorityOffice}`);
        }
      });
    
    truckNotesChannelRef.current = channel;
    
    return () => {
      if (truckNotesChannelRef.current) {
        console.log(`[adapter] Unsubscribing from truck_notes realtime for office: ${priorityOffice}`);
        supabase.removeChannel(truckNotesChannelRef.current);
        truckNotesChannelRef.current = null;
      }
    };
  }, [scopeEnabled, driverIdsForScope.length, priorityOffice, queryClient]);

  // Build order_files lookup map (include files from last loads)
  const orderFilesMap = useMemo(() => {
    const map = new Map<string, any[]>();
    // Add regular order files
    if (orderFiles) {
      for (const file of orderFiles) {
        if (!file.order_id) continue;
        const existing = map.get(file.order_id) || [];
        existing.push(file);
        map.set(file.order_id, existing);
      }
    }
    // Add files from last loads (for drivers with no recent activity)
    if (lastLoadsData?.files) {
      for (const file of lastLoadsData.files) {
        if (!file.order_id) continue;
        if (map.has(file.order_id)) continue; // Don't duplicate
        const existing = map.get(file.order_id) || [];
        existing.push(file);
        map.set(file.order_id, existing);
      }
    }
    return map;
  }, [orderFiles, lastLoadsData?.files]);

  // Transform date-window orders into the expected Reports shape
  const transformedData = useMemo(() => {
    if (!USE_DATE_WINDOW_LOADING) return null;
    if (dateWindowHook.isLoading) return null;
    if (!dateWindowHook.driverIds || dateWindowHook.driverIds.length === 0) return [];
    if (!dateWindowHook.orders) return [];
    if (!trucks || !drivers || !dispatchers || !companies) return null;
    
    // Wait for order_files to load before transforming
    // This prevents rendering with empty files during the query cascade
    if (windowOrderIds.length > 0 && isOrderFilesLoading) return null;

    // Enrich orders with order_files before processing
    const orders = dateWindowHook.orders.map((order) => ({
      ...order,
      order_files: orderFilesMap.get(order.id) || [],
    }));
    const driverIds = dateWindowHook.driverIds;

    // Build lookup maps
    const truckMap = new Map(trucks.map((t) => [t.id, t]));
    const driverMap = new Map(drivers.map((d) => [d.id, d]));
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));
    const dispatcherMap = new Map(dispatchers.map((d) => [d.user_id, d]));
    const trailerMap = new Map((trailers || []).map((t) => [t.id, { trailer_number: t.trailer_number, dot_inspection_date: t.dot_inspection_date }]));
    const truckByDriverId = new Map(trucks.filter((t) => t.driver1_id).map((t) => [t.driver1_id, t]));
    // Build map selecting the newest note per driver.
    // IMPORTANT: Some drivers have many duplicate truck_notes rows; array order can be arbitrary
    // (especially after realtime patching). Always pick the max(updated_at) record.
    const notesByDriverId = new Map<string, any>();
    for (const n of truckNotes || []) {
      const driverId = n?.driver_id as string | undefined;
      if (!driverId) continue;

      const existing = notesByDriverId.get(driverId);
      if (!existing) {
        notesByDriverId.set(driverId, n);
        continue;
      }

      const existingTs = existing?.updated_at ? Date.parse(existing.updated_at) : 0;
      const nextTs = n?.updated_at ? Date.parse(n.updated_at) : 0;

      if (nextTs > existingTs) {
        notesByDriverId.set(driverId, n);
      }
    }
    const lostNotesByDriverId = new Map<string, any[]>();
    for (const note of lostDayNotes || []) {
      const existing = lostNotesByDriverId.get(note.driver_id) || [];
      existing.push(note);
      lostNotesByDriverId.set(note.driver_id, existing);
    }

    // Group orders by driver
    const ordersByDriverId = new Map<string, any[]>();
    for (const order of orders) {
      // Add to driver1
      if (order.driver1_id) {
        const existing = ordersByDriverId.get(order.driver1_id) || [];
        existing.push(order);
        ordersByDriverId.set(order.driver1_id, existing);
      }
      // Add to driver2
      if (order.driver2_id && order.driver2_id !== order.driver1_id) {
        const existing = ordersByDriverId.get(order.driver2_id) || [];
        existing.push(order);
        ordersByDriverId.set(order.driver2_id, existing);
      }
      // Add to transfer drivers
      for (const transfer of order.order_transfers || []) {
        if (transfer.driver1_id && !ordersByDriverId.get(transfer.driver1_id)?.includes(order)) {
          const existing = ordersByDriverId.get(transfer.driver1_id) || [];
          existing.push(order);
          ordersByDriverId.set(transfer.driver1_id, existing);
        }
        if (
          transfer.driver2_id &&
          transfer.driver2_id !== transfer.driver1_id &&
          !ordersByDriverId.get(transfer.driver2_id)?.includes(order)
        ) {
          const existing = ordersByDriverId.get(transfer.driver2_id) || [];
          existing.push(order);
          ordersByDriverId.set(transfer.driver2_id, existing);
        }
      }
    }

    // Add last loads for drivers with no orders in the date window
    if (lastLoadsData?.orders) {
      for (const lastOrder of lastLoadsData.orders) {
        // Enrich with order_files
        const enrichedOrder = {
          ...lastOrder,
          order_files: orderFilesMap.get(lastOrder.id) || [],
        };
        
        // Add to driver1 if they have no orders yet
        if (lastOrder.driver1_id && !ordersByDriverId.has(lastOrder.driver1_id)) {
          ordersByDriverId.set(lastOrder.driver1_id, [enrichedOrder]);
        }
        // Add to driver2 if they have no orders yet
        if (lastOrder.driver2_id && !ordersByDriverId.has(lastOrder.driver2_id)) {
          ordersByDriverId.set(lastOrder.driver2_id, [enrichedOrder]);
        }
      }
    }

    // Helper to format stop info
    const formatStopInfo = (stop: any, orderStartTime?: string) => {
      if (!stop) return { id: null, location: "—", date: "—", time: "—" };
      let location = "—";
      const parts = [];
      if (stop.address) parts.push(stop.address);
      if (stop.city) parts.push(stop.city);
      if (stop.state) parts.push(stop.state);
      if (parts.length > 0) {
        location = parts.join(", ");
        if (location.length > 30) location = location.substring(0, 30) + "...";
      }
      let date = "—";
      let time = "—";
      const datetimeToUse = orderStartTime || stop.datetime;
      if (datetimeToUse) {
        const parsed = parseSimpleDateTime(datetimeToUse);
        date = parsed.dateString;
        time = parsed.timeString;
      }
      return { id: stop.id, location, date, time };
    };

    // Build dispatcher groups
    const dispatcherGroups = new Map<string, any>();

    // Build a set of driver2 IDs to skip (they'll be shown as part of the team on driver1's row)
    const driver2IdsToSkip = new Set<string>();
    for (const truck of trucks) {
      if (truck.driver1_id && truck.driver2_id) {
        driver2IdsToSkip.add(truck.driver2_id);
      }
    }

    for (const driverId of driverIds) {
      const driver = driverMap.get(driverId);
      if (!driver) continue;

      // Skip driver2s - they are shown on the same row as driver1 (team)
      if (driver2IdsToSkip.has(driverId)) continue;

      const dispatcherInfo = driver.dispatcher_id ? dispatcherMap.get(driver.dispatcher_id) : null;
      if (!dispatcherInfo) continue;

      const dispatcherId = driver.dispatcher_id!;

      // Get or create dispatcher group
      if (!dispatcherGroups.has(dispatcherId)) {
        dispatcherGroups.set(dispatcherId, {
          dispatcher: dispatcherInfo.full_name || dispatcherInfo.email || "Unknown",
          dispatcherId,
          office: dispatcherInfo.office || null,
          ext: dispatcherInfo.ext || null,
          createdAt: dispatcherInfo.created_at || null, // For sorting by user creation date
          trucks: [],
          isOffDuty: false,
        });
      }

      const group = dispatcherGroups.get(dispatcherId)!;
      const driverOrders = ordersByDriverId.get(driverId) || [];
      const truck = truckByDriverId.get(driverId);
      const note = notesByDriverId.get(driverId);
      const driverLostNotes = lostNotesByDriverId.get(driverId) || [];
      const companyName = driver.company_id ? companyMap.get(driver.company_id) : null;

      // Sort orders by pickup_datetime
      const sortedOrders = [...driverOrders].sort((a, b) => {
        const aDate = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : 0;
        const bDate = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : 0;
        return bDate - aDate;
      });

      // Find current order (most recent with BOL but no POD, or most recent)
      let currentOrder = sortedOrders[0] || null;

      // Build allOrders array with pickup/delivery stops
      const allOrdersWithStops = sortedOrders.map((order) => {
        const pickupStops = (order.pickup_drops || [])
          .filter((pd: any) => pd.type === "pickup")
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));
        const deliveryStops = (order.pickup_drops || [])
          .filter((pd: any) => pd.type === "delivery")
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));

        const pickupStop = pickupStops[0] || null;
        const deliveryStop = deliveryStops[deliveryStops.length - 1] || null;

        const transferInfo = getTransferAwareStops(driverId, order, pickupStop, deliveryStop);

        // Build loadDetails for popup compatibility (matches useReports.ts structure)
        const loadDetails = {
          loadNumber: order.internal_load_number || "—",
          brokerLoadNumber: order.broker_load_number || "—",
          companyName: driver.company_id ? companyMap.get(driver.company_id) : null,
          pickupInfo: pickupStop
            ? {
                address: pickupStop.address || "—",
                city: pickupStop.city || "—",
                state: pickupStop.state || "—",
                zipCode: pickupStop.zip_code || "",
                datetime: pickupStop.datetime || order.pickup_datetime || "—",
                endDatetime: order.pickup_end_datetime || "—",
              }
            : null,
          deliveryInfo: deliveryStop
            ? {
                address: deliveryStop.address || "—",
                city: deliveryStop.city || "—",
                state: deliveryStop.state || "—",
                zipCode: deliveryStop.zip_code || "",
                datetime: deliveryStop.datetime || order.delivery_datetime || "—",
                endDatetime: order.delivery_end_datetime || "—",
              }
            : null,
          // P3: Normalize file_category to uppercase for legacy records
          documents: (order.order_files || []).map((f: any) => ({
            category: String(f.file_category || "").toUpperCase(),
          })),
          notes: order.notes || "",
        };

        return {
          ...order,
          pickupStops,
          deliveryStops,
          pickupStop: transferInfo.effectivePickupStop || pickupStop,
          deliveryStop: transferInfo.effectiveDeliveryStop || deliveryStop,
          transferPickupInfo: transferInfo.transferPickupInfo,
          transferDeliveryInfo: transferInfo.transferDeliveryInfo,
          segmentLabel: transferInfo.segmentLabel,
          isTransferDriver: transferInfo.isTransferDriver,
          isActive: order.status === "pending" || order.status === "in_transit",
          loadDetails,
        };
      });

      // Determine status
      let truckStatus = "Available";
      if (currentOrder) {
        switch (currentOrder.status) {
          case "pending":
            truckStatus = "Loading";
            break;
          case "in_transit":
            truckStatus = "In Transit";
            break;
          case "delivered":
            truckStatus = "Available";
            break;
          default:
            truckStatus = "Available";
        }
      }

      // Build home string
      const homeString =
        driver.home_city && driver.home_state
          ? `${driver.home_city}, ${driver.home_state}`
          : driver.home_city || driver.home_state || "—";

      // HOS data
      const driveMinutes = driver.hos_drive_minutes || 0;
      const shiftMinutes = driver.hos_shift_minutes || 0;
      const breakMinutes = driver.hos_break_minutes || 0;
      const cycleMinutes = driver.hos_cycle_minutes || 0;
      const formatHosTime = (minutes: number) =>
        `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}h`;

      // Current order stops
      const currentPickup = currentOrder?.pickupStop || null;
      const currentDelivery = currentOrder?.deliveryStop || null;

      // Get driver2 info if this is a team truck
      const driver2 = truck?.driver2_id ? driverMap.get(truck.driver2_id) : null;
      
      // Get trailer info from lookup (includes number and DOT date)
      const trailerInfo = truck?.trailer_id ? trailerMap.get(truck.trailer_id) : null;

      group.trucks.push({
        id: truck?.id || `driver-${driverId}`,
        orderId: currentOrder?.id || null,
        truckNumber: truck?.truck_number || null,
        companyName,
        driver: driver2 ? "Team" : driver.name,
        driver1Name: driver.name,
        driverId: driver.id,
        driverPhone: driver.phone || null,
        driverEmail: driver.email || null,
        driver2Id: driver2?.id || null,
        driver2Name: driver2?.name || null,
        driver2Phone: driver2?.phone || null,
        driver2Email: driver2?.email || null,
        // Emergency contact info (from driver1)
        emergencyContactName: driver.emergency_contact_name || null,
        emergencyContactRelation: driver.emergency_contact_relation || null,
        emergencyContactPhone: driver.emergency_contact_phone || null,
        trailerNumber: trailerInfo?.trailer_number || null,
        home: homeString,
        dispatcher: dispatcherInfo.full_name || dispatcherInfo.email || "Unknown",
        dispatcherId,
        currentDispatcherName: null,
        status: truckStatus,
        pickup: formatStopInfo(currentPickup, currentOrder?.pickup_datetime),
        delivery: formatStopInfo(currentDelivery, currentOrder?.delivery_datetime),
        awayDays: currentOrder
          ? Math.floor((Date.now() - new Date(currentOrder.updated_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        driveHours: formatHosTime(driveMinutes),
        shiftHours: formatHosTime(shiftMinutes),
        cycleHours: formatHosTime(cycleMinutes),
        driveMinutes,
        shiftMinutes,
        breakMinutes,
        cycleMinutes,
        hosStatus: driver.hos_status || null,
        hosLastUpdated: driver.hos_last_updated || null,
        twoWeekBlockDate: driver.two_week_block_date || null,
        randomDrugTestDate: driver.random_drug_test_date || null,
        note: note?.note || "",
        lastEdit: note?.updated_at ? new Date(note.updated_at).toLocaleTimeString() : new Date().toLocaleTimeString(),
        editDate: note?.updated_at ? new Date(note.updated_at).toLocaleDateString() : new Date().toLocaleDateString(),
        allOrders: allOrdersWithStops,
        activeOrders: allOrdersWithStops.filter((o) => o.isActive),
        activeOrdersCount: allOrdersWithStops.filter((o) => o.isActive).length,
        totalOrdersCount: driverOrders.length,
        hasMultipleOrders: driverOrders.length > 1,
        lost_day_notes: driverLostNotes,
        lostDayNotes: driverLostNotes,
        milesAway: truck?.miles_away || 0,
        totalMiles: currentOrder?.loaded_miles || 0,
        goingYard: driver.going_yard || false,
        isOffDutyDriver: false,
        // Additional fields for compatibility
        hireDate: driver.hire_date,
        driverCreatedAt: driver.created_at || null, // For sorting by driver creation date
        // Maintenance dates (snake_case to match helper functions in helpers.ts)
        oil_change_date: truck?.oil_change_date || null,
        tires_swap_date: truck?.tires_swap_date || null,
        maintenance_check_date: truck?.maintenance_check_date || null,
        // DOT inspection dates (snake_case to match helper functions)
        dot_inspection_date: truck?.dot_inspection_date || null,
        trailer_dot_inspection_date: trailerInfo?.dot_inspection_date || null,
      });
    }

    // Convert to array and filter by office if needed
    let groupedData = Array.from(dispatcherGroups.values());

    if (priorityOffice) {
      groupedData = groupedData.filter((g) => g.office === priorityOffice);
    }

    // Sort dispatchers:
    // 1. Current user first (their own section)
    // 2. Off-duty dispatchers last
    // 3. All others sorted by profile created_at ASC (oldest first)
    groupedData.sort((a, b) => {
      // Current user always first
      const aIsCurrentUser = a.dispatcherId === dispatcherId;
      const bIsCurrentUser = b.dispatcherId === dispatcherId;
      if (aIsCurrentUser && !bIsCurrentUser) return -1;
      if (!aIsCurrentUser && bIsCurrentUser) return 1;

      // Off-duty dispatchers always go to the end
      if (a.isOffDuty && !b.isOffDuty) return 1;
      if (!a.isOffDuty && b.isOffDuty) return -1;

      // Sort by created_at ASC (oldest dispatchers first)
      const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aCreatedAt - bCreatedAt;
    });

    // Sort drivers (trucks) within each dispatcher by driver created_at ASC
    for (const group of groupedData) {
      group.trucks.sort((a: any, b: any) => {
        const aCreatedAt = a.driverCreatedAt ? new Date(a.driverCreatedAt).getTime() : 0;
        const bCreatedAt = b.driverCreatedAt ? new Date(b.driverCreatedAt).getTime() : 0;
        return aCreatedAt - bCreatedAt;
      });
    }

    return groupedData;
  }, [
    dateWindowHook.orders,
    dateWindowHook.driverIds,
    dateWindowHook.isLoading,
    trucks,
    drivers,
    dispatchers,
    companies,
    truckNotes,
    lostDayNotes,
    orderFilesMap,
    priorityOffice,
    dispatcherId,
    isOrderFilesLoading,
    windowOrderIds,
    lastLoadsData,
  ]);

  // Individual mode filtering already applied at database level in useReportsDateWindow
  // This secondary filter is kept as a safety net but should be no-op when DB filtering works
  const filteredData = useMemo(() => {
    // CRITICAL: Early return when Individual mode is OFF - zero overhead
    if (!individualMode || !transformedData) {
      return transformedData;
    }
    
    // Individual mode: filter to show only user's own drivers (safety net)
    return transformedData.filter(group => group.dispatcherId === currentUserDispatcherId);
  }, [individualMode, transformedData, currentUserDispatcherId]);

  if (!USE_DATE_WINDOW_LOADING) {
    return legacyReportsHook;
  }

  return {
    // Data from date-window with transformation (filtered when individual mode is ON)
    data: filteredData,
    // When viewing other office in Individual Mode, NOT loading - just empty
    isLoading: isViewingOtherOfficeInIndividualMode 
      ? false 
      : (dateWindowHook.isLoading || (windowOrderIds.length > 0 && isOrderFilesLoading)),
    isPending: isViewingOtherOfficeInIndividualMode ? false : dateWindowHook.isLoading,
    isError: !!dateWindowHook.error,
    error: dateWindowHook.error,
    isSuccess: isViewingOtherOfficeInIndividualMode ? true : (!dateWindowHook.isLoading && !dateWindowHook.error),
    isFetchingBackground: false,
    // Flag for UI to show Individual Mode message
    isViewingOtherOfficeInIndividualMode,
    refetch: dateWindowHook.refetch,

    // Date window specific
    dateWindow: dateWindowHook.dateWindow,
    prefetchAdjacentWindows: dateWindowHook.prefetchAdjacentWindows,
    loadedWindowCount: dateWindowHook.loadedWindowCount,

    // Re-export mutations (works even with legacy disableFetch=true)
    updateTruckStatus: legacyReportsHook.updateTruckStatus,
    updateTruckMilesAway: legacyReportsHook.updateTruckMilesAway,
    updateTruckNote: legacyReportsHook.updateTruckNote,
    updatePickupDrop: legacyReportsHook.updatePickupDrop,
    updateLostDayNote: legacyReportsHook.updateLostDayNote,
    updatePickupDropArrival: legacyReportsHook.updatePickupDropArrival,
    updateCheckInOutTimes: legacyReportsHook.updateCheckInOutTimes,
    markGoingToPickup: legacyReportsHook.markGoingToPickup,
    markGoingToDelivery: legacyReportsHook.markGoingToDelivery,
  };
};

export { useOrderFilesOnDemand };
export default useReportsDateWindowAdapter;
