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

// Types
export interface DateWindow {
  startDate: Date;
  endDate: Date;
}

export interface ReportsDateWindowOptions {
  dispatcherId: string | null;
  selectedDate: Date;
}

// Helper to format date for Supabase queries
const formatDateForQuery = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
};

// Calculate date window based on selected date
export const calculateDateWindow = (selectedDate: Date, direction: 'initial' | 'past' | 'future'): DateWindow => {
  const baseDate = startOfDay(selectedDate);
  
  if (direction === 'initial') {
    // Initial load: 2 days before → 3 days after current date
    return {
      startDate: subDays(baseDate, 2),
      endDate: addDays(baseDate, 3),
    };
  } else if (direction === 'past') {
    // Past navigation: selected date - 1 day
    return {
      startDate: subDays(baseDate, 1),
      endDate: baseDate,
    };
  } else {
    // Future navigation: selected date + 1 day
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
 * Fetch orders within a date window for specific driver IDs
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
  
  console.log(`[useReportsDateWindow] Fetching orders for ${driverIds.length} drivers, window: ${startDateStr} to ${endDateStr}`);

  // Build query with date window filter
  // Orders are included if pickup_date OR delivery_date falls within the window
  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      load_number,
      internal_load_number,
      broker_load_number,
      status,
      notes,
      date_change_notes,
      created_at,
      updated_at,
      pickup_datetime,
      pickup_end_datetime,
      delivery_datetime,
      delivery_end_datetime,
      canceled,
      driver1_id,
      driver2_id,
      truck_id,
      trailer_id,
      broker_id,
      company_id,
      booked_by_company_id,
      is_recovery,
      locked,
      mileage,
      loaded_miles,
      dh_miles,
      original_driver1_id,
      original_driver2_id,
      freight_amount,
      driver_price,
      detention,
      detention_driver,
      layover,
      layover_driver,
      tonu,
      tonu_driver,
      extra_stop,
      extra_stop_driver,
      lumper,
      lumper_driver,
      booked_by,
      pickup_drops (
        id,
        type,
        address,
        city,
        state,
        zip_code,
        datetime,
        end_datetime,
        sequence_number,
        arrived_at,
        checked_out_at,
        going_to_at
      ),
      order_transfers (
        id,
        sequence_number,
        driver1_id,
        driver2_id,
        truck_id,
        trailer_id,
        miles,
        driver_price,
        transfer_city,
        transfer_state,
        transfer_address,
        transfer_datetime
      )
    `)
    .or(`driver1_id.in.(${driverIds.join(',')}),driver2_id.in.(${driverIds.join(',')})`)
    .or(`pickup_datetime.gte.${startDateStr},pickup_datetime.lte.${endDateStr}T23:59:59,delivery_datetime.gte.${startDateStr},delivery_datetime.lte.${endDateStr}T23:59:59`)
    .order("pickup_datetime", { ascending: false });

  if (error) {
    console.error('[useReportsDateWindow] Error fetching orders:', error);
    throw error;
  }

  console.log(`[useReportsDateWindow] Fetched ${orders?.length || 0} orders from database`);
  return orders || [];
};

/**
 * Fetch locked orders from archive storage within a date window
 */
const fetchLockedOrdersForDateWindow = async (
  driverIds: string[],
  dateWindow: DateWindow,
): Promise<any[]> => {
  if (driverIds.length === 0) return [];

  const startDateStr = formatDateForQuery(dateWindow.startDate);
  const endDateStr = formatDateForQuery(dateWindow.endDate);
  const driverIdsSet = new Set(driverIds);

  console.log(`[useReportsDateWindow] Loading locked orders from storage for window: ${startDateStr} to ${endDateStr}`);

  try {
    const { getLockedOrders, getPickupDrops, getOrderTransfers } = await import("@/utils/ordersCache");
    
    const cachedOrders = await getLockedOrders();
    const cachedPickupDrops = await getPickupDrops();
    const cachedOrderTransfers = await getOrderTransfers();

    if (!cachedOrders || !Array.isArray(cachedOrders) || cachedOrders.length === 0) {
      console.log('[useReportsDateWindow] No locked orders in storage');
      return [];
    }

    // Pre-index pickup_drops and transfers by order_id for O(1) lookups
    const pickupDropsByOrderId = new Map<string, any[]>();
    for (const pd of cachedPickupDrops || []) {
      if (pd.order_id) {
        const existing = pickupDropsByOrderId.get(pd.order_id);
        if (existing) existing.push(pd);
        else pickupDropsByOrderId.set(pd.order_id, [pd]);
      }
    }

    const transfersByOrderId = new Map<string, any[]>();
    for (const ot of cachedOrderTransfers || []) {
      if (ot.order_id) {
        const existing = transfersByOrderId.get(ot.order_id);
        if (existing) existing.push(ot);
        else transfersByOrderId.set(ot.order_id, [ot]);
      }
    }

    // Helper to normalize values from CSV
    const normalizeNull = (val: any) => (val === 'null' || val === 'NULL' || val === '' || val === undefined) ? null : val;
    const normalizeBool = (val: any) => val === true || val === 'true' || val === '1' || val === 1;

    // Filter orders by:
    // 1. Driver IDs (driver1_id or driver2_id or transfer drivers)
    // 2. Date window (pickup_datetime or delivery_datetime)
    // 3. Not canceled
    const filteredOrders = cachedOrders.filter((order: any) => {
      // Skip canceled orders
      if (normalizeBool(order.canceled)) return false;

      // Check driver matching
      const matchesDriver = 
        (order.driver1_id && driverIdsSet.has(order.driver1_id)) ||
        (order.driver2_id && driverIdsSet.has(order.driver2_id));
      
      if (!matchesDriver) {
        // Also check transfer drivers
        const transfers = transfersByOrderId.get(order.id) || [];
        const matchesTransfer = transfers.some((t: any) => 
          (t.driver1_id && driverIdsSet.has(t.driver1_id)) ||
          (t.driver2_id && driverIdsSet.has(t.driver2_id))
        );
        if (!matchesTransfer) return false;
      }

      // Check date window
      const pickupDateStr = order.pickup_datetime ? 
        String(order.pickup_datetime).replace(' ', 'T').split('T')[0] : null;
      const deliveryDateStr = order.delivery_datetime ? 
        String(order.delivery_datetime).replace(' ', 'T').split('T')[0] : null;

      const inPickupWindow = pickupDateStr && pickupDateStr >= startDateStr && pickupDateStr <= endDateStr;
      const inDeliveryWindow = deliveryDateStr && deliveryDateStr >= startDateStr && deliveryDateStr <= endDateStr;

      return inPickupWindow || inDeliveryWindow;
    });

    // Attach pickup_drops and transfers to filtered orders
    const ordersWithRelations = filteredOrders.map((order: any) => ({
      ...order,
      is_recovery: normalizeBool(order.is_recovery),
      canceled: normalizeBool(order.canceled),
      locked: normalizeBool(order.locked),
      notes: normalizeNull(order.notes),
      pickup_drops: pickupDropsByOrderId.get(order.id) || [],
      order_transfers: transfersByOrderId.get(order.id) || [],
    }));

    console.log(`[useReportsDateWindow] Filtered ${ordersWithRelations.length} locked orders for date window`);
    return ordersWithRelations;
  } catch (error) {
    console.error('[useReportsDateWindow] Error loading locked orders from storage:', error);
    return [];
  }
};

/**
 * Fetch gap-fill orders (recently locked but not yet in archive)
 */
const fetchGapFillOrders = async (
  driverIds: string[],
  dateWindow: DateWindow,
  existingOrderIds: Set<string>,
): Promise<any[]> => {
  if (driverIds.length === 0) return [];

  const startDateStr = formatDateForQuery(dateWindow.startDate);
  const endDateStr = formatDateForQuery(dateWindow.endDate);

  console.log(`[useReportsDateWindow] Fetching gap-fill orders for window: ${startDateStr} to ${endDateStr}`);

  try {
    const { data: recentlyLocked, error } = await supabase
      .from("orders")
      .select(`
        id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
        created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
        canceled, driver1_id, driver2_id, truck_id, is_recovery, locked, mileage, loaded_miles, dh_miles,
        original_driver1_id, original_driver2_id, freight_amount, driver_price,
        detention, detention_driver, layover, layover_driver, tonu, tonu_driver,
        extra_stop, extra_stop_driver, lumper, lumper_driver, booked_by,
        pickup_drops (id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at),
        order_transfers (id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, transfer_city, transfer_state, transfer_address, transfer_datetime)
      `)
      .eq("locked", true)
      .eq("canceled", false)
      .or(`driver1_id.in.(${driverIds.join(',')}),driver2_id.in.(${driverIds.join(',')})`)
      .or(`pickup_datetime.gte.${startDateStr},pickup_datetime.lte.${endDateStr}T23:59:59,delivery_datetime.gte.${startDateStr},delivery_datetime.lte.${endDateStr}T23:59:59`)
      .limit(500);

    if (error) {
      console.error('[useReportsDateWindow] Error fetching gap-fill orders:', error);
      return [];
    }

    // Filter out orders that already exist
    const newOrders = (recentlyLocked || []).filter((o: any) => !existingOrderIds.has(o.id));
    console.log(`[useReportsDateWindow] Found ${newOrders.length} gap-fill orders`);
    return newOrders;
  } catch (error) {
    console.error('[useReportsDateWindow] Error in gap-fill fetch:', error);
    return [];
  }
};

/**
 * Fetch driver IDs for a dispatcher
 */
const fetchDriverIdsForDispatcher = async (dispatcherId: string): Promise<string[]> => {
  console.log(`[useReportsDateWindow] Fetching drivers for dispatcher: ${dispatcherId}`);
  
  const { data: drivers, error } = await supabase
    .from("drivers")
    .select("id")
    .eq("dispatcher_id", dispatcherId)
    .eq("is_active", true);

  if (error) {
    console.error('[useReportsDateWindow] Error fetching drivers:', error);
    throw error;
  }

  const driverIds = (drivers || []).map(d => d.id);
  console.log(`[useReportsDateWindow] Found ${driverIds.length} drivers for dispatcher`);
  return driverIds;
};

/**
 * Main hook for date-window based reports data loading
 */
export const useReportsDateWindow = (options: ReportsDateWindowOptions) => {
  const queryClient = useQueryClient();
  const { dispatcherId, selectedDate } = options;
  
  // Track loaded windows for accumulative caching
  const loadedWindowsRef = useRef<Set<string>>(new Set());
  
  // Calculate current date window
  const currentWindow = useMemo(() => {
    return calculateDateWindow(selectedDate, 'initial');
  }, [selectedDate]);
  
  const windowKey = getWindowKey(currentWindow);

  // Fetch data for the current date window
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports-date-window', dispatcherId, windowKey],
    queryFn: async () => {
      if (!dispatcherId) {
        console.log('[useReportsDateWindow] No dispatcher ID, returning empty');
        return { orders: [], driverIds: [] };
      }

      // Step 1: Get driver IDs for this dispatcher
      const driverIds = await fetchDriverIdsForDispatcher(dispatcherId);
      if (driverIds.length === 0) {
        return { orders: [], driverIds: [] };
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
      const allOrders = [...unlockedOrders, ...deduplicatedLocked, ...gapFillOrders];
      
      console.log(`[useReportsDateWindow] Total orders for window: ${allOrders.length} (unlocked: ${unlockedOrders.length}, locked: ${deduplicatedLocked.length}, gap-fill: ${gapFillOrders.length})`);

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
    
    // Get orders from all cached windows
    for (const windowKeyStr of loadedWindowsRef.current) {
      const cachedData = queryClient.getQueryData<{ orders: any[] }>(['reports-date-window', dispatcherId, windowKeyStr]);
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
  }, [data?.orders, dispatcherId, queryClient]);

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
