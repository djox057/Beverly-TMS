/**
 * useReportsDateWindowAdapter - Adapter layer for useReportsDateWindow
 *
 * This adapter transforms the output of useReportsDateWindow to match
 * the expected shape of the existing useReports hook, ensuring UI compatibility.
 *
 * It also re-exports mutations from useReports.ts to maintain full functionality.
 */

import { useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useReportsDateWindow, useOrderFilesOnDemand } from "./useReportsDateWindow";
import { useReports } from "./useReports";
import { parseSimpleDateTime } from "@/utils/dateUtils";

// Feature flag - set to true to use date-window based loading
export const USE_DATE_WINDOW_LOADING = true;

interface UseReportsDateWindowAdapterOptions {
  priorityOffice?: string | null;
  dispatcherId: string | null;
  dispatcherProfileId?: string | null;
  selectedDate: Date;
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
  const { priorityOffice, dispatcherId, dispatcherProfileId, selectedDate } = options;
  const queryClient = useQueryClient();

  // Get date-window data (disabled when feature flag is OFF)
  const dateWindowHook = useReportsDateWindow({
    dispatcherId: USE_DATE_WINDOW_LOADING ? dispatcherId : null,
    dispatcherProfileId,
    selectedDate,
    priorityOffice,
  });

  // Legacy hook (for fallback when feature flag is OFF). When feature flag is ON,
  // we still call this hook, but in mutation-only mode (disableFetch=true).
  const legacyReportsHook = useReports({ priorityOffice, disableFetch: USE_DATE_WINDOW_LOADING });

  // Fetch additional data needed for transformation
  const driverIdsForScope = dateWindowHook.driverIds || [];
  const scopeEnabled = USE_DATE_WINDOW_LOADING && !!dispatcherId && driverIdsForScope.length > 0;

  const { data: trucks } = useQuery({
    queryKey: ["adapter-trucks"],
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

  const { data: drivers } = useQuery({
    queryKey: ["adapter-drivers"],
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

  const { data: dispatchers } = useQuery({
    queryKey: ["adapter-dispatchers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, office, ext")
        .eq("user_id", dispatcherId);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
    enabled: USE_DATE_WINDOW_LOADING && !!dispatcherId,
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
    queryKey: ["adapter-truck-notes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("truck_notes").select("*").in("driver_id", driverIdsForScope);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: scopeEnabled,
  });

  const { data: lostDayNotes } = useQuery({
    queryKey: ["adapter-lost-day-notes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lost_day_notes").select("*").in("driver_id", driverIdsForScope);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: scopeEnabled,
  });

  // Transform date-window orders into the expected Reports shape
  const transformedData = useMemo(() => {
    if (!USE_DATE_WINDOW_LOADING) return null;
    if (dateWindowHook.isLoading) return null;
    if (!dateWindowHook.driverIds || dateWindowHook.driverIds.length === 0) return [];
    if (!dateWindowHook.orders) return [];
    if (!trucks || !drivers || !dispatchers || !companies) return null;

    const orders = dateWindowHook.orders;
    const driverIds = dateWindowHook.driverIds;

    // Build lookup maps
    const truckMap = new Map(trucks.map((t) => [t.id, t]));
    const driverMap = new Map(drivers.map((d) => [d.id, d]));
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));
    const dispatcherMap = new Map(dispatchers.map((d) => [d.user_id, d]));
    const truckByDriverId = new Map(trucks.filter((t) => t.driver1_id).map((t) => [t.driver1_id, t]));
    const notesByDriverId = new Map((truckNotes || []).map((n) => [n.driver_id, n]));
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

    for (const driverId of driverIds) {
      const driver = driverMap.get(driverId);
      if (!driver) continue;

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

      group.trucks.push({
        id: truck?.id || `driver-${driverId}`,
        orderId: currentOrder?.id || null,
        truckNumber: truck?.truck_number || null,
        companyName,
        driver: driver.name,
        driver1Name: driver.name,
        driverId: driver.id,
        driverPhone: driver.phone || null,
        driverEmail: driver.email || null,
        driver2Id: null,
        driver2Name: null,
        driver2Phone: null,
        driver2Email: null,
        trailerNumber: truck?.trailer_id || null,
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
        oilChangeDate: truck?.oil_change_date,
        maintenanceCheckDate: truck?.maintenance_check_date,
        dotInspectionDate: truck?.dot_inspection_date,
      });
    }

    // Convert to array and filter by office if needed
    let groupedData = Array.from(dispatcherGroups.values());

    if (priorityOffice) {
      groupedData = groupedData.filter((g) => g.office === priorityOffice);
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
    priorityOffice,
  ]);

  if (!USE_DATE_WINDOW_LOADING) {
    return legacyReportsHook;
  }

  return {
    // Data from date-window with transformation
    data: transformedData,
    isLoading: dateWindowHook.isLoading,
    isPending: dateWindowHook.isLoading,
    isError: !!dateWindowHook.error,
    error: dateWindowHook.error,
    isSuccess: !dateWindowHook.isLoading && !dateWindowHook.error,
    isFetchingBackground: false,
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
