import { fetchReportsReferenceRows } from "@/utils/fetchReportsReferenceRows";
import { refreshReportsOrders } from "@/utils/refreshReportsOrders";
/**
 * useReportsDateWindowAdapter - Adapter layer for useReportsDateWindow
 *
 * This adapter transforms the output of useReportsDateWindow to match
 * the expected shape of the existing useReports hook, ensuring UI compatibility.
 *
 * It also re-exports mutations from useReports.ts to maintain full functionality.
 */

import { useMemo, useCallback, useEffect, useRef, useReducer } from "react";
import { isValidUUID } from "@/utils/validation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useReportsDateWindow, useOrderFilesOnDemand, fetchPickupDropsForOrders, fetchOrderTransfersForOrders, patchOrderInGlobalStore, removeOrderFromGlobalStore, flushGlobalStoreNotifications, hasOrderInGlobalStore, resetReportsOrderCache } from "./useReportsDateWindow";
import { useReports } from "./useReports";
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { mergeTruckTelemetry } from "@/utils/truckTelemetry";
import { useIndividualMode } from "@/contexts/IndividualModeContext";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useReportsLive } from "@/hooks/useReportsLive";
import { refreshLumperMissingOrders } from "@/hooks/useLumperMissingRevisedRC";
import type { LiveChanges } from "@/utils/reportsLiveQueue";
import { notifyReportsSource } from "@/utils/reportsLiveEvents";
import { clearDispatcherLazyData, refreshDispatcherLazyData } from "@/hooks/useDispatcherLazyOrders";
import { REPORT_DRIVER_SELECT, REPORT_TRUCK_SELECT, watchReportReferenceChanges } from "@/utils/reportReferenceFields";

// Feature flag - set to true to use date-window based loading
export const USE_DATE_WINDOW_LOADING = true;

interface UseReportsDateWindowAdapterOptions {
  priorityOffice?: string | null;
  dispatcherId: string | null;
  dispatcherProfileId?: string | null;
  selectedDate: Date;
  /** When true, bypasses Individual Mode office restrictions (for search results) */
  hasActiveSearch?: boolean;
  /**
   * Optional spotlight driver id from the Reports load# search. Passed
   * through to useReportsDateWindow so the matched driver renders before
   * the rest of the office finishes loading.
   */
  spotlightDriverId?: string | null;
}

/**
 * Order files caching (module-scope)
 *
 * Problem: order_files were being refetched for *all* accumulated orders whenever
 * a new date window was loaded (queryKey depended on full order-id set).
 *
 * Fix: keep a persistent cache keyed by order_id and only fetch metadata for
 * order IDs we have not loaded yet.
 */
type OrderFileLite = {
  id: string;
  order_id: string;
  file_category: string | null;
  file_name: string | null;
  file_path: string | null;
};

const orderFilesCacheByOrderId = new Map<string, OrderFileLite[]>();
const orderFilesLoadedOrderIds = new Set<string>();
let orderFilesFetchInFlight: Promise<void> | null = null;

/**
 * Lost day notes accumulator (module-scope)
 * Home Time / lost_day_notes are loaded explicitly by date. Once a date is
 * present in lostDayNotesLoadedDates, it is not queried again in this page
 * session. New carousel positions request only the not-yet-loaded dates.
 *
 * Keyed by `${driver_id}_${YYYY-MM-DD}` so upserts replace prior rows.
 */
const lostDayNotesAccumulator = new Map<string, any>();
// Track individual dates (YYYY-MM-DD) that have already been fetched so
// overlapping windows don't re-fetch the same days repeatedly.
const lostDayNotesLoadedDates = new Set<string>();

const lostDayNotesAccKey = (n: { driver_id: string; date: string }) =>
  `${n.driver_id}_${String(n.date).slice(0, 10)}`;

const fmtLostDayDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLostDayDateStrings = (start: Date, end: Date) => {
  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    dates.push(fmtLostDayDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const loadMissingLostDayNoteDates = async (dateStrings: string[], source: string) => {
  const missing = Array.from(new Set(dateStrings))
    .filter((ds) => !lostDayNotesLoadedDates.has(ds))
    .sort();

  if (missing.length === 0) return false;

  // Mark immediately so overlapping initial/carousel calls cannot double-fetch the same date.
  for (const ds of missing) lostDayNotesLoadedDates.add(ds);

  try {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("lost_day_notes").select("*")
        .in("date", missing).order("id").range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if ((data?.length || 0) < 1000) break;
    }
    const dates = new Set(missing);
    for (const [key, note] of lostDayNotesAccumulator) {
      if (dates.has(String(note.date).slice(0, 10))) lostDayNotesAccumulator.delete(key);
    }
    ingestLostDayNotes(rows);
    return true;
  } catch (e) {
    for (const ds of missing) lostDayNotesLoadedDates.delete(ds);
    console.error(`[adapter] ${source} threw:`, e);
    return false;
  }
};

let lostDayNotesInFlight: Promise<boolean> | null = null;
const fetchMissingLostDayNoteDates = async (dates: string[], source: string): Promise<boolean> => {
  if (lostDayNotesInFlight) { await lostDayNotesInFlight; return fetchMissingLostDayNoteDates(dates, source); }
  lostDayNotesInFlight = loadMissingLostDayNoteDates(dates, source).finally(() => { lostDayNotesInFlight = null; });
  return lostDayNotesInFlight;
};

const ingestLostDayNotes = (rows: any[]) => {
  for (const r of rows) {
    if (!r?.driver_id || !r?.date) continue;
    lostDayNotesAccumulator.set(lostDayNotesAccKey(r), r);
  }
};

const lostDayNotesVersionListeners = new Set<() => void>();
const bumpLostDayNotesVersion = () => {
  for (const fn of lostDayNotesVersionListeners) fn();
};

export const upsertLostDayNoteInAccumulator = (note: any) => {
  if (!note?.driver_id || !note?.date) return;
  lostDayNotesAccumulator.set(lostDayNotesAccKey(note), note);
  bumpLostDayNotesVersion();
};

export const removeLostDayNoteFromAccumulator = (driverId: string, date: string) => {
  if (!driverId || !date) return;
  lostDayNotesAccumulator.delete(`${driverId}_${String(date).slice(0, 10)}`);
  bumpLostDayNotesVersion();
};

const clearLostDayNotesAccumulator = () => {
  lostDayNotesAccumulator.clear();
  lostDayNotesLoadedDates.clear();
};

/**
 * Explicit missing-date loaders for lost_day_notes. These are the only paths
 * that query Home Time data, and they always skip already loaded dates first.
 *
 * Notifies mounted Reports adapters to re-derive UI data from the accumulator.
 */

export const ensureLostDayNotesWindowForDate = async (anchorDate: Date) => {
  const start = new Date(anchorDate);
  start.setDate(start.getDate() - 3);
  const end = new Date(anchorDate);
  end.setDate(end.getDate() + 4);
  const didFetch = await fetchMissingLostDayNoteDates(
    getLostDayDateStrings(start, end),
    "ensureLostDayNotesWindowForDate"
  );
  if (didFetch) {
    bumpLostDayNotesVersion();
  }
};

export const ensureLostDayNotesForDateRange = async (startDate: Date, endDate: Date) => {
  const didFetch = await fetchMissingLostDayNoteDates(
    getLostDayDateStrings(startDate, endDate),
    "ensureLostDayNotesForDateRange"
  );
  if (didFetch) {
    bumpLostDayNotesVersion();
  }
};

const clearOrderFilesCache = () => {
  orderFilesCacheByOrderId.clear();
  orderFilesLoadedOrderIds.clear();
};

export const invalidateOrderFilesCacheForOrder = (orderId: string | null | undefined) => {
  if (!orderId) return;
  orderFilesCacheByOrderId.delete(orderId);
  orderFilesLoadedOrderIds.delete(orderId);
};

const getCachedOrderFilesFlat = (orderIds: string[]): OrderFileLite[] => {
  const all: OrderFileLite[] = [];
  for (const id of orderIds) {
    const files = orderFilesCacheByOrderId.get(id);
    if (files && files.length) all.push(...files);
  }
  return all;
};

const fetchAndCacheOrderFilesForOrders = async (orderIds: string[]) => {
  const unique = Array.from(new Set(orderIds)).filter(Boolean);
  const missing = unique.filter((id) => !orderFilesLoadedOrderIds.has(id));
  if (missing.length === 0) return;

  // Ensure only one fetch pipeline runs at a time to avoid duplicate storms
  if (orderFilesFetchInFlight) {
    await orderFilesFetchInFlight;
    const stillMissing = missing.filter((id) => !orderFilesLoadedOrderIds.has(id));
    if (stillMissing.length === 0) return;
  }

  const run = async () => {
    const ORDER_ID_BATCH_SIZE = 300;
    const RESULT_PAGE_SIZE = 1000;

    for (let i = 0; i < missing.length; i += ORDER_ID_BATCH_SIZE) {
      const batchOrderIds = missing.slice(i, i + ORDER_ID_BATCH_SIZE);
      const batchFiles: OrderFileLite[] = [];

      // Paginate result rows for this batch (PostgREST cap)
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("order_files")
          .select("id, order_id, file_category, file_name, file_path")
          .in("order_id", batchOrderIds)
          .order("id", { ascending: true })
          .range(offset, offset + RESULT_PAGE_SIZE - 1);

        if (error) {
          throw error;
        }

        const rows = (data || []) as OrderFileLite[];
        if (rows.length) batchFiles.push(...rows);

        hasMore = rows.length === RESULT_PAGE_SIZE;
        offset += RESULT_PAGE_SIZE;
      }

      // Group results by order_id and mark all requested order IDs as loaded (even if 0 files)
      const byOrderId = new Map<string, OrderFileLite[]>();
      for (const f of batchFiles) {
        const arr = byOrderId.get(f.order_id) || [];
        arr.push(f);
        byOrderId.set(f.order_id, arr);
      }

      for (const oid of batchOrderIds) {
        orderFilesCacheByOrderId.set(oid, byOrderId.get(oid) || []);
        orderFilesLoadedOrderIds.add(oid);
      }
    }
  };

  orderFilesFetchInFlight = run().finally(() => {
    orderFilesFetchInFlight = null;
  });
  await orderFilesFetchInFlight;
};

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
  const { priorityOffice, dispatcherId, dispatcherProfileId, selectedDate, hasActiveSearch, spotlightDriverId } = options;
  const queryClient = useQueryClient();
  
  // Get individual mode state - this controls database-level filtering
  const { individualMode, currentUserDispatcherId, individualOverrideDriverIds } = useIndividualMode();
  
  // Track previous mode to detect changes and invalidate cache
  const prevModeRef = useRef<{ individualMode: boolean; userId: string | null } | null>(null);
  
  // Fetch user's office + full name (office used for other-office check;
  // full name used to expand Individual-mode scope to loads booked by user)
  const { data: userProfile } = useQuery({
    queryKey: ['user-office', currentUserDispatcherId],
    queryFn: async () => {
      if (!currentUserDispatcherId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('office, full_name')
        .eq('user_id', currentUserDispatcherId)
        .single();
      if (error) return null;
      return { office: data?.office || null, fullName: data?.full_name || null };
    },
    staleTime: 300000, // 5 minutes
    enabled: !!currentUserDispatcherId,
  });
  const userOffice = userProfile?.office || null;
  const userFullName = userProfile?.fullName || null;
  
  // Check if we're viewing a different office than user's own
  // BG 1st floor and BG 4th floor are treated as the same office here, so a
  // user whose own office is one BG floor isn't blocked from viewing the other.
  const BG_FLOORS = new Set(["BG 1st floor", "BG 4th floor"]);
  const sameBgPair =
    !!userOffice &&
    !!priorityOffice &&
    BG_FLOORS.has(userOffice) &&
    BG_FLOORS.has(priorityOffice);
  const isViewingOtherOffice = !!(
    userOffice &&
    priorityOffice &&
    userOffice !== priorityOffice &&
    !sameBgPair
  );
  
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
      const modeChanged = prevModeKey.individualMode !== currentModeKey.individualMode || prevModeKey.userId !== currentModeKey.userId;
      
      if (modeChanged) {
        console.log(`[adapter] Individual mode changed: ${prevModeKey.individualMode} -> ${currentModeKey.individualMode}, invalidating queries`);

        // Individual-mode toggle is a full context switch; clear order_files cache to avoid stale bloat
        clearDispatcherLazyData();
        clearOrderFilesCache();
        // Same context switch — drop accumulated lost_day_notes so the new scope refetches cleanly.
        clearLostDayNotesAccumulator();
        
        // Invalidate all adapter queries to force refetch with new scope
        queryClient.invalidateQueries({ queryKey: ['reports-date-window-stable'] });
        queryClient.invalidateQueries({ queryKey: ['reports-date-window-orders'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-trucks'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-drivers'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-truck-notes'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-lost-day-notes'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-last-loads'] });
        queryClient.invalidateQueries({ queryKey: ['adapter-order-files'] });
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
    individualOverrideDriverIds: (isViewingOtherOfficeInIndividualMode || shouldBypassIndividualMode) ? null : individualOverrideDriverIds,
    bookedByName: (isViewingOtherOfficeInIndividualMode || shouldBypassIndividualMode) ? null : userFullName,
    spotlightDriverId: spotlightDriverId ?? null,
  });

  // Legacy hook (for fallback when feature flag is OFF). When feature flag is ON,
  // we still call this hook, but in mutation-only mode (disableFetch=true).
  const legacyReportsHook = useReports({ priorityOffice, disableFetch: USE_DATE_WINDOW_LOADING });

  // Fetch additional data needed for transformation
  const driverIdsForScope = dateWindowHook.driverIds || [];
  const scopeEnabled = USE_DATE_WINDOW_LOADING && !!dispatcherId && driverIdsForScope.length > 0;
  // Global queries fire as soon as we have a dispatcher, regardless of which office is selected
  const globalEnabled = USE_DATE_WINDOW_LOADING && !!dispatcherId;
  
  // Create a mode-specific key suffix to force refetch on individual mode toggle
  const modeKeySuffix = individualMode ? `individual-${currentUserDispatcherId}` : 'all';

  // Compute a collision-resistant hash of driverIdsForScope using djb2
  // Still used for orders realtime scope checking and driverIdsSetRef
  const driverScopeHash = useMemo(() => {
    if (driverIdsForScope.length === 0) return "empty";
    const sorted = [...driverIdsForScope].sort();
    const hashInput = JSON.stringify(sorted);
    let hash = 5381;
    for (let i = 0; i < hashInput.length; i++) {
      hash = ((hash << 5) + hash) + hashInput.charCodeAt(i);
    }
    return `${sorted.length}-${(hash >>> 0).toString(36)}`;
  }, [driverIdsForScope]);

  // GLOBAL FETCH: all active trucks (not filtered by office)
  // Tab switching filters client-side via filteredTrucks memo (0ms)
  const { data: allTrucks } = useQuery({
    queryKey: ["adapter-trucks", modeKeySuffix],
    queryFn: async () => {
      console.time('[perf] adapter-trucks');
      const data = await fetchReportsReferenceRows("trucks", REPORT_TRUCK_SELECT);
      console.timeEnd('[perf] adapter-trucks');
      return await mergeTruckTelemetry(data || [], true);
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
    enabled: globalEnabled,
  });

  // Client-side filtering: only trucks assigned to drivers in current office scope
  const filteredTrucks = useMemo(() => {
    if (!allTrucks || driverIdsForScope.length === 0) return [];
    const scopeSet = new Set(driverIdsForScope);
    return allTrucks.filter(t => scopeSet.has(t.driver1_id) || scopeSet.has(t.driver2_id));
  }, [allTrucks, driverIdsForScope]);

  // Get all trailer IDs from filtered trucks to fetch trailer numbers
  const trailerIdsFromTrucks = useMemo(() => {
    if (!filteredTrucks || filteredTrucks.length === 0) return [];
    const ids = new Set<string>();
    for (const t of filteredTrucks) {
      if (t.trailer_id) ids.add(t.trailer_id);
    }
    return Array.from(ids);
  }, [filteredTrucks]);

  const { data: trailers } = useQuery({
    queryKey: ["adapter-trailers", trailerIdsFromTrucks.join(","), modeKeySuffix],
    queryFn: async () => {
      if (trailerIdsFromTrucks.length === 0) return [];
      console.time('[perf] adapter-trailers');
      const { data, error } = await supabase
        .from("trailers")
        .select("id, trailer_number, dot_inspection_date, plate_expiration_date, insurance_expiration_date, vin, plate, vented")
        .in("id", trailerIdsFromTrucks);
      console.timeEnd('[perf] adapter-trailers');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
    enabled: scopeEnabled && trailerIdsFromTrucks.length > 0,
  });

  // GLOBAL FETCH: all active drivers
  const { data: allDrivers } = useQuery({
    queryKey: ["adapter-drivers", modeKeySuffix],
    queryFn: async () => {
      console.time('[perf] adapter-drivers');
      const data = await fetchReportsReferenceRows("drivers", REPORT_DRIVER_SELECT);
      console.timeEnd('[perf] adapter-drivers');
      return data || [];
    },
    staleTime: 300000,
    refetchOnWindowFocus: false, // Compact live versions drive updates, including HOS.
    enabled: globalEnabled,
  });

  // Client-side filtering for current office scope
  const filteredDrivers = useMemo(() => {
    if (!allDrivers || driverIdsForScope.length === 0) return [];
    const scopeSet = new Set(driverIdsForScope);
    return allDrivers.filter(d => scopeSet.has(d.id));
  }, [allDrivers, driverIdsForScope]);

  // Get unique dispatcher IDs from the filtered drivers - use stable string for queryKey
  const dispatcherIdsFromDrivers = useMemo(() => {
    if (!filteredDrivers || filteredDrivers.length === 0) return [];
    const ids = new Set<string>();
    for (const d of filteredDrivers) {
      if (d.dispatcher_id) ids.add(d.dispatcher_id);
    }
    const allIds = Array.from(ids);
    const validIds = allIds.filter(isValidUUID);
    if (validIds.length < allIds.length) {
      console.warn(`[ReportsAdapter] Filtered ${allIds.length - validIds.length} invalid UUIDs from dispatcher_id`);
    }
    return validIds.sort();
  }, [filteredDrivers]);

  // Create a stable string key to prevent React Query re-renders
  const dispatcherIdsKey = dispatcherIdsFromDrivers.join(",");

  const { data: dispatchers } = useQuery({
    queryKey: ["adapter-dispatchers", dispatcherIdsKey],
    queryFn: async () => {
      if (!dispatcherIdsKey) return [];
      console.time('[perf] adapter-dispatchers');
      const ids = dispatcherIdsKey.split(",");
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, office, ext, created_at")
        .in("user_id", ids);
      console.timeEnd('[perf] adapter-dispatchers');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
    enabled: scopeEnabled && dispatcherIdsKey.length > 0,
  });

  const { data: companies } = useQuery({
    queryKey: ["adapter-companies"],
    queryFn: async () => {
      console.time('[perf] adapter-companies');
      const { data, error } = await supabase.from("companies").select("id, name");
      console.timeEnd('[perf] adapter-companies');
      if (error) throw error;
      return data || [];
    },
    staleTime: 600000,
    enabled: scopeEnabled,
  });

  // Fetch off-duty dispatcher statuses (inactive dispatchers with stored driver snapshots)
  const { data: offDutyStatuses } = useQuery({
    queryKey: ["adapter-off-duty-statuses"],
    queryFn: async () => {
      console.time('[perf] adapter-off-duty-statuses');
      const { data, error } = await supabase
        .from("dispatcher_status")
        .select("dispatcher_id, inactive_trucks")
        .eq("is_active", false);
      console.timeEnd('[perf] adapter-off-duty-statuses');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
    enabled: globalEnabled,
  });

  // Fetch profiles for off-duty dispatchers (they may not be in the main dispatchers query)
  const offDutyDispatcherIds = useMemo(() => {
    if (!offDutyStatuses || offDutyStatuses.length === 0) return [];
    return offDutyStatuses.map(s => s.dispatcher_id).filter(Boolean).sort();
  }, [offDutyStatuses]);
  const offDutyDispatcherIdsKey = offDutyDispatcherIds.join(",");

  const { data: offDutyDispatchers } = useQuery({
    queryKey: ["adapter-off-duty-dispatchers", offDutyDispatcherIdsKey],
    queryFn: async () => {
      if (!offDutyDispatcherIdsKey) return [];
      const ids = offDutyDispatcherIdsKey.split(",");
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, office, ext, created_at")
        .in("user_id", ids);
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
    enabled: globalEnabled && offDutyDispatcherIdsKey.length > 0,
  });

  const { data: allTruckNotes } = useQuery({
    queryKey: ["adapter-truck-notes", modeKeySuffix],
    queryFn: async () => {
      console.time('[perf] adapter-truck-notes');
      const { data, error } = await supabase
        .from("truck_notes")
        .select("*")
        .order("updated_at", { ascending: false });
      console.timeEnd('[perf] adapter-truck-notes');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
    enabled: globalEnabled,
  });

  // Client-side filtering for current office scope
  const filteredTruckNotes = useMemo(() => {
    if (!allTruckNotes || driverIdsForScope.length === 0) return [];
    const scopeSet = new Set(driverIdsForScope);
    return allTruckNotes.filter(n => scopeSet.has(n.driver_id));
  }, [allTruckNotes, driverIdsForScope]);

  // Re-render this hook when the explicit missing-date loader, optimistic
  // mutation, or realtime patch changes the module-scope accumulator.
  const [lostNotesTick, forceLostNotesTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const listener = () => forceLostNotesTick();
    lostDayNotesVersionListeners.add(listener);
    return () => {
      lostDayNotesVersionListeners.delete(listener);
    };
  }, []);

  useQuery({
    queryKey: ["adapter-lost-day-notes", modeKeySuffix],
    queryFn: async () => Array.from(lostDayNotesAccumulator.values()),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    enabled: globalEnabled,
  });

  useEffect(() => {
    if (!globalEnabled) return;
    ensureLostDayNotesWindowForDate(selectedDate);
  }, [globalEnabled, selectedDate]);

  const allLostDayNotes = useMemo(
    () => Array.from(lostDayNotesAccumulator.values()),
    [lostNotesTick],
  );

  useEffect(() => {
    queryClient.setQueryData(["adapter-lost-day-notes", modeKeySuffix], allLostDayNotes);
  }, [allLostDayNotes, modeKeySuffix, queryClient]);

  // Client-side filtering for current office scope
  const filteredLostDayNotes = useMemo(() => {
    if (driverIdsForScope.length === 0) return [];
    const scopeSet = new Set(driverIdsForScope);
    return allLostDayNotes.filter(n => scopeSet.has(n.driver_id));
  }, [allLostDayNotes, driverIdsForScope]);

  // Get order IDs from date window for order_files fetch
  // Stabilized: only creates a new reference when the actual ID set changes
  const windowOrderIdsRef = useRef<string[]>([]);
  const windowOrderIds = useMemo(() => {
    if (!dateWindowHook.orders || dateWindowHook.orders.length === 0) {
      if (windowOrderIdsRef.current.length === 0) return windowOrderIdsRef.current;
      windowOrderIdsRef.current = [];
      return windowOrderIdsRef.current;
    }
    const newIds = dateWindowHook.orders.map((o) => o.id);
    const prev = windowOrderIdsRef.current;
    if (prev.length === newIds.length && prev.every((id, i) => id === newIds[i])) {
      return prev;
    }
    windowOrderIdsRef.current = newIds;
    return newIds;
  }, [dateWindowHook.orders]);

  // Fetch order_files for all orders in the date window (minimal fields for coloring)

  // IMPORTANT: stable queryKey so we don't refetch everything when one order is added.
  // We fetch-and-cache only missing order IDs and return a flat list for the current window.
  const {
    data: orderFiles,
    isLoading: isOrderFilesLoading,
    isFetching: isOrderFilesFetching,
    refetch: refetchOrderFiles,
  } = useQuery({
    queryKey: ["adapter-order-files", modeKeySuffix],
    queryFn: async () => {
      if (windowOrderIds.length === 0) return [];
      console.time('[perf] adapter-order-files');
      await fetchAndCacheOrderFilesForOrders(windowOrderIds);
      const result = getCachedOrderFilesFlat(windowOrderIds);
      console.timeEnd('[perf] adapter-order-files');
      return result;
    },
    staleTime: 300000,
    enabled: scopeEnabled && windowOrderIds.length > 0,
  });

  // When new orders are injected (windowOrderIds grows), trigger a background refetch
  // to pick up missing order_files. This avoids the previous full refetch keyed on IDs.
  const lastRequestedMissingFiles = useRef("");
  useEffect(() => {
    if (!scopeEnabled || isOrderFilesFetching) return;
    const missing = windowOrderIds.filter(id => !orderFilesLoadedOrderIds.has(id)).sort().join(",");
    if (!missing) { lastRequestedMissingFiles.current = ""; return; }
    if (lastRequestedMissingFiles.current === missing) return;
    lastRequestedMissingFiles.current = missing;
    void refetchOrderFiles();
  }, [scopeEnabled, isOrderFilesFetching, refetchOrderFiles, windowOrderIds]);

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
    if (!filteredDrivers || filteredDrivers.length === 0) return [];
    return filteredDrivers.filter(d => !driversWithOrdersInWindow.has(d.id)).map(d => d.id);
  }, [filteredDrivers, driversWithOrdersInWindow]);

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
          id, load_number, internal_load_number, load_company_code, broker_load_number, status, notes, date_change_notes,
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
            .select("id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at, latitude, longitude")
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

  const liveScopeRef = useRef(driverIdsForScope);
  liveScopeRef.current = [...new Set([
    ...driverIdsForScope,
    ...(offDutyStatuses || []).filter(status => !priorityOffice ||
      offDutyDispatchers?.some(profile => profile.user_id === status.dispatcher_id && profile.office === priorityOffice))
      .flatMap(status => ((status.inactive_trucks as any[]) || []).map(driver => driver.id).filter(Boolean)),
  ])];

  const refreshLive = useCallback(async (changes: LiveChanges, isCurrent: () => boolean) => {
    const invalidate = async (key: string) => {
      if (!isCurrent()) return;
      await queryClient.invalidateQueries({ queryKey: [key], refetchType: "active" }, { throwOnError: true });
    };
    const failures: unknown[] = [];
    // A failed badge/reference request must not replay successful order/fleet reads.
    const attempt = async (sources: string[], work: () => Promise<void>) => {
      try {
        await work();
        if (!isCurrent()) throw new Error("Reports refresh interrupted");
        sources.forEach(source => changes.delete(source));
      } catch (error) { failures.push(error); }
    };
    const scopeChanged = ["drivers", "profiles", "user_roles", "afterhours_assignments", "dispatcher_status"].some(key => changes.has(key));
    if (scopeChanged) changes.set("orders", null);
    const coreSources = ["orders", "pickup_drops", "order_transfers"].filter(source => changes.has(source));
    const fullOrders = coreSources.some(key => changes.get(key) === null);
    await attempt(coreSources, async () => {
      if (scopeChanged || fullOrders) await invalidate("reports-date-window-stable");
      if (!isCurrent()) return;
      if (fullOrders || scopeChanged) {
        // Invalidation alone is insufficient: date-window and lazy loaders also have module caches.
        resetReportsOrderCache();
        await queryClient.cancelQueries({ queryKey: ["reports-date-window-orders"] });
        await invalidate("reports-date-window-orders");
        await refreshDispatcherLazyData(isCurrent);
        await invalidate("adapter-last-loads");
      } else {
        const ids = new Set<string>();
        for (const source of ["orders", "pickup_drops", "order_transfers"]) {
          for (const id of changes.get(source) || []) ids.add(id);
        }
        await refreshReportsOrders([...ids], liveScopeRef.current, isCurrent);
      }
      if (!isCurrent()) return;

      if (fullOrders) await invalidate("lumper-missing-revised-rc");
      else {
        const ids = [...new Set(coreSources.flatMap(source => [...(changes.get(source) || [])]))];
        if (ids.length) await refreshLumperMissingOrders(queryClient, ids, isCurrent);
      }
    });
    const customSources = new Set(["order_files", "lost_day_notes", "driver_hos", "truck_telemetry"]);
    const queryKeys: Record<string, string[]> = {
      drivers: ["adapter-drivers", "driver", "driver-names", "lumper-missing-revised-rc"],
      trucks: ["adapter-trucks", "lumper-missing-revised-rc"],
      trailers: ["adapter-trailers"],
      truck_notes: ["adapter-truck-notes"],
      profiles: ["adapter-dispatchers", "adapter-off-duty-dispatchers", "user-office", "reports-supervised-dispatchers", "afterhours-driver-map"],
      companies: ["adapter-companies", "companies"], brokers: ["brokers"],
      dispatcher_status: ["adapter-off-duty-statuses"],
      driver_problems: ["driver-problems"], driver_complaints: ["driver-complaints"],
      driver_drug_tests: ["driver-drug-tests"], efs_other_requests: ["efs-missing-by-driver"],
      company_coi_vins: ["coi-insured-vins"], temporary_plates: ["temporary-plates-list"],
      user_extensions: ["user-extensions-popover"],
      daily_report_permissions: ["daily-report-permissions"],
      final_update_sends: ["final-update-sends"],
      afterhours_schedule: ["afterhours-driver-map"], afterhours_assignments: ["afterhours-driver-map"],
      orders: ["lumper-missing-revised-rc"],
    };
    if (changes.has("order_files")) await attempt(["order_files"], async () => {
      const ids = changes.get("order_files");
      // Wait for older file reads before dropping their completion markers.
      if (orderFilesFetchInFlight) await orderFilesFetchInFlight.catch(() => {});
      if (!isCurrent()) return;
      if (ids === null) clearOrderFilesCache();
      else for (const id of ids || []) invalidateOrderFilesCacheForOrder(id);
      await invalidate("adapter-order-files");
      const fallbackAffected = ids === null || queryClient.getQueriesData<any>({ queryKey: ["adapter-last-loads"] })
        .some(([, data]) => data?.orders?.some((order: any) => ids?.has(order.id)));
      if (fallbackAffected) await invalidate("adapter-last-loads");
      if (ids === null) await invalidate("lumper-missing-revised-rc");
      else if (ids?.size) await refreshLumperMissingOrders(queryClient, [...ids], isCurrent);
    });
    if (changes.has("lost_day_notes")) await attempt(["lost_day_notes"], async () => {
      if (lostDayNotesInFlight) await lostDayNotesInFlight;
      const dates = [...lostDayNotesLoadedDates];
      lostDayNotesLoadedDates.clear();
      if (dates.length && !(await fetchMissingLostDayNoteDates(dates, "realtime reconcile"))) {
        dates.forEach(date => lostDayNotesLoadedDates.add(date));
        throw new Error("Home-time reconciliation failed");
      }
      if (!isCurrent()) return;
      bumpLostDayNotesVersion();
    });
    // Frequent machine updates only read their small, displayed field sets.
    if (changes.has("driver_hos") && !changes.has("drivers")) await attempt(["driver_hos"], async () => {
      await queryClient.cancelQueries({ queryKey: ["adapter-drivers"] });
      const data = await fetchReportsReferenceRows("drivers",
        "id, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated");
      if (!isCurrent()) return;
      const byId = new Map((data || []).map(row => [row.id, row]));
      queryClient.setQueriesData({ queryKey: ["adapter-drivers"] }, (old: any[] | undefined) =>
        old?.map(row => ({ ...row, ...byId.get(row.id) })));
    });
    if (changes.has("truck_telemetry") && !changes.has("trucks")) await attempt(["truck_telemetry"], async () => {
      await queryClient.cancelQueries({ queryKey: ["adapter-trucks"] });
      const data = await fetchReportsReferenceRows("truck_telemetry",
        "truck_id, fuel_level, miles_away, eta_minutes, miles_away_updated_at");
      if (!isCurrent()) return;
      const byId = new Map((data || []).map(row => [row.truck_id, row]));
      queryClient.setQueriesData({ queryKey: ["adapter-trucks"] }, (old: any[] | undefined) =>
        old?.map(row => ({ ...row, ...(byId.get(row.id) || {
          fuel_level: null, miles_away: null, eta_minutes: null, miles_away_updated_at: null,
        }) })));
    });
    for (const source of [...changes.keys()]) {
      if (customSources.has(source) || coreSources.includes(source)) continue;
      await attempt([source], async () => {
        for (const key of queryKeys[source] || []) await invalidate(key);
        notifyReportsSource(source);
        // Full reference reads include these machine fields too.
        if (source === "drivers") changes.delete("driver_hos");
        if (source === "trucks") changes.delete("truck_telemetry");
      });
    }
    if (failures.length) throw failures[0];
  }, [queryClient]);
  const liveStatus = useReportsLive(globalEnabled, refreshLive);

  // Local mutations may update shared caches before the DB notification arrives.
  // Ignore lifecycle events and unchanged values, and refresh only the changed dataset.
  useEffect(() => {
    if (!scopeEnabled) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsubscribe = watchReportReferenceChanges(queryClient, kind => {
      if (timers.has(kind)) return;
      timers.set(kind, setTimeout(() => {
        timers.delete(kind);
        void queryClient.invalidateQueries({ queryKey: [`adapter-${kind}`], refetchType: "active" });
      }, 500));
    });
    return () => { unsubscribe(); timers.forEach(clearTimeout); };
  }, [scopeEnabled, queryClient]);

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

  // Track whether we have ever successfully transformed data for stability
  const lastValidDataRef = useRef<any[] | null>(null);
  
  // Track if supporting data is ready (trucks, drivers, etc.)
  const isSupportingDataReady = !!(allTrucks && allDrivers && dispatchers && companies);
  
  // Transform date-window orders into the expected Reports shape
  // KEY FIX: Return previous valid data during loading to prevent flickering
  const transformedData = useMemo(() => {
    console.time('[perf] transformedData');
    if (!USE_DATE_WINDOW_LOADING) { console.timeEnd('[perf] transformedData'); return null; }
    
    // If we have no driver scope yet, return empty (not null)
    if (!dateWindowHook.driverIds || dateWindowHook.driverIds.length === 0) {
      console.timeEnd('[perf] transformedData');
      return dateWindowHook.isLoading ? null : [];
    }
    
    // During initial load with no previous data, return null to show skeleton
    if (dateWindowHook.isLoading && lastValidDataRef.current === null) { console.timeEnd('[perf] transformedData'); return null; }
    
    // If supporting data isn't ready and no previous data, show skeleton
    if (!isSupportingDataReady && lastValidDataRef.current === null) { console.timeEnd('[perf] transformedData'); return null; }
    
    // If orders not ready and no previous data, show skeleton  
    if (!dateWindowHook.orders && lastValidDataRef.current === null) { console.timeEnd('[perf] transformedData'); return null; }
    
    // STABILITY: During initial loading or when supporting data isn't ready, keep previous data
    // NOTE: We intentionally do NOT block on dateWindowHook.isFetching here.
    // On tab switch, isFetching is briefly true (query key changes) but orders are already
    // available in globalAccumulatedOrders. Blocking on isFetching would return stale
    // old-office data, causing a skeleton flash until the no-op query resolves.
    if ((dateWindowHook.isLoading || !isSupportingDataReady) && lastValidDataRef.current !== null) {
      console.timeEnd('[perf] transformedData');
      return lastValidDataRef.current;
    }
    
    // Wait for order_files only on initial load - during navigation keep previous data
    if (windowOrderIds.length > 0 && isOrderFilesLoading && lastValidDataRef.current === null) { console.timeEnd('[perf] transformedData'); return null; }

    // Enrich orders with order_files before processing (inject synthetic files for force-complete)
    const orders = dateWindowHook.orders.map((order) => {
      const files = [...(orderFilesMap.get(order.id) || [])];
      const pickupDrops = order.pickup_drops || [];
      if (order.bol_force_complete) {
        const pickupCount = pickupDrops.filter((pd: any) => pd.type === "pickup").length || 1;
        const existingBolCount = files.filter((f) => f.file_category === "BOL").length;
        for (let i = existingBolCount; i < pickupCount; i++) {
          files.push({ id: `synthetic-bol-${order.id}-${i}`, order_id: order.id, file_category: "BOL", file_name: "force-complete", file_path: "" });
        }
      }
      if (order.pod_force_complete) {
        const deliveryCount = pickupDrops.filter((pd: any) => pd.type === "delivery").length || 1;
        const existingPodCount = files.filter((f) => f.file_category === "POD").length;
        for (let i = existingPodCount; i < deliveryCount; i++) {
          files.push({ id: `synthetic-pod-${order.id}-${i}`, order_id: order.id, file_category: "POD", file_name: "force-complete", file_path: "" });
        }
      }
      return { ...order, order_files: files };
    });
    const driverIds = dateWindowHook.driverIds;

    // Build lookup maps
    const truckMap = new Map(filteredTrucks.map((t: any) => [t.id, t]));
    const driverMap = new Map(filteredDrivers.map((d: any) => [d.id, d]));
    // Global maps for off-duty driver lookups (includes ALL active drivers, not just current scope)
    const allDriverMap = new Map((allDrivers || []).map((d: any) => [d.id, d]));
    const allTruckByDriverId = new Map((allTrucks || []).filter((t: any) => t.driver1_id).map((t: any) => [t.driver1_id, t]));
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));
    const dispatcherMap = new Map(dispatchers.map((d) => [d.user_id, d]));
    // Merge off-duty dispatcher profiles into the map (they may not be in the main dispatchers query)
    if (offDutyDispatchers) {
      for (const d of offDutyDispatchers) {
        if (!dispatcherMap.has(d.user_id)) {
          dispatcherMap.set(d.user_id, d);
        }
      }
    }
    const trailerMap = new Map((trailers || []).map((t) => [t.id, { trailer_number: t.trailer_number, dot_inspection_date: t.dot_inspection_date, plate_expiration_date: t.plate_expiration_date, insurance_expiration_date: t.insurance_expiration_date, vin: t.vin, plate: (t as any).plate, vented: (t as any).vented }]));
    const truckByDriverId = new Map(filteredTrucks.filter((t: any) => t.driver1_id).map((t: any) => [t.driver1_id, t]));
    // Build map selecting the newest note per driver.
    // IMPORTANT: Some drivers have many duplicate truck_notes rows; array order can be arbitrary
    // (especially after realtime patching). Always pick the max(updated_at) record.
    const notesByDriverId = new Map<string, any>();
    for (const n of filteredTruckNotes || []) {
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
    for (const note of filteredLostDayNotes || []) {
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
      // Fallback: yard/unassigned load (driver1_id is null) — attach to the
      // original driver row so it doesn't disappear from Reports while it
      // waits for a recovery driver to be assigned.
      if (!order.driver1_id && !order.driver2_id) {
        if (order.original_driver1_id) {
          const existing = ordersByDriverId.get(order.original_driver1_id) || [];
          if (!existing.includes(order)) {
            existing.push(order);
            ordersByDriverId.set(order.original_driver1_id, existing);
          }
        }
        if (order.original_driver2_id && order.original_driver2_id !== order.original_driver1_id) {
          const existing = ordersByDriverId.get(order.original_driver2_id) || [];
          if (!existing.includes(order)) {
            existing.push(order);
            ordersByDriverId.set(order.original_driver2_id, existing);
          }
        }
      }
      // Add to transfer drivers — only if order is still a recovery load
      if (order.is_recovery) {
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
      } // end if (order.is_recovery)
    }

    // Add last loads for drivers with no orders in the date window
    if (lastLoadsData?.orders) {
      for (const lastOrder of lastLoadsData.orders) {
        // Enrich with order_files + synthetic files for force-complete
        const lastFiles = [...(orderFilesMap.get(lastOrder.id) || [])];
        const lastPD = lastOrder.pickup_drops || [];
        if (lastOrder.bol_force_complete) {
          const pc = lastPD.filter((pd: any) => pd.type === "pickup").length || 1;
          const ec = lastFiles.filter((f) => f.file_category === "BOL").length;
          for (let i = ec; i < pc; i++) lastFiles.push({ id: `synthetic-bol-${lastOrder.id}-${i}`, order_id: lastOrder.id, file_category: "BOL", file_name: "force-complete", file_path: "" });
        }
        if (lastOrder.pod_force_complete) {
          const dc = lastPD.filter((pd: any) => pd.type === "delivery").length || 1;
          const ec = lastFiles.filter((f) => f.file_category === "POD").length;
          for (let i = ec; i < dc; i++) lastFiles.push({ id: `synthetic-pod-${lastOrder.id}-${i}`, order_id: lastOrder.id, file_category: "POD", file_name: "force-complete", file_path: "" });
        }
        const enrichedOrder = {
          ...lastOrder,
          order_files: lastFiles,
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
    for (const truck of filteredTrucks) {
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
          dispatcherCreatedAt: dispatcherInfo.created_at || null,
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

      // Filter canceled orders: only show if pickup is today AND no other non-canceled order with same/later pickup
      const todayStr = new Date().toISOString().slice(0, 10);
      const filteredOrders = sortedOrders.filter((order) => {
        if (!order.canceled) return true;
        const pickupDate = order.pickup_datetime ? order.pickup_datetime.slice(0, 10) : null;
        if (pickupDate !== todayStr) return false;
        const hasOtherOrder = sortedOrders.some(
          (o) => o.id !== order.id && !o.canceled && o.pickup_datetime && o.pickup_datetime.slice(0, 10) >= pickupDate
        );
        if (hasOtherOrder) return false;
        // Also hide if any non-canceled load has a delivery date after this canceled load's pickup date
        const hasLaterDelivery = sortedOrders.some(
          (o) => o.id !== order.id && !o.canceled && o.delivery_datetime && o.delivery_datetime.slice(0, 10) > pickupDate!
        );
        return !hasLaterDelivery;
      });

      // Find current order (most recent with BOL but no POD, or most recent)
      let currentOrder = filteredOrders[0] || null;

      // Build allOrders array with pickup/delivery stops
      const allOrdersWithStops = filteredOrders.map((order) => {
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
        driverHazmat: driver.hazmat || false,
        driverTanker: driver.tanker || false,
        driverTwic: driver.twic || false,
        driverCitizen: driver.citizen !== false,
        driverCriminal: driver.criminal || false,
        driverStraps: driver.straps ?? 2,
        driverLoadBars: driver.load_bars ?? 0,
        truckVin: truck?.vin || null,
        truckPlate: truck?.plate || null,
        truckOos: (truck as any)?.oos ?? false,
        samsaraInsured: (truck as any)?.samsara_insured ?? null,
        samsaraAccount: (truck as any)?.samsara_account ?? null,
        samsaraInsuredUpdatedAt: (truck as any)?.samsara_insured_updated_at ?? null,
        trailerVin: trailerInfo?.vin || null,
        trailerPlate: trailerInfo?.plate || null,
        trailerNumber: trailerInfo?.trailer_number || null,
        trailerVented: (trailerInfo as any)?.vented || false,
        home: homeString,
        homeLatitude: driver.home_latitude ?? null,
        homeLongitude: driver.home_longitude ?? null,
        homeCity: driver.home_city ?? null,
        homeState: driver.home_state ?? null,
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
        doNotTouchHos: driver.do_not_touch_hos || false,
        note: note?.note || "",
        lastEdit: (() => { const d = note?.updated_at ? new Date(note.updated_at) : new Date(); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }); })(),
        editDate: (() => { const d = note?.updated_at ? new Date(note.updated_at) : new Date(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })(),
        allOrders: allOrdersWithStops,
        activeOrders: allOrdersWithStops.filter((o) => o.isActive),
        activeOrdersCount: allOrdersWithStops.filter((o) => o.isActive).length,
        totalOrdersCount: driverOrders.length,
        hasMultipleOrders: driverOrders.length > 1,
        lost_day_notes: driverLostNotes,
        lostDayNotes: driverLostNotes,
        milesAway: truck?.miles_away ?? null,
        fuelLevel: truck?.fuel_level ?? null,
        totalMiles: ([...filteredOrders].reverse().find((o: any) => !o.order_files?.some((f: any) => f.file_category === 'POD'))?.loaded_miles) ?? currentOrder?.loaded_miles ?? 0,
        goingYard: driver.going_yard || false,
        isOffDutyDriver: false,
        // Additional fields for compatibility
        hireDate: driver.hire_date,
        driver1HireDate: driver.hire_date || null,
        driver2HireDate: (driver2 as any)?.hire_date || null,
        driverCreatedAt: driver.created_at || null, // For sorting by driver creation date
        // Maintenance dates (snake_case to match helper functions in helpers.ts)
        oil_change_date: truck?.oil_change_date || null,
        tires_swap_date: truck?.tires_swap_date || null,
        maintenance_check_date: truck?.maintenance_check_date || null,
        // Oil change miles tracking
        last_oil_change_miles: truck?.last_oil_change_miles ?? null,
        truck_miles: truck?.miles ?? null,
        source: truck?.source ?? null,
        // DOT inspection dates (snake_case to match helper functions)
        dot_inspection_date: truck?.dot_inspection_date || null,
        trailer_dot_inspection_date: trailerInfo?.dot_inspection_date || null,
        // Truck alert fields
        plate_expiration_date: truck?.plate_expiration_date || null,
        insurance_expiration_date: truck?.insurance_expiration_date || null,
        // Trailer alert fields
        trailer_plate_expiration_date: trailerInfo?.plate_expiration_date || null,
        trailer_insurance_expiration_date: trailerInfo?.insurance_expiration_date || null,
        // Driver alert fields
        cdl_expiration_date: driver.cdl_expiration_date || null,
        mvr_date: driver.mvr_date || null,
        clearing_house: driver.clearing_house || null,
        medical_card_expiration_date: driver.medical_card_expiration_date || null,
      });
    }

    // Convert to array and filter by office if needed
    let groupedData = Array.from(dispatcherGroups.values());

    if (priorityOffice) {
      groupedData = groupedData.filter((g) => g.office === priorityOffice);
    }

    // Add off-duty dispatcher groups from dispatcher_status table
    if (offDutyStatuses && offDutyStatuses.length > 0) {
      // PASS 1: tag every active-group truck with its original (off-duty) dispatcher
      // name. This must run regardless of priorityOffice so that when the
      // covering dispatcher is in a different office than the off-duty
      // dispatcher, the "Disp: <off-duty name>" annotation still appears.
      for (const offDutyStatus of offDutyStatuses) {
        const inactive = (offDutyStatus.inactive_trucks as any[]) || [];
        if (inactive.length === 0) continue;
        const dispId = offDutyStatus.dispatcher_id;
        if (!dispId) continue;
        const info = dispatcherMap.get(dispId);
        const name = info?.full_name || info?.email || "Unknown";
        for (const driver of inactive) {
          if (!driver?.id) continue;
          for (const group of groupedData) {
            for (const truck of group.trucks) {
              if (truck.driverId === driver.id) {
                truck.originalDispatcherName = name;
              }
            }
          }
        }
      }

      // Build a map of ALL dispatchers (active scope + off-duty) for profile lookups
      const allDispatcherIds = offDutyStatuses.map(s => s.dispatcher_id).filter(Boolean);
      // We may not have profiles for off-duty dispatchers in our `dispatchers` query
      // (since that only fetches dispatchers with active drivers).
      // Use dispatcherMap which was built from the fetched profiles.
      
      for (const offDutyStatus of offDutyStatuses) {
        const inactiveDrivers = (offDutyStatus.inactive_trucks as any[]) || [];
        if (inactiveDrivers.length === 0) continue;

        const offDutyDispatcherId = offDutyStatus.dispatcher_id;
        if (!offDutyDispatcherId) continue;

        // Look up dispatcher profile from the dispatcherMap
        const offDutyDispatcherInfo = dispatcherMap.get(offDutyDispatcherId);
        
        // Skip if this office doesn't match the filter
        if (priorityOffice && offDutyDispatcherInfo?.office !== priorityOffice) continue;

        const offDutyDispatcherName = offDutyDispatcherInfo?.full_name || offDutyDispatcherInfo?.email || "Unknown";

        // Map each off-duty driver to their current active dispatcher name
        const driverToCurrentDispatcher = new Map<string, string>();
        for (const driver of inactiveDrivers) {
          if (driver.id) {
            // Look up real driver to find current dispatcher
            const realDriver = allDriverMap.get(driver.id);
            if (realDriver?.dispatcher_id) {
              const currentDispInfo = dispatcherMap.get(realDriver.dispatcher_id);
              if (currentDispInfo) {
                driverToCurrentDispatcher.set(driver.id, currentDispInfo.full_name || currentDispInfo.email || "Unknown");
              }
            }
          }
        }

        // Build truck-like objects for each off-duty driver
        const offDutyTrucks = inactiveDrivers.map((driver: any) => {
          const realDriver = allDriverMap.get(driver.id);
          const driverOrders = ordersByDriverId.get(driver.id) || [];
          const truck = allTruckByDriverId.get(driver.id);
          const driverCompanyName = realDriver?.company_id ? companyMap.get(realDriver.company_id) || null : null;
          // Off-duty rows get the same notes as regular rows (truck note + lost/empty day notes)
          const offDutyNote = notesByDriverId.get(driver.id);
          const offDutyLostNotes = lostNotesByDriverId.get(driver.id) || [];

          // Build home string
          const homeCity = realDriver?.home_city;
          const homeState = realDriver?.home_state;
          const homeString = homeCity && homeState
            ? `${homeCity}, ${homeState}`
            : homeCity || homeState || "—";

          // HOS data
          const driveMinutes = realDriver?.hos_drive_minutes || 0;
          const shiftMinutes = realDriver?.hos_shift_minutes || 0;
          const breakMinutes = realDriver?.hos_break_minutes || 0;
          const cycleMinutes = realDriver?.hos_cycle_minutes || 0;
          const formatHosTime = (minutes: number) =>
            `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}h`;

          // Filter canceled orders: only show if pickup is today AND no other non-canceled order with same/later pickup
          const offDutyTodayStr = new Date().toISOString().slice(0, 10);
          const allOrdersWithStops = driverOrders
            .filter((order: any) => {
              if (!order.canceled) return true;
              const pickupDate = order.pickup_datetime ? order.pickup_datetime.slice(0, 10) : null;
              if (pickupDate !== offDutyTodayStr) return false;
              const hasOtherOrder = driverOrders.some(
                (o: any) => o.id !== order.id && !o.canceled && o.pickup_datetime && o.pickup_datetime.slice(0, 10) >= pickupDate
              );
              if (hasOtherOrder) return false;
              const hasLaterDelivery = driverOrders.some(
                (o: any) => o.id !== order.id && !o.canceled && o.delivery_datetime && o.delivery_datetime.slice(0, 10) > pickupDate!
              );
              return !hasLaterDelivery;
            })
            .map((order: any) => {
              const orderPickupDrops = order.pickup_drops || [];
              const pickupStops = orderPickupDrops.filter((pd: any) => pd.type === "pickup")
                .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));
              const deliveryStops = orderPickupDrops.filter((pd: any) => pd.type === "delivery" || pd.type === "drop")
                .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));
              const pickupStop = pickupStops[0] || null;
              const deliveryStop = deliveryStops[deliveryStops.length - 1] || null;
              // Inject synthetic files for force_complete
              const orderFilesList = [...(orderFilesMap.get(order.id) || [])];
              if (order.bol_force_complete) {
                const pCount = pickupStops.length;
                const eBol = orderFilesList.filter((f: any) => f.file_category === 'BOL').length;
                for (let i = eBol; i < pCount; i++) orderFilesList.push({ id: `synthetic-bol-${i}`, file_category: 'BOL', file_name: 'force-complete', file_path: '' });
              }
              if (order.pod_force_complete) {
                const dCount = deliveryStops.length;
                const ePod = orderFilesList.filter((f: any) => f.file_category === 'POD').length;
                for (let i = ePod; i < dCount; i++) orderFilesList.push({ id: `synthetic-pod-${i}`, file_category: 'POD', file_name: 'force-complete', file_path: '' });
              }
              const hasPOD = orderFilesList.some((f: any) => f.file_category === 'POD');
              const hasBOL = orderFilesList.some((f: any) => f.file_category === 'BOL');

              const transferInfo = getTransferAwareStops(driver.id, order, pickupStop, deliveryStop);

              return {
                id: order.id,
                order,
                status: order.status,
                canceled: order.canceled,
                notes: order.notes,
                pickup_datetime: order.pickup_datetime,
                pickup_end_datetime: order.pickup_end_datetime,
                delivery_datetime: order.delivery_datetime,
                delivery_end_datetime: order.delivery_end_datetime,
                updated_at: order.updated_at,
                loaded_miles: order.loaded_miles,
                order_files: orderFilesList,
                bol_force_complete: order.bol_force_complete || false,
                pod_force_complete: order.pod_force_complete || false,
                pickupStop: transferInfo.effectivePickupStop || pickupStop,
                deliveryStop: transferInfo.effectiveDeliveryStop || deliveryStop,
                pickupStops,
                deliveryStops,
                isActive: !hasPOD && (order.status === 'pending' || order.status === 'in_transit'),
                isRecentCompleted: hasPOD || order.status === 'delivered',
                documentStatus: hasPOD ? 'complete' : hasBOL ? 'partial' : 'missing',
                documentColors: { pod: hasPOD, bol: hasBOL },
                transferLabel: transferInfo.segmentLabel || null,
                transferPickupInfo: (transferInfo as any).transferPickupInfo,
                transferDeliveryInfo: (transferInfo as any).transferDeliveryInfo,
                isTransferDriver: transferInfo.isTransferDriver,
                loadDetails: {
                  loadNumber: order.internal_load_number || "—",
                  brokerLoadNumber: order.broker_load_number || "—",
                  companyName: driverCompanyName,
                  pickupInfo: pickupStop ? { address: pickupStop.address || "—", city: pickupStop.city || "—", state: pickupStop.state || "—", zipCode: pickupStop.zip_code || "", datetime: pickupStop.datetime || order.pickup_datetime || "—", endDatetime: order.pickup_end_datetime || "—" } : null,
                  deliveryInfo: deliveryStop ? { address: deliveryStop.address || "—", city: deliveryStop.city || "—", state: deliveryStop.state || "—", zipCode: deliveryStop.zip_code || "", datetime: deliveryStop.datetime || order.delivery_datetime || "—", endDatetime: order.delivery_end_datetime || "—" } : null,
                  allPickupStops: pickupStops.map((stop: any) => ({ address: stop.address || "—", city: stop.city || "—", state: stop.state || "—", zipCode: stop.zip_code || "", datetime: stop.datetime || order.pickup_datetime || "—", endDatetime: order.pickup_end_datetime || "—" })),
                  allDeliveryStops: deliveryStops.map((stop: any) => ({ address: stop.address || "—", city: stop.city || "—", state: stop.state || "—", zipCode: stop.zip_code || "", datetime: stop.datetime || order.delivery_datetime || "—", endDatetime: order.delivery_end_datetime || "—" })),
                  documents: orderFilesList.map((file: any) => ({ category: file.file_category })),
                  notes: order.notes || "—",
                },
              };
            });

          // Determine current order
          const sortedOrders = allOrdersWithStops
            .filter((o) => !o.canceled && o.notes !== "GAME|OVER")
            .sort((a, b) => {
              const aPickup = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : Infinity;
              const bPickup = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : Infinity;
              return aPickup - bPickup;
            });

          let currentOrder = sortedOrders.length > 0 ? sortedOrders[sortedOrders.length - 1] : null;

          // Determine status
          let truckStatus = "Available";
          if (currentOrder) {
            switch (currentOrder.status) {
              case "pending": truckStatus = "Loading"; break;
              case "in_transit": truckStatus = "In Transit"; break;
              default: truckStatus = "Available";
            }
          }

          const trailerInfo = truck?.trailer_id ? trailerMap.get(truck.trailer_id) : null;

          return {
            id: truck?.id || `driver-${driver.id}`,
            orderId: currentOrder?.id || null,
            truckNumber: truck?.truck_number || driver.truck?.truck_number || null,
            companyName: driverCompanyName,
            driver: driver.name || realDriver?.name || "Unknown",
            driver1Name: driver.name || realDriver?.name || "Unknown",
            driverId: driver.id,
            driverPhone: realDriver?.phone || driver.phone || null,
            driverEmail: realDriver?.email || driver.email || null,
            driverCreatedAt: realDriver?.created_at || null,
            hireDate: (realDriver as any)?.hire_date || (driver as any)?.hire_date || null,
            driver1HireDate: (realDriver as any)?.hire_date || (driver as any)?.hire_date || null,
            driver2HireDate: null,
            driver2Id: null,
            driver2Name: null,
            driver2Phone: null,
            driver2Email: null,
            truckVin: truck?.vin || null,
            truckPlate: truck?.plate || null,
            truckOos: (truck as any)?.oos ?? false,
            samsaraInsured: (truck as any)?.samsara_insured ?? null,
            samsaraAccount: (truck as any)?.samsara_account ?? null,
            samsaraInsuredUpdatedAt: (truck as any)?.samsara_insured_updated_at ?? null,
            trailerVin: trailerInfo?.vin || null,
            trailerPlate: trailerInfo?.plate || null,
            trailerNumber: trailerInfo?.trailer_number || null,
            trailerVented: (trailerInfo as any)?.vented || false,
            home: homeString,
            homeLatitude: realDriver?.home_latitude ?? null,
            homeLongitude: realDriver?.home_longitude ?? null,
            homeCity: realDriver?.home_city ?? null,
            homeState: realDriver?.home_state ?? null,
            dispatcher: offDutyDispatcherName,
            dispatcherId: `off-duty-${offDutyDispatcherId}`,
            currentDispatcherName: driverToCurrentDispatcher.get(driver.id) || null,
            status: truckStatus,
            pickup: formatStopInfo(currentOrder?.pickupStop, currentOrder?.pickup_datetime),
            delivery: formatStopInfo(currentOrder?.deliveryStop, currentOrder?.delivery_datetime),
            awayDays: currentOrder ? Math.floor((Date.now() - new Date(currentOrder.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
            driveHours: formatHosTime(driveMinutes),
            shiftHours: formatHosTime(shiftMinutes),
            cycleHours: formatHosTime(cycleMinutes),
            driveMinutes,
            shiftMinutes,
            breakMinutes,
            cycleMinutes,
            hosStatus: realDriver?.hos_status || null,
            hosLastUpdated: realDriver?.hos_last_updated || null,
            twoWeekBlockDate: null,
            randomDrugTestDate: null,
            doNotTouchHos: realDriver?.do_not_touch_hos || false,
            note: offDutyNote?.note || "",
            lastEdit: (() => { const d = offDutyNote?.updated_at ? new Date(offDutyNote.updated_at) : new Date(); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }); })(),
            editDate: (() => { const d = offDutyNote?.updated_at ? new Date(offDutyNote.updated_at) : new Date(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })(),
            allOrders: allOrdersWithStops,
            activeOrders: allOrdersWithStops.filter(o => o.isActive),
            activeOrdersCount: allOrdersWithStops.filter(o => o.isActive).length,
            totalOrdersCount: driverOrders.length || 0,
            hasMultipleOrders: (driverOrders.length || 0) > 1,
            lost_day_notes: offDutyLostNotes,
            lostDayNotes: offDutyLostNotes,
            milesAway: truck?.miles_away ?? null,
            totalMiles: (sortedOrders.find((o: any) => !o.order_files?.some((f: any) => f.file_category === 'POD'))?.loaded_miles) ?? currentOrder?.loaded_miles ?? 0,
            goingYard: false,
            isOffDutyDriver: true,
            dot_inspection_date: truck?.dot_inspection_date || null,
            trailer_dot_inspection_date: trailerInfo?.dot_inspection_date || null,
            plate_expiration_date: truck?.plate_expiration_date || null,
            insurance_expiration_date: truck?.insurance_expiration_date || null,
            trailer_plate_expiration_date: trailerInfo?.plate_expiration_date || null,
            trailer_insurance_expiration_date: trailerInfo?.insurance_expiration_date || null,
            cdl_expiration_date: null,
            mvr_date: null,
            clearing_house: null,
            medical_card_expiration_date: null,
          };
        });

        if (offDutyTrucks.length > 0) {
          groupedData.push({
            dispatcher: offDutyDispatcherName,
            dispatcherId: `off-duty-${offDutyDispatcherId}`,
            office: offDutyDispatcherInfo?.office || null,
            ext: offDutyDispatcherInfo?.ext || null,
            createdAt: offDutyDispatcherInfo?.created_at || null,
            dispatcherCreatedAt: offDutyDispatcherInfo?.created_at || null,
            trucks: offDutyTrucks,
            isOffDuty: true,
            originalDispatcherName: offDutyDispatcherName,
          });
        }
      }
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

    // Store as last valid data for stability during future loading states
    lastValidDataRef.current = groupedData;
    
    console.timeEnd('[perf] transformedData');
    return groupedData;
  }, [
    dateWindowHook.orders,
    dateWindowHook.driverIds,
    dateWindowHook.isLoading,
    dateWindowHook.isFetching,
    filteredTrucks,
    allTrucks,
    trailers,
    filteredDrivers,
    allDrivers,
    dispatchers,
    companies,
    filteredTruckNotes,
    filteredLostDayNotes,
    orderFilesMap,
    priorityOffice,
    dispatcherId,
    isOrderFilesLoading,
    lastLoadsData,
    offDutyStatuses,
    offDutyDispatchers,
  ]);

  // Individual mode filtering already applied at database level in useReportsDateWindow
  // This secondary filter is kept as a safety net but should be no-op when DB filtering works
  const filteredData = useMemo(() => {
    // CRITICAL: Early return when Individual mode is OFF - zero overhead
    if (!individualMode || !transformedData) {
      return transformedData;
    }

    // Override mode (e.g. afterhours): scope is an explicit driver-id list.
    // Filter trucks within each group, drop empty groups.
    if (individualOverrideDriverIds) {
      const allowed = new Set(individualOverrideDriverIds);
      return transformedData
        .map((group: any) => ({
          ...group,
          trucks: (group.trucks || []).filter((t: any) => allowed.has(t.driverId)),
        }))
        .filter((group: any) => (group.trucks?.length ?? 0) > 0);
    }

    // Individual mode: filter to show only user's own drivers (safety net)
    // Also include groups where the user booked at least one of the truck's orders
    // (e.g. recovery loads booked by user but now assigned to another dispatcher's driver).
    return transformedData.filter((group: any) => {
      if (group.dispatcherId === currentUserDispatcherId) return true;
      if (!userFullName) return false;
      const trucks = group.trucks || [];
      for (const t of trucks) {
        const orders = t?.orders || [];
        for (const o of orders) {
          if (o?.bookedBy === userFullName || o?.booked_by === userFullName) return true;
        }
      }
      return false;
    });
  }, [individualMode, transformedData, currentUserDispatcherId, individualOverrideDriverIds, userFullName]);

  if (!USE_DATE_WINDOW_LOADING) {
    return { ...legacyReportsHook, liveStatus };
  }

  // Determine if we're in a true loading state (no data to show yet)
  // Once we have valid data, we should NOT show loading - use background indicator instead
  const hasValidData = lastValidDataRef.current !== null && lastValidDataRef.current.length > 0;
  const isInitialLoad = !hasValidData && (dateWindowHook.isLoading || !isSupportingDataReady);
  const isLoadingOrderFiles = !hasValidData && windowOrderIds.length > 0 && isOrderFilesLoading;

  return {
    liveStatus,
    // Data from date-window with transformation (filtered when individual mode is ON)
    data: filteredData,
    // Only show loading skeleton on initial load when we have NO data to display
    // Once data exists, keep showing it (background fetching handled separately)
    isLoading: isViewingOtherOfficeInIndividualMode 
      ? false 
      : (isInitialLoad || isLoadingOrderFiles),
    isPending: isViewingOtherOfficeInIndividualMode ? false : isInitialLoad,
    isError: !!dateWindowHook.error,
    error: dateWindowHook.error,
    isSuccess: isViewingOtherOfficeInIndividualMode ? true : (!dateWindowHook.isLoading && !dateWindowHook.error),
    // Use isFetching for background loading indicator (fetching new date window without blocking UI)
    // Show when we have data but are loading more (date navigation)
    isFetchingBackground: hasValidData && (dateWindowHook.isFetching || isOrderFilesLoading),
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
