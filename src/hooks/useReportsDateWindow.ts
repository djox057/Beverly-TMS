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
import { useCallback, useMemo, useRef } from "react";
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
 * Fetch locked orders from database via edge function within a date window
 */
const fetchLockedOrdersForDateWindow = async (
  driverIds: string[],
  dateWindow: DateWindow,
): Promise<any[]> => {
  if (driverIds.length === 0) return [];

  const startDateStr = formatDateForQuery(dateWindow.startDate);
  const endDateStr = formatDateForQuery(dateWindow.endDate);
  const driverIdsSet = new Set(driverIds);

  console.log(`[useReportsDateWindow] Loading locked orders via edge function for window: ${startDateStr} to ${endDateStr}`);

  try {
    const { data: response, error } = await supabase.functions.invoke(
      "get-all-locked-orders",
      { body: { bookedBy: null, dispatcherDriverIds: driverIds } }
    );

    if (error || !response?.orders) {
      console.log('[useReportsDateWindow] No locked orders returned from edge function');
      return [];
    }

    const allLockedOrders = response.orders;

    // Filter orders by date window and driver matching
    const filteredOrders = allLockedOrders.filter((order: any) => {
      if (order.canceled) return false;

      // Check driver matching
      const matchesDriver = 
        (order.driver1_id && driverIdsSet.has(order.driver1_id)) ||
        (order.driver2_id && driverIdsSet.has(order.driver2_id));
      
      if (!matchesDriver) {
        const transfers = order.order_transfers || [];
        const matchesTransfer = transfers.some((t: any) => 
          (t.driver1_id && driverIdsSet.has(t.driver1_id)) ||
          (t.driver2_id && driverIdsSet.has(t.driver2_id))
        );
        if (!matchesTransfer) return false;
      }

      // Check date window
      const pickupDateStr = order.pickup_datetime?.split('T')[0] || null;
      const deliveryDateStr = order.delivery_datetime?.split('T')[0] || null;

      const inPickupWindow = pickupDateStr && pickupDateStr >= startDateStr && pickupDateStr <= endDateStr;
      const inDeliveryWindow = deliveryDateStr && deliveryDateStr >= startDateStr && deliveryDateStr <= endDateStr;

      return inPickupWindow || inDeliveryWindow;
    });

    console.log(`[useReportsDateWindow] Filtered ${filteredOrders.length} locked orders for date window`);
    return filteredOrders;
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

  // Step 2: Fetch trucks with their driver1 relationship
  const { data: trucks, error } = await supabase
    .from("trucks")
    .select(`
      id,
      driver1_id,
      driver2_id,
      driver1:drivers!trucks_driver1_id_fkey(id, dispatcher_id)
    `)
    .eq("is_active", true);

  if (error) {
    console.error('[useReportsDateWindow] Error fetching trucks with drivers:', error);
    throw error;
  }

  // Step 3: Filter trucks where driver1's dispatcher_id is in the office dispatcher list
  // Collect unique driver IDs from those trucks
  const driverIdsSet = new Set<string>();
  
  for (const truck of trucks || []) {
    const driver1 = truck.driver1 as any;
    // Check if driver's dispatcher is in this office
    if (driver1?.dispatcher_id && filterDispatcherIds.includes(driver1.dispatcher_id) && driver1?.id) {
      driverIdsSet.add(driver1.id);
    }
    // Also include driver2 if exists on matching trucks
    if (driver1?.dispatcher_id && filterDispatcherIds.includes(driver1.dispatcher_id) && truck.driver2_id) {
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
 * Main hook for date-window based reports data loading
 */
export const useReportsDateWindow = (options: ReportsDateWindowOptions) => {
  const queryClient = useQueryClient();
  const { dispatcherId, selectedDate, priorityOffice, individualMode, currentUserDispatcherId } = options;
  
  // Track loaded windows for accumulative caching - keyed by mode+office to reset on mode change
  const loadedWindowsRef = useRef<Set<string>>(new Set());
  const modeKeyRef = useRef<string>('');
  
  // Calculate current date window
  const currentWindow = useMemo(() => {
    return calculateDateWindow(selectedDate, 'initial');
  }, [selectedDate]);
  
  const windowKey = getWindowKey(currentWindow);
  
  // Create a mode-specific cache key prefix to properly reset on mode toggle
  const modeKey = `${priorityOffice || 'all'}-${individualMode ? 'individual' : 'all'}-${individualMode ? currentUserDispatcherId : 'none'}`;
  
  // Reset loaded windows when mode changes to force fresh data loading
  if (modeKeyRef.current !== modeKey) {
    console.log(`[useReportsDateWindow] Mode changed from "${modeKeyRef.current}" to "${modeKey}", resetting loaded windows`);
    loadedWindowsRef.current = new Set();
    modeKeyRef.current = modeKey;
  }

  // Fetch data for the current date window
  // Include individualMode in query key to refetch when mode changes
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports-date-window', priorityOffice, windowKey, individualMode ? 'individual' : 'all', individualMode ? currentUserDispatcherId : null],
    queryFn: async () => {
      // Step 1: Get driver IDs for this office (or just current user in Individual mode)
      const { driverIds, dispatcherIds } = await fetchDriverIdsForOffice(
        priorityOffice || null,
        individualMode ? currentUserDispatcherId : null
      );
      if (driverIds.length === 0) {
        console.log('[useReportsDateWindow] No drivers found for office, returning empty');
        return { orders: [], driverIds: [], dispatcherIds: [] };
      }

      // Step 2: Fetch unlocked orders from database
      const unlockedOrders = await fetchOrdersForDateWindow(driverIds, currentWindow);

      // Step 3: Fetch locked orders from archive storage
      const lockedOrders = await fetchLockedOrdersForDateWindow(driverIds, currentWindow);

      // Step 4: Deduplicate (database takes priority)
      const unlockedOrderIds = new Set(unlockedOrders.map(o => o.id));
      const deduplicatedLocked = lockedOrders.filter(o => !unlockedOrderIds.has(o.id));

      // Step 5: Fetch gap-fill orders
      const existingIds = new Set([...unlockedOrderIds, ...deduplicatedLocked.map(o => o.id)]);
      const gapFillOrders = await fetchGapFillOrders(driverIds, currentWindow, existingIds);

      // Combine all orders
      const combinedOrders = [...unlockedOrders, ...deduplicatedLocked, ...gapFillOrders];
      
      // Filter out canceled orders unless:
      // 1. Their pickup date is today AND
      // 2. There is NO other non-canceled load for that driver with same or later pickup date
      const allOrders = combinedOrders.filter(order => {
        if (!order.canceled) return true;
        
        // Must be pickup today to even consider showing
        if (!isPickupDateToday(order.pickup_datetime)) return false;
        
        // Extract the date part (YYYY-MM-DD) from this canceled order's pickup
        const canceledPickupDate = order.pickup_datetime?.substring(0, 10);
        if (!canceledPickupDate) return false;
        
        // Check if there's another non-canceled order for this driver with same or later pickup date
        const hasLaterOrSameDayLoad = combinedOrders.some(otherOrder => {
          // Must be for the same driver
          if (otherOrder.driver1_id !== order.driver1_id) return false;
          // Must not be the same order
          if (otherOrder.id === order.id) return false;
          // Must not be canceled
          if (otherOrder.canceled) return false;
          // Must have a pickup datetime
          if (!otherOrder.pickup_datetime) return false;
          
          // Compare date parts only (no timezone conversion)
          const otherPickupDate = otherOrder.pickup_datetime.substring(0, 10);
          return otherPickupDate >= canceledPickupDate;
        });
        
        // Don't show canceled order if there's a non-canceled load with same or later pickup
        return !hasLaterOrSameDayLoad;
      });
      
      console.log(`[useReportsDateWindow] Total orders for window: ${allOrders.length} (combined: ${combinedOrders.length}, after canceled filter: ${allOrders.length})`);

      // Mark this window as loaded
      loadedWindowsRef.current.add(windowKey);

      return {
        orders: allOrders,
        driverIds,
        dateWindow: currentWindow,
      };
    },
    enabled: !!dispatcherId,
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Function to prefetch adjacent date windows
  const prefetchAdjacentWindows = useCallback(async () => {
    if (!dispatcherId || !data?.driverIds) return;

    const pastWindow = calculateDateWindow(subDays(selectedDate, 1), 'past');
    const futureWindow = calculateDateWindow(addDays(selectedDate, 1), 'future');

    const pastKey = getWindowKey(pastWindow);
    const futureKey = getWindowKey(futureWindow);

    // Only prefetch if not already loaded
    if (!loadedWindowsRef.current.has(pastKey)) {
      queryClient.prefetchQuery({
        queryKey: ['reports-date-window', dispatcherId, pastKey],
        queryFn: async () => {
          const unlockedOrders = await fetchOrdersForDateWindow(data.driverIds, pastWindow);
          const lockedOrders = await fetchLockedOrdersForDateWindow(data.driverIds, pastWindow);
          const unlockedIds = new Set(unlockedOrders.map(o => o.id));
          const deduplicatedLocked = lockedOrders.filter(o => !unlockedIds.has(o.id));
          const existingIds = new Set([...unlockedIds, ...deduplicatedLocked.map(o => o.id)]);
          const gapFill = await fetchGapFillOrders(data.driverIds, pastWindow, existingIds);
          loadedWindowsRef.current.add(pastKey);
          return { orders: [...unlockedOrders, ...deduplicatedLocked, ...gapFill], driverIds: data.driverIds, dateWindow: pastWindow };
        },
        staleTime: 60000,
      });
    }

    if (!loadedWindowsRef.current.has(futureKey)) {
      queryClient.prefetchQuery({
        queryKey: ['reports-date-window', dispatcherId, futureKey],
        queryFn: async () => {
          const unlockedOrders = await fetchOrdersForDateWindow(data.driverIds, futureWindow);
          const lockedOrders = await fetchLockedOrdersForDateWindow(data.driverIds, futureWindow);
          const unlockedIds = new Set(unlockedOrders.map(o => o.id));
          const deduplicatedLocked = lockedOrders.filter(o => !unlockedIds.has(o.id));
          const existingIds = new Set([...unlockedIds, ...deduplicatedLocked.map(o => o.id)]);
          const gapFill = await fetchGapFillOrders(data.driverIds, futureWindow, existingIds);
          loadedWindowsRef.current.add(futureKey);
          return { orders: [...unlockedOrders, ...deduplicatedLocked, ...gapFill], driverIds: data.driverIds, dateWindow: futureWindow };
        },
        staleTime: 60000,
      });
    }
  }, [dispatcherId, data?.driverIds, selectedDate, queryClient]);

  // Get accumulated orders from all loaded windows
  const accumulatedOrders = useMemo(() => {
    if (!dispatcherId) return [];

    const allOrders = new Map<string, any>();
    
    // Get orders from all cached windows for the current mode
    for (const windowKeyStr of loadedWindowsRef.current) {
      // Build the full query key matching the query definition
      const cachedData = queryClient.getQueryData<{ orders: any[] }>([
        'reports-date-window', 
        priorityOffice, 
        windowKeyStr, 
        individualMode ? 'individual' : 'all', 
        individualMode ? currentUserDispatcherId : null
      ]);
      if (cachedData?.orders) {
        for (const order of cachedData.orders) {
          // Use Map to deduplicate, most recent data wins
          allOrders.set(order.id, order);
        }
      }
    }

    // Also include current query data
    if (data?.orders) {
      for (const order of data.orders) {
        allOrders.set(order.id, order);
      }
    }

    return Array.from(allOrders.values());
  }, [data?.orders, dispatcherId, priorityOffice, individualMode, currentUserDispatcherId, queryClient]);

  return {
    orders: data?.orders || [],
    accumulatedOrders,
    driverIds: data?.driverIds || [],
    dateWindow: currentWindow,
    isLoading,
    error,
    refetch,
    prefetchAdjacentWindows,
    loadedWindowCount: loadedWindowsRef.current.size,
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
