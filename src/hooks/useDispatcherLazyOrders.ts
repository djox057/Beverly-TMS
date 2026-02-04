/**
 * useDispatcherLazyOrders - Lazy loading orders for individual dispatcher calendars
 * 
 * This hook provides dispatcher-specific date-range loading:
 * - Only loads orders for the specific dispatcher's drivers
 * - Loads incrementally as each dispatcher's calendar navigates
 * - Maintains per-dispatcher loaded ranges to avoid redundant fetches
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, subDays } from "date-fns";

// Per-dispatcher loaded date ranges
type LoadedRanges = Map<string, Set<string>>; // dispatcherId -> Set of "YYYY-MM-DD" dates

// Global storage to persist across re-renders
const dispatcherLoadedDates: LoadedRanges = new Map();
const dispatcherOrders: Map<string, Map<string, any>> = new Map(); // dispatcherId -> (orderId -> order)

// Loading state per dispatcher
const loadingDispatchers = new Set<string>();

interface DispatcherLazyOrdersOptions {
  onOrdersLoaded?: (dispatcherId: string, orders: any[]) => void;
}

/**
 * Fetch orders for a specific dispatcher's drivers within a date range
 */
const fetchOrdersForDispatcher = async (
  dispatcherId: string,
  targetDate: Date
): Promise<any[]> => {
  // Get the dispatcher's drivers
  const { data: drivers, error: driversError } = await supabase
    .from("drivers")
    .select("id")
    .eq("is_active", true)
    .eq("dispatcher_id", dispatcherId);

  if (driversError) {
    console.error(`[useDispatcherLazyOrders] Error fetching drivers for ${dispatcherId}:`, driversError);
    return [];
  }

  if (!drivers || drivers.length === 0) {
    console.log(`[useDispatcherLazyOrders] No drivers found for dispatcher ${dispatcherId}`);
    return [];
  }

  const driverIds = drivers.map(d => d.id);
  const driverIdsStr = driverIds.join(',');
  
  // Load orders for the target date (with 1 day buffer on each side)
  const startDateStr = format(subDays(targetDate, 1), "yyyy-MM-dd");
  const endDateStr = format(addDays(targetDate, 1), "yyyy-MM-dd");

  console.log(`[useDispatcherLazyOrders] Fetching orders for dispatcher ${dispatcherId}, ${driverIds.length} drivers, dates: ${startDateStr} to ${endDateStr}`);

  try {
    // Fetch unlocked orders
    const { data: unlockedOrders, error: unlockedError } = await supabase
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
      .limit(500);

    if (unlockedError) {
      console.error(`[useDispatcherLazyOrders] Error fetching unlocked orders:`, unlockedError);
    }

    // Fetch locked (archived) orders
    const { data: lockedOrders, error: lockedError } = await supabase
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
      .limit(500);

    if (lockedError) {
      console.error(`[useDispatcherLazyOrders] Error fetching locked orders:`, lockedError);
    }

    const allOrders = [...(unlockedOrders || []), ...(lockedOrders || [])];
    
    // Deduplicate
    const seen = new Set<string>();
    const uniqueOrders = allOrders.filter(o => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

    // Fetch pickup_drops and transfers if we have orders
    if (uniqueOrders.length > 0) {
      const orderIds = uniqueOrders.map(o => o.id);
      
      const [pickupDropsResult, transfersResult] = await Promise.all([
        supabase
          .from("pickup_drops")
          .select("id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at")
          .in("order_id", orderIds),
        supabase
          .from("order_transfers")
          .select("id, order_id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, transfer_city, transfer_state, transfer_address, transfer_datetime")
          .in("order_id", orderIds)
      ]);

      const pickupDrops = pickupDropsResult.data || [];
      const transfers = transfersResult.data || [];

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

      // Attach to orders
      for (const order of uniqueOrders) {
        (order as any).pickup_drops = (pickupDropsByOrderId.get(order.id) || [])
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));
        (order as any).order_transfers = (transfersByOrderId.get(order.id) || [])
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));
      }
    }

    console.log(`[useDispatcherLazyOrders] Loaded ${uniqueOrders.length} orders for dispatcher ${dispatcherId}`);
    return uniqueOrders;
  } catch (error) {
    console.error(`[useDispatcherLazyOrders] Error loading orders:`, error);
    return [];
  }
};

/**
 * Check if a date is already loaded for a dispatcher
 */
const isDateLoaded = (dispatcherId: string, date: Date): boolean => {
  const dateStr = format(date, "yyyy-MM-dd");
  const loadedSet = dispatcherLoadedDates.get(dispatcherId);
  return loadedSet?.has(dateStr) ?? false;
};

/**
 * Mark dates as loaded for a dispatcher
 */
const markDatesLoaded = (dispatcherId: string, targetDate: Date) => {
  let loadedSet = dispatcherLoadedDates.get(dispatcherId);
  if (!loadedSet) {
    loadedSet = new Set();
    dispatcherLoadedDates.set(dispatcherId, loadedSet);
  }
  // Mark the date and 1 day buffer as loaded
  loadedSet.add(format(subDays(targetDate, 1), "yyyy-MM-dd"));
  loadedSet.add(format(targetDate, "yyyy-MM-dd"));
  loadedSet.add(format(addDays(targetDate, 1), "yyyy-MM-dd"));
};

/**
 * Store orders for a dispatcher
 */
const storeOrders = (dispatcherId: string, orders: any[]) => {
  let orderMap = dispatcherOrders.get(dispatcherId);
  if (!orderMap) {
    orderMap = new Map();
    dispatcherOrders.set(dispatcherId, orderMap);
  }
  for (const order of orders) {
    orderMap.set(order.id, order);
  }
};

/**
 * Get all stored orders for a dispatcher
 */
export const getDispatcherOrders = (dispatcherId: string): any[] => {
  const orderMap = dispatcherOrders.get(dispatcherId);
  return orderMap ? Array.from(orderMap.values()) : [];
};

/**
 * Clear all stored data (for mode changes etc)
 */
export const clearDispatcherLazyData = () => {
  dispatcherLoadedDates.clear();
  dispatcherOrders.clear();
  loadingDispatchers.clear();
};

/**
 * Main hook for dispatcher-specific lazy loading
 */
export const useDispatcherLazyOrders = (options?: DispatcherLazyOrdersOptions) => {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const loadingRef = useRef<Set<string>>(new Set());

  /**
   * Load orders for a dispatcher when their calendar navigates to a new date
   * This is called immediately on each arrow click
   */
  const loadOrdersForDate = useCallback(async (
    dispatcherId: string,
    targetDate: Date
  ): Promise<boolean> => {
    // Skip if already loaded this date range
    if (isDateLoaded(dispatcherId, targetDate)) {
      console.log(`[useDispatcherLazyOrders] Date ${format(targetDate, "yyyy-MM-dd")} already loaded for ${dispatcherId}`);
      return false;
    }

    // Skip if already loading for this dispatcher
    const loadKey = `${dispatcherId}-${format(targetDate, "yyyy-MM-dd")}`;
    if (loadingRef.current.has(loadKey)) {
      console.log(`[useDispatcherLazyOrders] Already loading ${loadKey}`);
      return false;
    }

    loadingRef.current.add(loadKey);
    setLoadingStates(prev => ({ ...prev, [dispatcherId]: true }));

    try {
      const orders = await fetchOrdersForDispatcher(dispatcherId, targetDate);
      
      // Store the orders
      storeOrders(dispatcherId, orders);
      
      // Mark dates as loaded
      markDatesLoaded(dispatcherId, targetDate);
      
      // Notify callback if provided
      options?.onOrdersLoaded?.(dispatcherId, orders);
      
      return orders.length > 0;
    } catch (error) {
      console.error(`[useDispatcherLazyOrders] Failed to load orders for ${dispatcherId}:`, error);
      return false;
    } finally {
      loadingRef.current.delete(loadKey);
      setLoadingStates(prev => ({ ...prev, [dispatcherId]: false }));
    }
  }, [options]);

  /**
   * Check if loading is in progress for a dispatcher
   */
  const isLoading = useCallback((dispatcherId: string): boolean => {
    return loadingStates[dispatcherId] ?? false;
  }, [loadingStates]);

  return {
    loadOrdersForDate,
    isLoading,
    getDispatcherOrders,
    clearDispatcherLazyData,
    isDateLoaded,
  };
};

export default useDispatcherLazyOrders;
