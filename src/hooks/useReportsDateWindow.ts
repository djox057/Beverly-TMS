/**
 * useReportsDateWindow - Date-window based data loading for Reports page
 * 
 * This hook implements efficient date-window loading:
 * - Initial load: 2 days before → 3 days after current date
 * - Calendar navigation: lazy loading per date window
 * - Database-level filtering by dispatcher's drivers
 * - Accumulative caching (keeps all visited date windows)
 * - Order files loaded on-demand only
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { format, addDays, subDays, startOfDay } from "date-fns";

// Helper to check if a date string matches today (no timezone conversion)
const isPickupDateToday = (pickupDatetime: string | null | undefined): boolean => {
  if (!pickupDatetime) return false;
  // Extract just the date part (YYYY-MM-DD) from the datetime string
  const datePart = pickupDatetime.substring(0, 10);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return datePart === todayStr;
};

// Types
export interface DateWindow {
  startDate: Date;
  endDate: Date;
}

export interface ReportsDateWindowOptions {
  dispatcherId: string | null;
  dispatcherProfileId?: string | null;
  selectedDate: Date;
  /** Office to filter dispatchers by (e.g., "Čačak"). Used to match legacy useReports behavior. */
  priorityOffice?: string | null;
  /** When true, only loads the current user's drivers (Individual mode) */
  individualMode?: boolean;
  /** The current user's dispatcher ID for Individual mode filtering */
  currentUserDispatcherId?: string | null;
}

// Helper to format date for Supabase queries
const formatDateForQuery = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
};

// Calculate date window based on selected date
export const calculateDateWindow = (selectedDate: Date, direction: 'initial' | 'past' | 'future'): DateWindow => {
  const baseDate = startOfDay(selectedDate);
  
  if (direction === 'initial') {
    // Initial load: 2 days before → 3 days after selected date
    // This ensures the selected date is always covered
    return {
      startDate: subDays(baseDate, 2),
      endDate: addDays(baseDate, 3),
    };
  } else if (direction === 'past') {
    // Past navigation: selected date - 1 day buffer
    return {
      startDate: subDays(baseDate, 1),
      endDate: baseDate,
    };
  } else {
    // Future navigation: selected date + 1 day buffer
    return {
      startDate: baseDate,
      endDate: addDays(baseDate, 1),
    };
  }
};

// Create a unique key for a date window
const getWindowKey = (window: DateWindow): string => {
  return `${formatDateForQuery(window.startDate)}_${formatDateForQuery(window.endDate)}`;
};

/**
 * Fetch pickup_drops for a set of order IDs (batched)
 */
const fetchPickupDropsForOrders = async (orderIds: string[]): Promise<any[]> => {
  if (orderIds.length === 0) return [];
  const allDrops: any[] = [];
  const BATCH_SIZE = 300;

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("pickup_drops")
      .select("id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at")
      .in("order_id", batch);
    if (error) console.error('[useReportsDateWindow] Error fetching pickup_drops batch:', error);
    if (data) allDrops.push(...data);
  }
  return allDrops;
};

/**
 * Fetch order_transfers for a set of order IDs (batched)
 */
const fetchOrderTransfersForOrders = async (orderIds: string[]): Promise<any[]> => {
  if (orderIds.length === 0) return [];
  const allTransfers: any[] = [];
  const BATCH_SIZE = 300;

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("order_transfers")
      .select("id, order_id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, transfer_city, transfer_state, transfer_address, transfer_datetime")
      .in("order_id", batch);
    if (error) console.error('[useReportsDateWindow] Error fetching order_transfers batch:', error);
    if (data) allTransfers.push(...data);
  }
  return allTransfers;
};

/**
 * Fetch orders within a date window for specific driver IDs
 * 
 * CRITICAL: Filter logic uses explicit boolean grouping:
 * - locked = false
 * - AND canceled = false
 * - AND (driver1_id IN scope OR driver2_id IN scope)
 * - AND ((pickup_datetime BETWEEN start/end) OR (delivery_datetime BETWEEN start/end))
 */
const fetchOrdersForDateWindow = async (
  driverIds: string[],
  dateWindow: DateWindow,
): Promise<any[]> => {
  if (driverIds.length === 0) {
    console.log('[useReportsDateWindow] No driver IDs provided, skipping fetch');
    return [];
  }

  const startDateStr = formatDateForQuery(dateWindow.startDate);
  const endDateStr = formatDateForQuery(dateWindow.endDate);
  const driverIdsStr = driverIds.join(',');
  
  console.log(`[useReportsDateWindow] Fetching orders for ${driverIds.length} drivers, window: ${startDateStr} to ${endDateStr}`);

  // Step 1: Fetch flat orders (no joins - faster, index-friendly)
  const BATCH_SIZE = 1000;
  let allOrders: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // CORRECTED FILTER LOGIC:
    // 1. eq("locked", false) - only unlocked orders (locked come from archive)
    // 2. eq("canceled", false) - exclude canceled by default
    // 3. or(driver1_id.in.(...), driver2_id.in.(...)) - driver scope filter
    // 4. or(and(pickup between), and(delivery between)) - nested date range filter
    const { data: batch, error } = await supabase
      .from("orders")
      .select(`
        id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
        created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
        canceled, driver1_id, driver2_id, truck_id, trailer_id, broker_id, company_id, booked_by_company_id,
        is_recovery, locked, mileage, loaded_miles, dh_miles, original_driver1_id, original_driver2_id,
        freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
        tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver, booked_by
      `)
      .eq("locked", false)
      .eq("canceled", false)
      .or(`driver1_id.in.(${driverIdsStr}),driver2_id.in.(${driverIdsStr})`)
      .or(`and(pickup_datetime.gte.${startDateStr},pickup_datetime.lte.${endDateStr}T23:59:59),and(delivery_datetime.gte.${startDateStr},delivery_datetime.lte.${endDateStr}T23:59:59)`)
      .order("pickup_datetime", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('[useReportsDateWindow] Error fetching orders batch:', error);
      throw error;
    }

    if (batch) {
      allOrders = allOrders.concat(batch);
    }

    hasMore = batch?.length === BATCH_SIZE;
    offset += BATCH_SIZE;
    
    if (hasMore) {
      console.log(`[useReportsDateWindow] Fetched batch, total so far: ${allOrders.length}, fetching more...`);
    }
  }

  console.log(`[useReportsDateWindow] Fetched ${allOrders.length} flat orders from database`);

  // Step 2: Fetch pickup_drops and order_transfers in parallel (separate queries, batched)
  const orderIds = allOrders.map(o => o.id);
  if (orderIds.length === 0) return [];

  const [pickupDrops, transfers] = await Promise.all([
    fetchPickupDropsForOrders(orderIds),
    fetchOrderTransfersForOrders(orderIds)
  ]);

  console.log(`[useReportsDateWindow] Fetched ${pickupDrops.length} pickup_drops and ${transfers.length} transfers`);

  // Step 3: Build lookup maps
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

  // Step 4: Attach with sequence_number sorting for deterministic stop order
  return allOrders.map(order => ({
    ...order,
    pickup_drops: (pickupDropsByOrderId.get(order.id) || [])
      .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)),
    order_transfers: (transfersByOrderId.get(order.id) || [])
      .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0))
  }));
};

/**
 * Fetch locked orders from database within a date window
 * 
 * OPTIMIZED: Queries database directly with date filters instead of loading
 * all locked orders via edge function and filtering client-side.
 * This reduces load time from ~20s to <1s for historical dates.
 */
const fetchLockedOrdersForDateWindow = async (
  driverIds: string[],
  dateWindow: DateWindow,
): Promise<any[]> => {
  if (driverIds.length === 0) return [];

  const startDateStr = formatDateForQuery(dateWindow.startDate);
  const endDateStr = formatDateForQuery(dateWindow.endDate);
  const driverIdsStr = driverIds.join(',');

  console.log(`[useReportsDateWindow] Fetching locked orders for window: ${startDateStr} to ${endDateStr}`);

  try {
    // Step 1: Fetch flat locked orders with date filter (same as unlocked query pattern)
    const BATCH_SIZE = 1000;
    let allOrders: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from("orders")
        .select(`
          id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
          created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
          canceled, driver1_id, driver2_id, truck_id, trailer_id, broker_id, company_id, booked_by_company_id,
          is_recovery, locked, mileage, loaded_miles, dh_miles, original_driver1_id, original_driver2_id,
          freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
          tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver, booked_by
        `)
        .eq("locked", true)
        .eq("canceled", false)
        .or(`driver1_id.in.(${driverIdsStr}),driver2_id.in.(${driverIdsStr})`)
        .or(`and(pickup_datetime.gte.${startDateStr},pickup_datetime.lte.${endDateStr}T23:59:59),and(delivery_datetime.gte.${startDateStr},delivery_datetime.lte.${endDateStr}T23:59:59)`)
        .order("pickup_datetime", { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) {
        console.error('[useReportsDateWindow] Error fetching locked orders batch:', error);
        throw error;
      }

      if (batch) {
        allOrders = allOrders.concat(batch);
      }

      hasMore = batch?.length === BATCH_SIZE;
      offset += BATCH_SIZE;
    }

    console.log(`[useReportsDateWindow] Fetched ${allOrders.length} locked orders from database`);

    if (allOrders.length === 0) return [];

    // Step 2: Fetch pickup_drops and order_transfers in parallel (same pattern as unlocked)
    const orderIds = allOrders.map(o => o.id);

    const [pickupDrops, transfers] = await Promise.all([
      fetchPickupDropsForOrders(orderIds),
      fetchOrderTransfersForOrders(orderIds)
    ]);

    console.log(`[useReportsDateWindow] Fetched ${pickupDrops.length} pickup_drops and ${transfers.length} transfers for locked orders`);

    // Step 3: Build lookup maps
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

    // Step 4: Attach with sequence_number sorting
    return allOrders.map(order => ({
      ...order,
      pickup_drops: (pickupDropsByOrderId.get(order.id) || [])
        .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)),
      order_transfers: (transfersByOrderId.get(order.id) || [])
        .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0))
    }));
  } catch (error) {
    console.error('[useReportsDateWindow] Error loading locked orders:', error);
    return [];
  }
};

/**
 * Fetch gap-fill orders (recently locked but not yet in archive)
 * 
 * CRITICAL: Uses SAME corrected filter grouping as main query
 */
const fetchGapFillOrders = async (
  driverIds: string[],
  dateWindow: DateWindow,
  existingOrderIds: Set<string>,
): Promise<any[]> => {
  if (driverIds.length === 0) return [];

  const startDateStr = formatDateForQuery(dateWindow.startDate);
  const endDateStr = formatDateForQuery(dateWindow.endDate);
  const driverIdsStr = driverIds.join(',');

  console.log(`[useReportsDateWindow] Fetching gap-fill orders for window: ${startDateStr} to ${endDateStr}`);

  try {
    // Step 1: Fetch flat locked orders with SAME corrected filter logic
    const { data: recentlyLocked, error } = await supabase
      .from("orders")
      .select(`
        id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
        created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
        canceled, driver1_id, driver2_id, truck_id, trailer_id, broker_id, company_id, booked_by_company_id,
        is_recovery, locked, mileage, loaded_miles, dh_miles, original_driver1_id, original_driver2_id,
        freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
        tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver, booked_by
      `)
      .eq("locked", true)
      .eq("canceled", false)  // ADDED: exclude canceled
      .or(`driver1_id.in.(${driverIdsStr}),driver2_id.in.(${driverIdsStr})`)
      // FIXED: Same nested date filter as main query
      .or(`and(pickup_datetime.gte.${startDateStr},pickup_datetime.lte.${endDateStr}T23:59:59),and(delivery_datetime.gte.${startDateStr},delivery_datetime.lte.${endDateStr}T23:59:59)`)
      .limit(500);

    if (error) {
      console.error('[useReportsDateWindow] Error fetching gap-fill orders:', error);
      return [];
    }

    // Filter out orders that already exist
    const newOrders = (recentlyLocked || []).filter((o: any) => !existingOrderIds.has(o.id));
    
    if (newOrders.length === 0) {
      console.log('[useReportsDateWindow] No new gap-fill orders found');
      return [];
    }

    // Step 2: Fetch pickup_drops and transfers for gap-fill orders
    const orderIds = newOrders.map((o: any) => o.id);
    const [pickupDrops, transfers] = await Promise.all([
      fetchPickupDropsForOrders(orderIds),
      fetchOrderTransfersForOrders(orderIds)
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

    // Attach with sequence_number sorting
    const ordersWithRelations = newOrders.map((order: any) => ({
      ...order,
      pickup_drops: (pickupDropsByOrderId.get(order.id) || [])
        .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)),
      order_transfers: (transfersByOrderId.get(order.id) || [])
        .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0))
    }));

    console.log(`[useReportsDateWindow] Found ${ordersWithRelations.length} gap-fill orders`);
    return ordersWithRelations;
  } catch (error) {
    console.error('[useReportsDateWindow] Error in gap-fill fetch:', error);
    return [];
  }
};

/**
 * Fetch driver IDs for an office (matches legacy useReports behavior)
 * 
 * CORRECT MAPPING: The source of truth is:
 * 1. Get all dispatchers in the specified office
 * 2. Fetch trucks with their driver1 relationship
 * 3. Filter trucks where driver1.dispatcher_id is in the office's dispatcher list
 * 4. Return all driver IDs from those filtered trucks
 * 
 * This matches useReports.ts lines 844-886 exactly.
 * 
 * @param individualDispatcherId When provided (Individual mode ON), only fetches drivers for this dispatcher
 */
const fetchDriverIdsForOffice = async (
  priorityOffice: string | null,
  individualDispatcherId?: string | null
): Promise<{ driverIds: string[], dispatcherIds: string[] }> => {
  // Individual mode: only fetch drivers for the current user
  if (individualDispatcherId) {
    console.log(`[useReportsDateWindow] 🔍 INDIVIDUAL MODE: Fetching drivers only for dispatcher: ${individualDispatcherId}`);
    
    const { data: directDrivers, error: directDriversError } = await supabase
      .from("drivers")
      .select("id")
      .eq("is_active", true)
      .eq("dispatcher_id", individualDispatcherId);

    if (directDriversError) {
      console.error('[useReportsDateWindow] Error fetching individual dispatcher drivers:', directDriversError);
      throw directDriversError;
    }

    const driverIds = (directDrivers || []).map(d => d.id);
    console.log(`[useReportsDateWindow] ✅ INDIVIDUAL MODE: Found ${driverIds.length} drivers for dispatcher`);
    
    return { driverIds, dispatcherIds: [individualDispatcherId] };
  }

  console.log(`[useReportsDateWindow] 🔍 DEBUG: Fetching drivers for office: ${priorityOffice || 'ALL'}`);
  
  // Step 1: Get all dispatchers in this office
  const { data: dispatchers, error: dispatchersError } = await supabase
    .from("profiles")
    .select("user_id, full_name, office");

  if (dispatchersError) {
    console.error('[useReportsDateWindow] Error fetching dispatchers:', dispatchersError);
    throw dispatchersError;
  }

  // Get dispatcher IDs for the office
  const filterDispatcherIds = priorityOffice
    ? (dispatchers || []).filter(d => d.office === priorityOffice).map(d => d.user_id).filter(Boolean) as string[]
    : (dispatchers || []).map(d => d.user_id).filter(Boolean) as string[];
  
  console.log(`[useReportsDateWindow] 🔍 DEBUG: Office=${priorityOffice || 'ALL'}, Dispatchers in office=${filterDispatcherIds.length}`);

  if (filterDispatcherIds.length === 0) {
    return { driverIds: [], dispatcherIds: [] };
  }

  // Step 2: Fetch trucks flat (no join to drivers — avoids RLS amplification)
  const { data: trucks, error } = await supabase
    .from("trucks")
    .select("id, driver1_id, driver2_id")
    .eq("is_active", true);

  if (error) {
    console.error('[useReportsDateWindow] Error fetching trucks:', error);
    throw error;
  }

  // Step 2b: Fetch driver dispatcher mappings separately (flat, no join)
  const truckDriverIds = [...new Set((trucks || []).map(t => t.driver1_id).filter(Boolean))] as string[];
  let driverDispatcherMap = new Map<string, string>();
  if (truckDriverIds.length > 0) {
    const { data: driverDispatchers } = await supabase
      .from("drivers")
      .select("id, dispatcher_id")
      .in("id", truckDriverIds);
    for (const d of driverDispatchers || []) {
      if (d.dispatcher_id) driverDispatcherMap.set(d.id, d.dispatcher_id);
    }
  }

  if (error) {
    console.error('[useReportsDateWindow] Error fetching trucks with drivers:', error);
    throw error;
  }

  // Step 3: Filter trucks where driver1's dispatcher_id is in the office dispatcher list
  // Collect unique driver IDs from those trucks
  const driverIdsSet = new Set<string>();
  
  for (const truck of trucks || []) {
    const driverDispatcherId = truck.driver1_id ? driverDispatcherMap.get(truck.driver1_id) : null;
    // Check if driver's dispatcher is in this office
    if (driverDispatcherId && filterDispatcherIds.includes(driverDispatcherId) && truck.driver1_id) {
      driverIdsSet.add(truck.driver1_id);
    }
    // Also include driver2 if exists on matching trucks
    if (driverDispatcherId && filterDispatcherIds.includes(driverDispatcherId) && truck.driver2_id) {
      driverIdsSet.add(truck.driver2_id);
    }
  }

  console.log(`[useReportsDateWindow] 🔍 DEBUG: Table=trucks→drivers, Filter=driver1.dispatcher_id IN office dispatchers`);
  console.log(`[useReportsDateWindow] 🔍 DEBUG: Total trucks checked=${trucks?.length || 0}, Truck-based drivers=${driverIdsSet.size}`);

  // Step 4: NEW - Fetch active drivers directly by dispatcher_id (includes unassigned drivers)
  // This matches legacy useReports.ts behavior where ALL active drivers for an office's dispatchers are included
  const { data: directDrivers, error: directDriversError } = await supabase
    .from("drivers")
    .select("id")
    .eq("is_active", true)
    .in("dispatcher_id", filterDispatcherIds);

  if (directDriversError) {
    console.error('[useReportsDateWindow] Error fetching direct drivers:', directDriversError);
    // Don't throw - still return truck-based drivers
  } else {
    // Add all active drivers for these dispatchers (includes drivers without trucks)
    for (const driver of directDrivers || []) {
      if (driver.id) {
        driverIdsSet.add(driver.id);
      }
    }
    console.log(`[useReportsDateWindow] 🔍 DEBUG: Direct dispatcher-based drivers found=${directDrivers?.length || 0}`);
  }

  const driverIds = Array.from(driverIdsSet);
  
  console.log(`[useReportsDateWindow] ✅ Found ${driverIds.length} total drivers for office (truck-based + unassigned)`);
  
  return { driverIds, dispatcherIds: filterDispatcherIds };
};

/**
 * Global accumulated orders storage - persists across office switches
 * This is intentionally module-level to survive component remounts
 */
const globalAccumulatedOrders = new Map<string, any>();
const globalLoadedWindows = new Set<string>();
let lastIndividualMode: boolean | undefined = undefined;

// Version counter to trigger re-renders when orders are injected externally
let globalOrdersVersion = 0;
const versionListeners = new Set<() => void>();

/**
 * Inject orders directly into the global accumulated orders store
 * Used by dispatcher-specific lazy loading to merge newly loaded orders
 */
export const injectOrdersIntoGlobalStore = (orders: any[]): void => {
  for (const order of orders) {
    globalAccumulatedOrders.set(order.id, order);
  }
  globalOrdersVersion++;
  console.log(`[useReportsDateWindow] Injected ${orders.length} orders, total accumulated: ${globalAccumulatedOrders.size}, version: ${globalOrdersVersion}`);
  // Notify all listeners to trigger re-renders
  versionListeners.forEach(listener => listener());
};

/**
 * Get the current size of accumulated orders (for triggering re-renders)
 */
export const getGlobalAccumulatedOrdersSize = (): number => {
  return globalAccumulatedOrders.size;
};

/**
 * Subscribe to global orders version changes (for triggering re-renders)
 */
export const subscribeToGlobalOrdersVersion = (listener: () => void): (() => void) => {
  versionListeners.add(listener);
  return () => versionListeners.delete(listener);
};

/**
 * Get current global orders version
 */
export const getGlobalOrdersVersion = (): number => {
  return globalOrdersVersion;
};

/**
 * Main hook for date-window based reports data loading
 * 
 * KEY DESIGN: 
 * - The query key does NOT include windowKey - this prevents refetching when navigating calendars
 * - Instead, windowKey is used to track which ranges have been loaded
 * - Accumulated orders persist globally across office switches
 */
export const useReportsDateWindow = (options: ReportsDateWindowOptions) => {
  const queryClient = useQueryClient();
  const { dispatcherId, selectedDate, priorityOffice, individualMode, currentUserDispatcherId } = options;
  
  // Calculate current date window
  const currentWindow = useMemo(() => {
    return calculateDateWindow(selectedDate, 'initial');
  }, [selectedDate]);
  
  const windowKey = getWindowKey(currentWindow);
  
  // Reset global state ONLY when individual mode changes (complete data context switch)
  if (lastIndividualMode !== undefined && lastIndividualMode !== individualMode) {
    console.log(`[useReportsDateWindow] Individual mode changed, clearing global accumulated orders`);
    globalAccumulatedOrders.clear();
    globalLoadedWindows.clear();
  }
  lastIndividualMode = individualMode;
  
  // Create a stable query key that does NOT change with windowKey
  // This prevents refetching when navigating calendars - we load incrementally instead
  const stableQueryKey = useMemo(() => [
    'reports-date-window-stable',
    priorityOffice || 'all-offices',
    individualMode ? 'individual' : 'all',
    individualMode ? currentUserDispatcherId : 'all-dispatchers',
  ], [priorityOffice, individualMode, currentUserDispatcherId]);

  // Primary query: loads the initial date window on mount
  // Does NOT refetch when selectedDate changes - we handle that separately
  const { data: initialData, isLoading: initialLoading, error } = useQuery({
    queryKey: stableQueryKey,
    queryFn: async () => {
      // Get driver IDs for current mode (individual or all offices)
      const { driverIds, dispatcherIds } = await fetchDriverIdsForOffice(
        priorityOffice, // Scope to current office tab to reduce dataset size
        individualMode ? currentUserDispatcherId : null
      );
      
      if (driverIds.length === 0) {
        console.log('[useReportsDateWindow] No drivers found, returning empty');
        return { driverIds: [], dispatcherIds: [] };
      }
      
      console.log(`[useReportsDateWindow] Initial load: ${driverIds.length} drivers`);
      return { driverIds, dispatcherIds };
    },
    enabled: !!dispatcherId,
    staleTime: 300000, // 5 minutes - driver list rarely changes
    gcTime: 600000,
    refetchOnWindowFocus: false,
  });

  // Use a ref to avoid stale closure issues with driverIds in the queryFn
  // This ensures the queryFn always reads the current value when it runs
  const driverIdsRef = useRef<string[]>([]);
  const currentWindowRef = useRef(currentWindow);
  
  useEffect(() => {
    driverIdsRef.current = initialData?.driverIds || [];
  }, [initialData?.driverIds]);
  
  useEffect(() => {
    currentWindowRef.current = currentWindow;
  }, [currentWindow]);

  // Effect to load orders for the current window when it changes
  // This is the key to incremental loading without full refetches
  const { isFetching, refetch } = useQuery({
    queryKey: ['reports-date-window-orders', windowKey, priorityOffice || 'all-offices', individualMode ? 'individual' : 'all', individualMode ? currentUserDispatcherId : 'all'],
    queryFn: async () => {
      // Read from ref to avoid stale closure issues
      const driverIds = driverIdsRef.current;
      const windowToLoad = currentWindowRef.current;
      
      if (driverIds.length === 0) {
        console.log(`[useReportsDateWindow] No driver IDs available, skipping orders fetch`);
        return { orders: [], windowKey };
      }
      
      // Skip if already loaded this window
      const scopedWindowKey = `${priorityOffice || 'all'}_${individualMode ? currentUserDispatcherId : 'all'}_${windowKey}`;
      if (globalLoadedWindows.has(scopedWindowKey)) {
        console.log(`[useReportsDateWindow] Window ${scopedWindowKey} already loaded, skipping`);
        return { orders: [], windowKey, skipped: true };
      }
      
      console.log(`[useReportsDateWindow] Loading orders for window: ${windowKey}, ${driverIds.length} drivers`);
      
      // Fetch all order types for this window
      const unlockedOrders = await fetchOrdersForDateWindow(driverIds, windowToLoad);
      const lockedOrders = await fetchLockedOrdersForDateWindow(driverIds, windowToLoad);
      
      console.log(`[useReportsDateWindow] Fetched ${unlockedOrders.length} unlocked, ${lockedOrders.length} locked orders`);
      
      const unlockedIds = new Set(unlockedOrders.map(o => o.id));
      const deduplicatedLocked = lockedOrders.filter(o => !unlockedIds.has(o.id));
      
      const existingIds = new Set([...unlockedIds, ...deduplicatedLocked.map(o => o.id)]);
      const gapFillOrders = await fetchGapFillOrders(driverIds, windowToLoad, existingIds);
      
      const combinedOrders = [...unlockedOrders, ...deduplicatedLocked, ...gapFillOrders];
      
      // Filter canceled orders
      const allOrders = combinedOrders.filter(order => {
        if (!order.canceled) return true;
        if (!isPickupDateToday(order.pickup_datetime)) return false;
        
        const canceledPickupDate = order.pickup_datetime?.substring(0, 10);
        if (!canceledPickupDate) return false;
        
        const hasLaterOrSameDayLoad = combinedOrders.some(otherOrder => {
          if (otherOrder.driver1_id !== order.driver1_id) return false;
          if (otherOrder.id === order.id) return false;
          if (otherOrder.canceled) return false;
          if (!otherOrder.pickup_datetime) return false;
          const otherPickupDate = otherOrder.pickup_datetime.substring(0, 10);
          return otherPickupDate >= canceledPickupDate;
        });
        
        return !hasLaterOrSameDayLoad;
      });
      
      // Add to global accumulated store
      for (const order of allOrders) {
        globalAccumulatedOrders.set(order.id, order);
      }
      const scopedWindowKeyForMark = `${priorityOffice || 'all'}_${individualMode ? currentUserDispatcherId : 'all'}_${windowKey}`;
      globalLoadedWindows.add(scopedWindowKeyForMark);
      
      // CRITICAL: Increment version and notify listeners so the UI re-renders
      // This ensures accumulatedOrders memo updates when orders are loaded via queryFn
      globalOrdersVersion++;
      versionListeners.forEach(listener => listener());
      
      console.log(`[useReportsDateWindow] Loaded ${allOrders.length} orders for window ${windowKey}, total accumulated: ${globalAccumulatedOrders.size}, version: ${globalOrdersVersion}`);
      
      return { orders: allOrders, windowKey };
    },
    enabled: !!dispatcherId && !!initialData?.driverIds?.length,
    staleTime: 60000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    // Keep previous data to prevent flashing
    placeholderData: (prev) => prev,
  });

  // CRITICAL: When driverIds become available and window hasn't been loaded yet,
  // trigger a refetch to ensure orders are loaded. This handles the case where
  // the query ran before driverIds were ready due to stale closure.
  const hasTriggeredInitialFetchRef = useRef(false);
  useEffect(() => {
    const driverIds = initialData?.driverIds || [];
    const scopedKey = `${priorityOffice || 'all'}_${individualMode ? currentUserDispatcherId : 'all'}_${windowKey}`;
    if (driverIds.length > 0 && !globalLoadedWindows.has(scopedKey) && !hasTriggeredInitialFetchRef.current) {
      hasTriggeredInitialFetchRef.current = true;
      console.log(`[useReportsDateWindow] Driver IDs ready (${driverIds.length}), triggering orders fetch for window ${windowKey}`);
      refetch();
    }
  }, [initialData?.driverIds, windowKey, refetch]);
  
  // Reset the trigger flag when window changes
  useEffect(() => {
    const scopedKeyForReset = `${priorityOffice || 'all'}_${individualMode ? currentUserDispatcherId : 'all'}_${windowKey}`;
    if (globalLoadedWindows.has(scopedKeyForReset)) {
      hasTriggeredInitialFetchRef.current = true; // Already loaded
    } else {
      hasTriggeredInitialFetchRef.current = false; // Need to load this new window
    }
  }, [windowKey]);

  // Subscribe to global orders version changes to trigger re-renders when orders are injected
  const [ordersVersion, setOrdersVersion] = useState(globalOrdersVersion);
  useEffect(() => {
    const unsubscribe = subscribeToGlobalOrdersVersion(() => {
      setOrdersVersion(globalOrdersVersion);
    });
    return unsubscribe;
  }, []);

  // Get all accumulated orders
  const accumulatedOrders = useMemo(() => {
    return Array.from(globalAccumulatedOrders.values());
  }, [ordersVersion, windowKey]); // ordersVersion triggers re-render when orders are injected externally

  // Function to prefetch adjacent date windows
  const prefetchAdjacentWindows = useCallback(async () => {
    if (!initialData?.driverIds?.length) return;

    const pastWindow = calculateDateWindow(subDays(selectedDate, 1), 'past');
    const futureWindow = calculateDateWindow(addDays(selectedDate, 1), 'future');

    const pastKey = getWindowKey(pastWindow);
    const futureKey = getWindowKey(futureWindow);

    const scopedPastKey = `${priorityOffice || 'all'}_${individualMode ? currentUserDispatcherId : 'all'}_${pastKey}`;
    const scopedFutureKey = `${priorityOffice || 'all'}_${individualMode ? currentUserDispatcherId : 'all'}_${futureKey}`;

    if (!globalLoadedWindows.has(scopedPastKey)) {
      queryClient.prefetchQuery({
        queryKey: ['reports-date-window-orders', pastKey, priorityOffice || 'all-offices', individualMode ? 'individual' : 'all', individualMode ? currentUserDispatcherId : 'all'],
        staleTime: 60000,
      });
    }

    if (!globalLoadedWindows.has(scopedFutureKey)) {
      queryClient.prefetchQuery({
        queryKey: ['reports-date-window-orders', futureKey, priorityOffice || 'all-offices', individualMode ? 'individual' : 'all', individualMode ? currentUserDispatcherId : 'all'],
        staleTime: 60000,
      });
    }
  }, [initialData?.driverIds, selectedDate, queryClient, individualMode]);

  return {
    orders: accumulatedOrders,
    accumulatedOrders,
    driverIds: initialData?.driverIds || [],
    dateWindow: currentWindow,
    isLoading: initialLoading && globalAccumulatedOrders.size === 0,
    isFetching,
    error,
    refetch,
    prefetchAdjacentWindows,
    loadedWindowCount: globalLoadedWindows.size,
  };
};

/**
 * Hook to fetch order files on-demand for a specific order
 */
export const useOrderFilesOnDemand = (orderId: string | null) => {
  return useQuery({
    queryKey: ['order-files', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      
      const { data, error } = await supabase
        .from("order_files")
        .select("id, file_category, file_name, file_path, file_size, content_type")
        .eq("order_id", orderId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!orderId,
    staleTime: 30000,
    gcTime: 300000,
  });
};

export default useReportsDateWindow;
