import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T,>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Query timeout - please check your connection")), timeoutMs),
  );
  return Promise.race([queryFn(), timeoutPromise]);
};
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { enrichOrdersWithRelations } from "@/utils/ordersFlatBatchFetch";

// Helper to compute transfer-aware pickup/delivery for a driver's segment
interface TransferSegmentInfo {
  effectivePickupStop: any | null;
  effectiveDeliveryStop: any | null;
  isTransferDriver: boolean;
  driverSequenceNumber: number;
  segmentLabel: string; // "Orig", "Rec 1", "Rec 2", etc.
  transferPickupInfo?: {
    city: string;
    state: string;
    address?: string;
    datetime?: string;
  };
  transferDeliveryInfo?: {
    city: string;
    state: string;
    address?: string;
    datetime?: string;
  };
}

/**
 * Computes the effective pickup and delivery stops for a driver based on transfers.
 * - Original driver (seq 0): pickup = original first pickup, delivery = transfer 1 location OR original last delivery
 * - Transfer driver N (seq N): pickup = transfer N location, delivery = transfer N+1 location OR original last delivery
 */
const getTransferAwareStops = (
  driverId: string,
  order: any,
  originalPickupStop: any,
  originalDeliveryStop: any
): TransferSegmentInfo => {
  const transfers = order.order_transfers || [];
  
  // Default: no transfers, use original stops
  if (transfers.length === 0) {
    return {
      effectivePickupStop: originalPickupStop,
      effectiveDeliveryStop: originalDeliveryStop,
      isTransferDriver: false,
      driverSequenceNumber: 0,
      segmentLabel: "",
    };
  }

  // Sort transfers by sequence_number
  const sortedTransfers = [...transfers].sort((a: any, b: any) => 
    (a.sequence_number || 0) - (b.sequence_number || 0)
  );

  // Find if this driver is the original driver or a transfer driver
  const isOriginalDriver = order.original_driver1_id === driverId || 
    (order.driver1_id === driverId && !sortedTransfers.some((t: any) => t.driver1_id === driverId || t.driver2_id === driverId));
  
  // Find transfer record where this driver is the transfer driver
  const driverTransfer = sortedTransfers.find((t: any) => 
    t.driver1_id === driverId || t.driver2_id === driverId
  );

  if (!driverTransfer && !isOriginalDriver) {
    // Driver not found in transfers and not original - fallback to original stops
    return {
      effectivePickupStop: originalPickupStop,
      effectiveDeliveryStop: originalDeliveryStop,
      isTransferDriver: false,
      driverSequenceNumber: 0,
      segmentLabel: "",
    };
  }

  // Original driver case - check if driver matches original_driver1_id or original_driver2_id
  // They may also have a transfer record at seq 0, but should still use original pickup
  const isActualOriginalDriver = order.original_driver1_id === driverId || order.original_driver2_id === driverId;
  
  if (isActualOriginalDriver) {
    // Original driver's delivery is their own transfer location (seq 0) if it exists
    const originalDriverTransfer = sortedTransfers.find((t: any) => 
      (t.driver1_id === driverId || t.driver2_id === driverId) && 
      (t.sequence_number === 0 || t.sequence_number === undefined || t.sequence_number === null)
    );
    
    // If original driver has their own transfer record with location data, use it for delivery
    if (originalDriverTransfer?.transfer_city) {
      return {
        effectivePickupStop: originalPickupStop,
        effectiveDeliveryStop: null, // Will use transferDeliveryInfo instead
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
    
    // Otherwise check if there's a first transfer (for legacy data)
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

  // Transfer driver case
  if (driverTransfer) {
    const seqNum = driverTransfer.sequence_number || 1;
    
    // Find the PREVIOUS transfer (where this driver picked up the load)
    // Transfer driver N's pickup is transfer N-1's handoff location (seq 0's transfer location for seq 1 driver)
    const previousTransfer = sortedTransfers.find((t: any) => 
      (t.sequence_number || 0) === seqNum - 1
    );
    
    // Find the next transfer (where this driver hands off, if any)
    const nextTransfer = sortedTransfers.find((t: any) => 
      (t.sequence_number || 0) > seqNum
    );

    // This driver's pickup is the PREVIOUS transfer's handoff location when available.
    // Fallback for legacy data (no seq 0): use this driver's own transfer location.
    const pickupSource =
      (previousTransfer?.transfer_city || previousTransfer?.transfer_state)
        ? previousTransfer
        : (driverTransfer.transfer_city || driverTransfer.transfer_state)
          ? driverTransfer
          : undefined;

    const pickupInfo = pickupSource ? {
      city: pickupSource.transfer_city,
      state: pickupSource.transfer_state || "",
      address: pickupSource.transfer_address,
      // Use transfer driver's own datetime (when they picked up), not the previous driver's handoff time
      datetime: driverTransfer.transfer_datetime || pickupSource.transfer_datetime,
    } : undefined;

    // This driver's delivery is either the next transfer location or original delivery
    const deliveryInfo = (nextTransfer?.transfer_city || nextTransfer?.transfer_state) ? {
      city: nextTransfer.transfer_city,
      state: nextTransfer.transfer_state || "",
      address: nextTransfer.transfer_address,
      datetime: nextTransfer.transfer_datetime,
    } : undefined;

    // If no transfer location data exists, fall back to original stops
    // This ensures pickup/delivery still displays even when transfer details aren't filled in
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

  // Fallback
  return {
    effectivePickupStop: originalPickupStop,
    effectiveDeliveryStop: originalDeliveryStop,
    isTransferDriver: false,
    driverSequenceNumber: 0,
    segmentLabel: "",
  };
};

interface UseReportsOptions {
  priorityOffice?: string | null;
  /**
   * When true, disables all React Query fetches but still returns mutations.
   * Used by useReportsDateWindowAdapter to get mutations without triggering 
   * legacy data loading when USE_DATE_WINDOW_LOADING is enabled.
   */
  disableFetch?: boolean;
}

export const useReports = (options?: UseReportsOptions) => {
  const queryClient = useQueryClient();
  const priorityOffice = options?.priorityOffice;
  const disableFetch = options?.disableFetch ?? false;


  const updateTruckStatus = useMutation({
    mutationFn: async ({ truckId, status }: { truckId: string; status: string }) => {
      const { error } = await supabase.from("trucks").update({ status }).eq("id", truckId);
      if (error) throw error;
    },
    onMutate: async ({ truckId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["reports"] });
      const previousData = queryClient.getQueryData(["reports"]);
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) =>
            truck.id === truckId ? { ...truck, status } : truck
          ),
        }));
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });

  const updateTruckMilesAway = useMutation({
    mutationFn: async ({ truckId, milesAway }: { truckId: string; milesAway: number }) => {
      const { error } = await supabase.from("trucks").update({ miles_away: milesAway }).eq("id", truckId);
      if (error) throw error;
    },
    onMutate: async ({ truckId, milesAway }) => {
      await queryClient.cancelQueries({ queryKey: ["reports"] });
      const previousData = queryClient.getQueryData(["reports"]);
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) =>
            truck.id === truckId ? { ...truck, milesAway } : truck
          ),
        }));
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });

  const updateTruckNote = useMutation({
    mutationFn: async ({ truckId, note, driverId }: { truckId: string; note: string; driverId?: string }) => {
      // Check if this is a "fake" truckId for unassigned drivers (prefixed with "driver-")
      const isUnassignedDriver = truckId.startsWith('driver-');
      const actualTruckId = isUnassignedDriver ? null : truckId;
      
      // For unassigned drivers, extract driverId from the prefixed truckId
      if (isUnassignedDriver && !driverId) {
        driverId = truckId.replace('driver-', '');
      }
      
      // Get truck to find driver if not provided and we have a real truck
      if (!driverId && actualTruckId) {
        const { data: truck, error: truckError } = await supabase
          .from("trucks")
          .select("driver1_id")
          .eq("id", actualTruckId)
          .maybeSingle();

        if (truckError) throw truckError;
        driverId = truck?.driver1_id;
      }

      if (!driverId) {
        throw new Error("Cannot save note: no driver assigned");
      }

      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Not authenticated");

      // Client-side timestamp (DB has no guarantee of updated_at triggers)
      const nowIso = new Date().toISOString();

      // Upsert directly - unique constraint on driver_id handles conflicts

      // Upsert with onConflict on driver_id (unique constraint)
      const { error } = await supabase
        .from("truck_notes")
        .upsert({
          truck_id: actualTruckId,
          driver_id: driverId,
          note: note.trim(),
          updated_by: user.id,
          updated_at: nowIso,
        }, {
          onConflict: "driver_id",
        });

      if (error) throw error;
    },
    onMutate: async ({ truckId, note, driverId }) => {
      // Cancel any outgoing refetches for all relevant query keys
      await queryClient.cancelQueries({ queryKey: ["reports", "priority"] });
      await queryClient.cancelQueries({ queryKey: ["reports", "full"] });
      await queryClient.cancelQueries({ queryKey: ["adapter-truck-notes"] });

      // Snapshot previous values for all queries
      const previousPriority = queryClient.getQueriesData({ queryKey: ["reports", "priority"] });
      const previousFull = queryClient.getQueryData(["reports", "full"]);
      const previousAdapterNotes = queryClient.getQueriesData({ queryKey: ["adapter-truck-notes"] });

      const now = new Date();
      const lastEdit = now.toLocaleTimeString();
      const editDate = now.toLocaleDateString();
      const nowIso = now.toISOString();

      // Determine the actual driverId for adapter cache update
      const isUnassignedDriver = truckId.startsWith('driver-');
      const effectiveDriverId = driverId || (isUnassignedDriver ? truckId.replace('driver-', '') : undefined);
      const actualTruckId = isUnassignedDriver ? null : truckId;

      // Helper to update note in legacy data structure
      const updateNoteInData = (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => {
            // Match by truckId directly, or for unassigned drivers match the fake truckId
            if (truck.id === truckId) {
              return { ...truck, note: note.trim(), lastEdit, editDate };
            }
            return truck;
          }),
        }));
      };

      // Optimistically update legacy query caches immediately
      queryClient.setQueriesData({ queryKey: ["reports", "priority"] }, updateNoteInData);
      queryClient.setQueryData(["reports", "full"], updateNoteInData);

      // Optimistically update adapter truck notes cache
      // Use predicate to match ALL office-scoped keys: ["adapter-truck-notes", <any office>]
      if (effectiveDriverId) {
        queryClient.setQueriesData<any[]>(
          { 
            predicate: (query) => {
              const key = query.queryKey;
              return Array.isArray(key) && key[0] === "adapter-truck-notes";
            }
          },
          (oldNotes) => {
            if (!oldNotes || !Array.isArray(oldNotes)) return oldNotes;
            // Some drivers have duplicate rows in truck_notes; update ALL rows for this driver
            // so the UI cannot "snap back" to an older duplicate.
            const hasAny = oldNotes.some((n) => n?.driver_id === effectiveDriverId);
            if (hasAny) {
              return oldNotes.map((n) =>
                n?.driver_id === effectiveDriverId
                  ? {
                      ...n,
                      note: note.trim(),
                      updated_at: nowIso,
                    }
                  : n,
              );
            }
            // No existing note for this driver - append new entry
            return [...oldNotes, {
              id: `temp-${effectiveDriverId}`,
              driver_id: effectiveDriverId,
              truck_id: actualTruckId,
              note: note.trim(),
              updated_at: nowIso,
            }];
          }
        );
      } else {
        // effectiveDriverId is missing - log error and skip optimistic update
        console.error("[updateTruckNote] Cannot optimistically update: missing effectiveDriverId", { truckId, driverId });
      }

      return { previousPriority, previousFull, previousAdapterNotes };
    },
    onError: (err, variables, context) => {
      // Rollback all caches on error
      if (context?.previousPriority) {
        context.previousPriority.forEach(([queryKey, data]: [any, any]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousFull) {
        queryClient.setQueryData(["reports", "full"], context.previousFull);
      }
      if (context?.previousAdapterNotes) {
        context.previousAdapterNotes.forEach(([queryKey, data]: [any, any]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
  });

  const updatePickupDrop = useMutation({
    mutationFn: async ({
      pickupDropId,
      address,
      datetime,
    }: {
      pickupDropId: string;
      address?: string;
      datetime?: string;
    }) => {
      const updateData: any = {};
      if (address !== undefined) updateData.address = address;
      if (datetime !== undefined) updateData.datetime = datetime;

      const { error } = await supabase.from("pickup_drops").update(updateData).eq("id", pickupDropId);
      if (error) throw error;
    },
    onMutate: async ({ pickupDropId, address, datetime }) => {
      await queryClient.cancelQueries({ queryKey: ["reports"] });
      const previousData = queryClient.getQueryData(["reports"]);
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => ({
            ...truck,
            allOrders: truck.allOrders?.map((order: any) => ({
              ...order,
              pickupStops: order.pickupStops?.map((stop: any) =>
                stop.id === pickupDropId
                  ? { ...stop, ...(address !== undefined && { address }), ...(datetime !== undefined && { datetime }) }
                  : stop
              ),
              deliveryStops: order.deliveryStops?.map((stop: any) =>
                stop.id === pickupDropId
                  ? { ...stop, ...(address !== undefined && { address }), ...(datetime !== undefined && { datetime }) }
                  : stop
              ),
            })),
          })),
        }));
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });

  const updateLostDayNote = useMutation({
    mutationFn: async ({
      driverId,
      date,
      note,
      noteType,
    }: {
      driverId: string;
      date: string;
      note: string | null;
      noteType?: string | null;
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;

      const upsertData = {
        driver_id: driverId,
        date: date,
        note: note,
        note_type: noteType,
        updated_by: userId,
      };

      const { data, error: upsertError } = await supabase
        .from("lost_day_notes")
        .upsert(upsertData, {
          onConflict: "driver_id,date",
        })
        .select();

      if (upsertError) {
        throw upsertError;
      }
    },
    onMutate: async ({ driverId, date, note, noteType }) => {
      // Cancel any outgoing refetches for relevant query keys
      await queryClient.cancelQueries({ queryKey: ["reports", "priority"] });
      await queryClient.cancelQueries({ queryKey: ["reports", "full"] });
      await queryClient.cancelQueries({ queryKey: ["adapter-lost-day-notes"] });

      // Snapshot previous values for both legacy queries and the adapter query
      const previousPriority = queryClient.getQueriesData({ queryKey: ["reports", "priority"] });
      const previousFull = queryClient.getQueryData(["reports", "full"]);
      const previousAdapterNotes = queryClient.getQueriesData({ queryKey: ["adapter-lost-day-notes"] });

      const now = new Date();
      const nowIso = now.toISOString();
      const lastEdit = now.toLocaleTimeString();
      const editDate = now.toLocaleDateString();

      // New note object for cache patch
      const newNote = { date, note, note_type: noteType, driver_id: driverId, updated_at: nowIso };

      // Helper to update lost day note in legacy reports data structure
      const updateNoteInData = (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => {
            if (truck.driverId !== driverId) return truck;
            // Update lost day notes for this truck/driver (use lost_day_notes to match data structure)
            const existingNotes = truck.lost_day_notes || [];
            const noteIndex = existingNotes.findIndex((n: any) => n.date === date);
            const updatedNotes = noteIndex >= 0
              ? existingNotes.map((n: any, i: number) => i === noteIndex ? newNote : n)
              : [...existingNotes, newNote];
            // Update lastEdit and editDate to show the new timestamp
            return { 
              ...truck, 
              lost_day_notes: updatedNotes,
              lostDayNotes: updatedNotes,
              lastEdit,
              editDate,
            };
          }),
        }));
      };

      // Optimistically update legacy query caches
      queryClient.setQueriesData({ queryKey: ["reports", "priority"] }, updateNoteInData);
      queryClient.setQueryData(["reports", "full"], updateNoteInData);

      // Optimistically update adapter-lost-day-notes (flat array) so useMemo re-computes immediately
      queryClient.setQueriesData(
        { queryKey: ["adapter-lost-day-notes"], exact: false },
        (oldData: any[] | undefined) => {
          if (!oldData) return oldData;
          const existingIndex = oldData.findIndex(
            (n) => n.driver_id === driverId && n.date === date
          );
          if (existingIndex >= 0) {
            const updated = [...oldData];
            updated[existingIndex] = { ...updated[existingIndex], ...newNote };
            return updated;
          }
          return [...oldData, newNote];
        }
      );

      return { previousPriority, previousFull, previousAdapterNotes };
    },
    onError: (err, variables, context) => {
      // Rollback all caches on error
      if (context?.previousPriority) {
        context.previousPriority.forEach(([queryKey, data]: [any, any]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousFull) {
        queryClient.setQueryData(["reports", "full"], context.previousFull);
      }
      if (context?.previousAdapterNotes) {
        context.previousAdapterNotes.forEach(([queryKey, data]: [any, any]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    // Real-time subscription handles final cache update - no invalidation needed
  });

  const updatePickupDropArrival = useMutation({
    mutationFn: async ({ pickupDropId, arrivalTime }: { pickupDropId: string; arrivalTime?: string }) => {
      let timestamp: string;

      if (arrivalTime) {
        // Use the provided arrival time
        timestamp = arrivalTime;
      } else {
        // Use current time as default
        const now = new Date();
        timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      }

      const { error } = await supabase.from("pickup_drops").update({ arrived_at: timestamp }).eq("id", pickupDropId);
      if (error) throw error;
    },
    onMutate: async ({ pickupDropId, arrivalTime }) => {
      await queryClient.cancelQueries({ queryKey: ["reports"] });
      const previousData = queryClient.getQueryData(["reports"]);
      const timestamp = arrivalTime || new Date().toISOString();
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => ({
            ...truck,
            allOrders: truck.allOrders?.map((order: any) => ({
              ...order,
              pickupStops: order.pickupStops?.map((stop: any) =>
                stop.id === pickupDropId ? { ...stop, arrived_at: timestamp } : stop
              ),
              deliveryStops: order.deliveryStops?.map((stop: any) =>
                stop.id === pickupDropId ? { ...stop, arrived_at: timestamp } : stop
              ),
            })),
          })),
        }));
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });

  const updateCheckInOutTimes = useMutation({
    mutationFn: async ({ 
      pickupDropId, 
      checkInTime, 
      checkOutTime 
    }: { 
      pickupDropId: string; 
      checkInTime: string | null; 
      checkOutTime: string | null;
    }) => {
      const updateData: any = {};
      if (checkInTime !== undefined) updateData.arrived_at = checkInTime;
      if (checkOutTime !== undefined) updateData.checked_out_at = checkOutTime;

      const { error } = await supabase
        .from("pickup_drops")
        .update(updateData)
        .eq("id", pickupDropId);
      
      if (error) throw error;
    },
    onMutate: async ({ pickupDropId, checkInTime, checkOutTime }) => {
      await queryClient.cancelQueries({ queryKey: ["reports"] });
      const previousData = queryClient.getQueryData(["reports"]);
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => ({
            ...truck,
            allOrders: truck.allOrders?.map((order: any) => ({
              ...order,
              pickupStops: order.pickupStops?.map((stop: any) =>
                stop.id === pickupDropId
                  ? { ...stop, ...(checkInTime !== undefined && { arrived_at: checkInTime }), ...(checkOutTime !== undefined && { checked_out_at: checkOutTime }) }
                  : stop
              ),
              deliveryStops: order.deliveryStops?.map((stop: any) =>
                stop.id === pickupDropId
                  ? { ...stop, ...(checkInTime !== undefined && { arrived_at: checkInTime }), ...(checkOutTime !== undefined && { checked_out_at: checkOutTime }) }
                  : stop
              ),
            })),
          })),
        }));
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });

  const markGoingToPickup = useMutation({
    mutationFn: async ({ pickupDropId }: { pickupDropId: string }) => {
      const { error } = await supabase
        .from("pickup_drops")
        .update({ going_to_at: new Date().toISOString() })
        .eq("id", pickupDropId);
      if (error) throw error;
    },
    onMutate: async ({ pickupDropId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["reports"] });

      // Optimistically update the cache
      const previousData = queryClient.getQueryData(["reports"]);
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => ({
            ...truck,
            allOrders: truck.allOrders?.map((order: any) => ({
              ...order,
              pickupStops: order.pickupStops?.map((stop: any) =>
                stop.id === pickupDropId ? { ...stop, going_to_at: new Date().toISOString() } : stop,
              ),
            })),
          })),
        }));
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });

  const markGoingToDelivery = useMutation({
    mutationFn: async ({ pickupDropId }: { pickupDropId: string }) => {
      const { error } = await supabase
        .from("pickup_drops")
        .update({ going_to_at: new Date().toISOString() })
        .eq("id", pickupDropId);
      if (error) throw error;
    },
    onMutate: async ({ pickupDropId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["reports"] });

      // Optimistically update the cache
      const previousData = queryClient.getQueryData(["reports"]);
      queryClient.setQueryData(["reports"], (old: any) => {
        if (!old) return old;
        return old.map((group: any) => ({
          ...group,
          trucks: group.trucks.map((truck: any) => ({
            ...truck,
            allOrders: truck.allOrders?.map((order: any) => ({
              ...order,
              deliveryStops: order.deliveryStops?.map((stop: any) =>
                stop.id === pickupDropId ? { ...stop, going_to_at: new Date().toISOString() } : stop,
              ),
            })),
          })),
        }));
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["reports"], context.previousData);
      }
    },
    // Real-time subscription handles cache updates - no invalidation needed
  });

  // Helper function to determine document status
  const getDocumentStatus = (orderFiles: any[]) => {
    if (!orderFiles || orderFiles.length === 0) return "none";

    const hasRC = orderFiles.some((file) => file.file_category === "RC");
    const hasBOL = orderFiles.some((file) => file.file_category === "BOL");
    const hasPOD = orderFiles.some((file) => file.file_category === "POD");

    if (hasRC && hasBOL && hasPOD) return "complete";
    if (hasRC && hasBOL) return "partial";
    if (hasRC) return "minimal";
    return "none";
  };

  // Helper function to get color classes based on document status
  const getDocumentColorClass = (documentStatus: string) => {
    switch (documentStatus) {
      case "complete":
        return { bg: "bg-green-600", text: "text-green-100", border: "border-green-700" };
      case "partial":
        return { bg: "bg-lime-100", text: "text-lime-800", border: "border-lime-300" };
      case "minimal":
        return { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300" };
      default:
        return { bg: "bg-gray-100", text: "text-gray-800", border: "border-gray-200" };
    }
  };

  // Helper function to fetch and process reports data
  const fetchReportsData = async (filterOffice: string | null) => {
    console.log("[useReports] Fetching reports data...", filterOffice ? `(office: ${filterOffice})` : "(all offices)");
    
    // STEP 0: Fetch dispatcher info FIRST to enable filtering
    const { data: dispatchers, error: dispatchersError } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, office, ext")
      .order("user_id", { ascending: true });

    if (dispatchersError) throw dispatchersError;

    // Get dispatcher IDs for filter office if specified
    const filterDispatcherIds = filterOffice 
      ? dispatchers?.filter(d => d.office === filterOffice).map(d => d.user_id).filter(Boolean)
      : null;
    
    if (filterDispatcherIds && filterDispatcherIds.length > 0) {
      console.log(`[useReports] 🎯 Loading ${filterDispatcherIds.length} dispatchers from ${filterOffice}`);
    }
    
    // Fetch trucks with their drivers and company info
    // Fetch ALL trucks upfront - filtering by truck.dispatcher_id misses trucks where 
    // driver.dispatcher_id differs from truck.dispatcher_id. JS filtering is faster than 
    // additional database queries and ensures complete data for priority office.
    // Fetch trucks FLAT (no joins) - eliminates RLS amplification from lateral joins
    const { data: trucksFlat, error: trucksError } = await supabase
      .from("trucks")
      .select("*")
      .order("id", { ascending: true });

    if (trucksError) throw trucksError;

    // Collect unique IDs for batch fetching
    const truckDriverIdsBatch = new Set<string>();
    const truckTrailerIdsBatch = new Set<string>();
    const truckCompanyIdsBatch = new Set<string>();
    (trucksFlat || []).forEach(t => {
      if (t.driver1_id) truckDriverIdsBatch.add(t.driver1_id);
      if (t.driver2_id) truckDriverIdsBatch.add(t.driver2_id);
      if (t.trailer_id) truckTrailerIdsBatch.add(t.trailer_id);
      if (t.company_id) truckCompanyIdsBatch.add(t.company_id);
    });

    // Parallel batch fetches for truck relations
    const [truckDriversRes, truckTrailersRes, truckCompaniesRes] = await Promise.all([
      truckDriverIdsBatch.size > 0
        ? supabase.from("drivers").select("id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, random_drug_test_date, dispatcher_id, going_yard, is_recovery, company_id, do_not_touch_hos").in("id", Array.from(truckDriverIdsBatch))
        : { data: [], error: null },
      truckTrailerIdsBatch.size > 0
        ? supabase.from("trailers").select("id, trailer_number, dot_inspection_date").in("id", Array.from(truckTrailerIdsBatch))
        : { data: [], error: null },
      truckCompanyIdsBatch.size > 0
        ? supabase.from("companies").select("id, name").in("id", Array.from(truckCompanyIdsBatch))
        : { data: [], error: null },
    ]);

    // Build lookup maps
    const truckDriverMap = new Map((truckDriversRes.data || []).map((d: any) => [d.id, d]));
    const truckTrailerMap = new Map((truckTrailersRes.data || []).map((t: any) => [t.id, t]));
    const truckCompanyMap = new Map((truckCompaniesRes.data || []).map((c: any) => [c.id, c]));

    // Fetch company info for drivers (for driver.company sub-object)
    const driverCompanyIds = new Set<string>();
    (truckDriversRes.data || []).forEach((d: any) => {
      if (d.company_id) driverCompanyIds.add(d.company_id);
    });
    const missingCompanyIds = Array.from(driverCompanyIds).filter(id => !truckCompanyMap.has(id));
    if (missingCompanyIds.length > 0) {
      const { data: extraCompanies } = await supabase.from("companies").select("id, name").in("id", missingCompanyIds);
      (extraCompanies || []).forEach((c: any) => truckCompanyMap.set(c.id, c));
    }

    // Assemble truck objects with relations (matching old join shape)
    let trucks = (trucksFlat || []).map(truck => {
      const driver1Raw = truckDriverMap.get(truck.driver1_id) || null;
      const driver2Raw = truckDriverMap.get(truck.driver2_id) || null;
      const trailer = truckTrailerMap.get(truck.trailer_id) || null;
      const truckCompany = truckCompanyMap.get(truck.company_id) || null;

      const driver1 = driver1Raw ? { ...driver1Raw, company: truckCompanyMap.get(driver1Raw.company_id) || null } : null;
      const driver2 = driver2Raw ? { ...driver2Raw, company: truckCompanyMap.get(driver2Raw.company_id) || null } : null;

      return {
        ...truck,
        driver1,
        driver2,
        trailer,
        company: driver1?.company || truckCompany || null,
      };
    });

    // Filter trucks by driver's dispatcher for priority office loading
    if (filterDispatcherIds && filterDispatcherIds.length > 0 && trucks) {
      trucks = trucks.filter(truck =>
        truck.driver1?.dispatcher_id && filterDispatcherIds.includes(truck.driver1.dispatcher_id)
      );
    }
    
    console.log(`[useReports] ✅ Fetched ${trucks?.length} trucks${filterOffice ? ` for ${filterOffice}` : ""}`);

    // Get driver IDs from filtered trucks for order filtering
    const truckDriverIds = new Set<string>();
    trucks?.forEach(truck => {
      if (truck.driver1_id) truckDriverIds.add(truck.driver1_id);
      if (truck.driver2_id) truckDriverIds.add(truck.driver2_id);
    });
    const driverIdsArray = Array.from(truckDriverIds);

    // STEP 1: Always fetch orders independently - do NOT rely on useOrders cache
    // The useOrders cache may be incomplete (only 100 orders) due to performance optimizations.
    // Reports must always have the complete dataset to show all driver loads correctly.
    let unlockedOrdersRaw: any[] = [];
    
    // Fetch from database - always independent from useOrders cache
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      console.log('[useReports] 🚀 Loading UNLOCKED orders from DATABASE (with nested pickup_drops and order_transfers)...');

      // NOTE: PostgREST enforces a max of 1000 rows per request.
      // Some offices have >1000 unlocked orders inside our 90-day/active filter, so we MUST batch.
      const UNLOCKED_BATCH_SIZE = 1000;

      // Build query factory (so we can re-run it with different ranges)
      // Flat orders query - no joins to eliminate RLS amplification
      const buildUnlockedOrdersQuery = () =>
        supabase
          .from("orders")
          .select("*")
          .eq("locked", false)
          .or(
            `delivery_datetime.gte.${ninetyDaysAgo.toISOString()},delivery_datetime.is.null,status.eq.in_transit,status.eq.pending`,
          )
          .order("delivery_datetime", { ascending: false, nullsFirst: true })
          .order("id", { ascending: true });

      // Note: For priority office loading, we still filter orders in JS after fetching
      // since pushing large driver UUID lists into the URL can exceed URL limits.

      for (let from = 0; ; from += UNLOCKED_BATCH_SIZE) {
        const to = from + UNLOCKED_BATCH_SIZE - 1;

        const { data: pageData, error: pageError } = await queryWithTimeout(
          async () => await buildUnlockedOrdersQuery().range(from, to),
          60000,
        );

        if (pageError) throw pageError;

        const page = pageData || [];
        unlockedOrdersRaw = unlockedOrdersRaw.concat(page);

        // Last page
        if (page.length < UNLOCKED_BATCH_SIZE) break;
      }

      // Batch-fetch all order relations (flat+batch pattern - eliminates RLS amplification)
      console.log(`[useReports] 🔄 Enriching ${unlockedOrdersRaw.length} orders with relations...`);
      unlockedOrdersRaw = await enrichOrdersWithRelations(unlockedOrdersRaw);

      const totalPickupDropsFromDB =
        unlockedOrdersRaw?.reduce((sum, order) => sum + (order.pickup_drops?.length || 0), 0) || 0;
      console.log(
        `[useReports] ✅ Fetched ${unlockedOrdersRaw?.length || 0} UNLOCKED orders with ${totalPickupDropsFromDB} pickup_drops from DATABASE${
          filterOffice ? ` (filtered for ${filterOffice})` : ""
        }`,
      );

    // STEP 2: Load locked orders via Edge Function (direct from database)
    let lockedOrders: any[] = [];
    
    try {
      console.log('[useReports] 📡 Loading LOCKED orders via Edge Function...');
      
      const { data: lockedResponse, error: lockedError } = await supabase.functions.invoke(
        "get-all-locked-orders",
        {
          body: {
            bookedBy: null,
            dispatcherDriverIds: filterOffice && driverIdsArray.length > 0 ? driverIdsArray : [],
          },
        }
      );

      if (lockedError) {
        console.error('[useReports] ⚠️ Edge Function error:', lockedError);
      } else if (lockedResponse?.orders) {
        const allLockedOrders = lockedResponse.orders;
        console.log(`[useReports] ✅ Loaded ${allLockedOrders.length} locked orders via Edge Function in ${lockedResponse.fetchTimeMs}ms`);

        // Filter locked orders for reports criteria (90 days)
        const ninetyDaysAgoForFilter = new Date();
        ninetyDaysAgoForFilter.setDate(ninetyDaysAgoForFilter.getDate() - 90);

        lockedOrders = allLockedOrders.filter((order: any) => {
          // Per spec: Locked canceled orders should NOT display
          if (order.canceled || order.status === 'canceled') return false;
          
          const deliveryDate = order.delivery_datetime ? new Date(order.delivery_datetime) : null;

          return (
            !order.delivery_datetime ||
            (deliveryDate && !isNaN(deliveryDate.getTime()) && deliveryDate >= ninetyDaysAgoForFilter) ||
            order.status === 'in_transit' ||
            order.status === 'pending'
          );
        });

        // For priority office loading, filter locked orders to only those for office drivers
        if (filterOffice && driverIdsArray.length > 0) {
          const driverIdsSet = new Set(driverIdsArray);
          const filteredCount = lockedOrders.length;
          lockedOrders = lockedOrders.filter((order: any) => 
            (order.driver1_id && driverIdsSet.has(order.driver1_id)) ||
            (order.driver2_id && driverIdsSet.has(order.driver2_id))
          );
          console.log(`[useReports] 🎯 Filtered locked orders for ${filterOffice}: ${filteredCount} → ${lockedOrders.length}`);
        }

        console.log(`[useReports] 🔀 Including ${lockedOrders.length} relevant locked orders`);
      }
    } catch (error) {
      console.error('[useReports] ⚠️ Could not load locked orders:', error);
      lockedOrders = [];
    }

    // Combine unlocked (from database) and locked orders
    // IMPORTANT: Deduplicate by order ID, prioritizing unlocked orders (from DB) 
    // because they have the latest data including order_transfers
    const unlockedOrderIds = new Set((unlockedOrdersRaw || []).map((o: any) => o.id));
    const deduplicatedLockedOrders = lockedOrders.filter((o: any) => !unlockedOrderIds.has(o.id));
    const allOrders = [...(unlockedOrdersRaw || []), ...deduplicatedLockedOrders];
    
    // Debug: Log sample locked orders to verify driver matching
    if (deduplicatedLockedOrders.length > 0) {
      const sampleLocked = deduplicatedLockedOrders.slice(0, 3).map((o: any) => ({
        id: o.id,
        load_number: o.load_number || o.broker_load_number,
        driver1_id: o.driver1_id,
        pickup_drops_count: o.pickup_drops?.length || 0,
      }));
      console.log(`[useReports] 🔍 Sample locked orders:`, JSON.stringify(sampleLocked));
    }
    
    console.log(`[useReports] 📊 Processing ${allOrders.length} total orders (${unlockedOrdersRaw?.length || 0} unlocked + ${deduplicatedLockedOrders.length} locked)${filterOffice ? ` for ${filterOffice}` : ""}`);

    // NOTE: Bidirectional cache sharing removed - useOrders cache is now partial (100 orders only)
    // Each page must independently fetch its complete dataset for correctness

    // PERF: Index orders by driver once (instead of filtering allOrders for every truck/driver)
    // - ordersByDriver: includes current + original + transfer drivers (used for truck rows)
    // - ordersByDriverCurrent: current assignment only (used for unassigned driver rows, to preserve existing behavior)
    const ordersByDriver = new Map<string, any[]>();
    const ordersByDriverCurrent = new Map<string, any[]>();

    const addOrderToMap = (map: Map<string, any[]>, driverId: string | null | undefined, order: any) => {
      if (!driverId) return;
      const existing = map.get(driverId);
      if (existing) existing.push(order);
      else map.set(driverId, [order]);
    };

    for (const order of allOrders || []) {
      const currentDriverIds = new Set<string>();
      if (order.driver1_id) currentDriverIds.add(order.driver1_id);
      if (order.driver2_id) currentDriverIds.add(order.driver2_id);
      currentDriverIds.forEach((id) => addOrderToMap(ordersByDriverCurrent, id, order));

      const relatedDriverIds = new Set<string>(currentDriverIds);
      if (order.original_driver1_id) relatedDriverIds.add(order.original_driver1_id);
      if (order.original_driver2_id) relatedDriverIds.add(order.original_driver2_id);

      const transfers = order.order_transfers || [];
      for (const t of transfers) {
        if (t?.driver1_id) relatedDriverIds.add(t.driver1_id);
        if (t?.driver2_id) relatedDriverIds.add(t.driver2_id);
      }

      relatedDriverIds.forEach((id) => addOrderToMap(ordersByDriver, id, order));
    }

        // STEP 3: Fetch supporting data and build reports
        // (dispatchers already fetched above for priority filtering)

        // Fetch truck notes - filter by driver IDs when loading for specific office
        let notesQuery = supabase
          .from("truck_notes")
          .select("*")
          .order("updated_at", { ascending: false });
        
        if (filterOffice && driverIdsArray.length > 0) {
          notesQuery = notesQuery.in("driver_id", driverIdsArray);
        }

        const { data: truckNotes, error: notesError } = await notesQuery;

        if (notesError) throw notesError;

        // PERF: Pre-index truck notes by driver_id for O(1) lookups
        const truckNotesByDriverId = new Map<string, any>();
        for (const note of truckNotes || []) {
          if (note.driver_id && !truckNotesByDriverId.has(note.driver_id)) {
            // Keep only the first (most recent due to ORDER BY) note per driver
            truckNotesByDriverId.set(note.driver_id, note);
          }
        }

        // Fetch lost day notes - ALWAYS filter by driver IDs from trucks we're showing
        // This ensures consistency between priority and background queries
        let lostDayQuery = supabase
          .from("lost_day_notes")
          .select("*")
          .order("id", { ascending: true });

        // Always filter by driver IDs if we have them - ensures home time notes are matched correctly
        if (driverIdsArray.length > 0) {
          lostDayQuery = lostDayQuery.in("driver_id", driverIdsArray);
        }

        const { data: lostDayNotes, error: lostDayError } = await lostDayQuery;

        if (lostDayError) throw lostDayError;

        // PERF: Pre-index lost day notes by driver_id for O(1) lookups
        const lostDayNotesByDriverId = new Map<string, any[]>();
        for (const note of lostDayNotes || []) {
          if (note.driver_id) {
            const existing = lostDayNotesByDriverId.get(note.driver_id);
            if (existing) existing.push(note);
            else lostDayNotesByDriverId.set(note.driver_id, [note]);
          }
        }

        // PERF: Pre-index dispatchers by user_id for O(1) lookups
        const dispatchersByUserId = new Map<string, any>();
        for (const d of dispatchers || []) {
          if (d.user_id) dispatchersByUserId.set(d.user_id, d);
        }

        // Process trucks and match orders to drivers (not trucks)
        const reportData =
          trucks?.map((truck) => {
            const now = new Date().getTime();

            // Get orders for this truck - include:
            // 1. Current driver assignment (driver1_id or driver2_id)
            // 2. Original driver assignment (for transfer loads)
            // 3. Transfer drivers from order_transfers
            const driverId = truck.driver1_id;

            // PERF: Avoid O(trucks * orders) scans
            const driverOrders = driverId ? (ordersByDriver.get(driverId) || []) : [];

            // activeOrders: Orders without POD that could be "current order"
            // Per REPORTS_SPECIFICATION.md Section 3: Current order is first order without POD
            // If order without POD is followed by order with POD, skip to next without POD
            const activeOrders =
              driverOrders.filter((order) => {
                // Skip GAME-OVER orders - they're visual indicators only
                if (order.notes === "GAME|OVER") return false;

                // Skip canceled orders
                if (order.canceled) return false;

                // Skip orders with POD files - they are completed and can't be "current"
                const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
                if (hasPOD) return false;

                // Any pending/in_transit order without POD is a candidate for current order
                const isActiveStatus = order.status === "pending" || order.status === "in_transit";
                return isActiveStatus;
              }) || [];

            const recentCompletedOrders =
              driverOrders.filter((order) => {
                // Skip GAME-OVER orders
                if (order.notes === "GAME|OVER") return false;

                // Skip canceled orders (already normalized to boolean for CSV data)
                if (order.canceled) return false;

                if (order.status === "delivered") return true;

                // Consider orders with POD files as completed regardless of status
                const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
                if (hasPOD) return true;

                // Consider pending orders past delivery time as recently completed
                if (order.status === "pending" && order.delivery_datetime) {
                  const deliveryTime = new Date(order.delivery_datetime).getTime();
                  const daysSinceDelivery = (now - deliveryTime) / (1000 * 60 * 60 * 24);
                  return deliveryTime <= now && daysSinceDelivery <= 7; // Within last 7 days
                }

                return false;
              }) || [];

            // Determine which canceled order to show (most recent one if no newer non-canceled order)
            const truckDriverId = truck.driver1_id;
            let canceledOrderToShow: string | null = null;
            if (truckDriverId) {
              const driverOnlyOrders = driverOrders.filter((o) => o.driver1_id === truckDriverId);
              const canceledOrders = driverOnlyOrders
                .filter((o) => o.canceled)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              const nonCanceledOrders = driverOnlyOrders.filter((o) => !o.canceled);
              
              if (canceledOrders.length > 0) {
                const mostRecentCanceled = canceledOrders[0];
                const canceledCreatedAt = new Date(mostRecentCanceled.created_at).getTime();
                const hasNewerNonCanceled = nonCanceledOrders.some(
                  (o) => new Date(o.created_at).getTime() > canceledCreatedAt
                );
                
                // Additional check: if canceled load's pickup is before previous load's delivery, don't show it
                let canceledPickupBeforePreviousDelivery = false;
                if (!hasNewerNonCanceled && nonCanceledOrders.length > 0) {
                  // Get the most recent non-canceled order (previous load)
                  const sortedNonCanceled = [...nonCanceledOrders].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  );
                  const previousLoad = sortedNonCanceled[0];
                  
                  // Get canceled order's pickup datetime
                  const canceledPickupDatetime = mostRecentCanceled.pickup_datetime;
                  // Get previous load's delivery datetime
                  const previousDeliveryDatetime = previousLoad.delivery_datetime;
                  
                  if (canceledPickupDatetime && previousDeliveryDatetime) {
                    const canceledPickupTime = new Date(canceledPickupDatetime.replace(' ', 'T')).getTime();
                    const previousDeliveryTime = new Date(previousDeliveryDatetime.replace(' ', 'T')).getTime();
                    
                    if (canceledPickupTime < previousDeliveryTime) {
                      canceledPickupBeforePreviousDelivery = true;
                    }
                  }
                }
                
                if (!hasNewerNonCanceled && !canceledPickupBeforePreviousDelivery) {
                  canceledOrderToShow = mostRecentCanceled.id;
                }
              }
            }

            // Process all orders for this driver (including GAME-OVER for calendar rendering)
            // Include canceled order only if it's the one we determined should be shown
            const allOrdersWithStops =
              driverOrders
                .filter((order) => !order.canceled || order.id === canceledOrderToShow)
                .map((order) => {
                  // Get original pickup/delivery stops
                  let pickupStops = (order.pickup_drops?.filter((stop: any) => stop.type === "pickup") || []).sort(
                    (a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0),
                  );
                  let deliveryStops = (order.pickup_drops?.filter((stop: any) => stop.type === "delivery") || []).sort(
                    (a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0),
                  );

                  // Check if this driver is a transfer driver on this order
                  const driverIdForOrder = truck.driver1_id;
                  const transfers = order.order_transfers || [];
                  const sortedTransfers = [...transfers].sort((a: any, b: any) => 
                    (a.sequence_number || 0) - (b.sequence_number || 0)
                  );
                  
                  // Check if this is an ACTUAL original driver (matches original_driver1_id or original_driver2_id)
                  const isActualOriginalDriver = order.original_driver1_id === driverIdForOrder || 
                    order.original_driver2_id === driverIdForOrder;
                  
                  const driverTransfer = sortedTransfers.find((t: any) => 
                    t.driver1_id === driverIdForOrder || t.driver2_id === driverIdForOrder
                  );

                  // Original driver case - check FIRST, before transfer driver logic
                  // Original drivers keep their original pickup, but their delivery is their transfer location
                  if (isActualOriginalDriver && sortedTransfers.length > 0) {
                    // Find original driver's own transfer record (seq 0) or use first transfer
                    const originalDriverTransfer = sortedTransfers.find((t: any) => 
                      (t.driver1_id === driverIdForOrder || t.driver2_id === driverIdForOrder) &&
                      (t.sequence_number === 0 || t.sequence_number === undefined || t.sequence_number === null)
                    ) || sortedTransfers[0];
                    
                    if (originalDriverTransfer?.transfer_city) {
                      // Keep original pickupStops, but update delivery to transfer location
                      deliveryStops = [{
                        id: `transfer-delivery-${originalDriverTransfer.id}`,
                        type: "delivery",
                        city: originalDriverTransfer.transfer_city,
                        state: originalDriverTransfer.transfer_state || "",
                        address: originalDriverTransfer.transfer_address || "",
                        datetime: originalDriverTransfer.transfer_datetime,
                        sequence_number: 1,
                      }];
                    }
                    // pickupStops remain as original
                  } else if (driverTransfer) {
                    // Transfer driver case - NOT an original driver
                    const seqNum = driverTransfer.sequence_number || 1;
                    const previousTransfer = sortedTransfers.find((t: any) =>
                      (t.sequence_number || 0) === seqNum - 1
                    );
                    const nextTransfer = sortedTransfers.find((t: any) =>
                      (t.sequence_number || 0) > seqNum
                    );

                    // Pickup for Transfer #N is the previous segment's handoff location.
                    // Legacy fallback: if previous isn't populated, use this transfer's own location.
                    const pickupSource =
                      (previousTransfer?.transfer_city || previousTransfer?.transfer_state)
                        ? previousTransfer
                        : (driverTransfer.transfer_city || driverTransfer.transfer_state)
                          ? driverTransfer
                          : null;

                    if (pickupSource) {
                      pickupStops = [{
                        id: `transfer-pickup-${pickupSource.id}`,
                        type: "pickup",
                        city: pickupSource.transfer_city,
                        state: pickupSource.transfer_state || "",
                        address: pickupSource.transfer_address || "",
                        // Use transfer driver's own datetime (when they picked up), not the previous driver's handoff time
                        datetime: driverTransfer.transfer_datetime || pickupSource.transfer_datetime,
                        sequence_number: 1,
                      }];
                    }

                    // This driver's delivery is either next transfer or original final delivery
                    if (nextTransfer?.transfer_city || nextTransfer?.transfer_state) {
                      deliveryStops = [{
                        id: `transfer-delivery-${nextTransfer.id}`,
                        type: "delivery",
                        city: nextTransfer.transfer_city,
                        state: nextTransfer.transfer_state || "",
                        address: nextTransfer.transfer_address || "",
                        datetime: nextTransfer.transfer_datetime,
                        sequence_number: 1,
                      }];
                    }
                    // else keep original deliveryStops (final delivery)
                  }

                  // For display: use first pickup and last delivery
                  const pickupStop = pickupStops.length > 0 ? pickupStops[0] : null;
                  const deliveryStop = deliveryStops.length > 0 ? deliveryStops[deliveryStops.length - 1] : null;
                  const documentStatus = getDocumentStatus(order.order_files || []);
                  const documentColors = getDocumentColorClass(documentStatus);

                  return {
                    ...order,
                    pickupStop,
                    deliveryStop,
                    pickupStops, // All pickups (transfer-aware)
                    deliveryStops, // All deliveries (transfer-aware)
                    isActive: activeOrders.some((activeOrder) => activeOrder.id === order.id),
                    isRecentCompleted: recentCompletedOrders.some((completedOrder) => completedOrder.id === order.id),
                    documentStatus,
                    documentColors,
                    // Format load details for info display
                    loadDetails: {
                      loadNumber: order.internal_load_number || "—",
                      companyName: truck.company?.name || null,
                      brokerLoadNumber: order.broker_load_number || "—",
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
                      // Include all pickup and delivery stops - use individual stop datetime for multi-stop loads
                      allPickupStops: pickupStops.map((stop: any) => ({
                        address: stop.address || "—",
                        city: stop.city || "—",
                        state: stop.state || "—",
                        zipCode: stop.zip_code || "",
                        datetime: stop.datetime || order.pickup_datetime || "—",
                        endDatetime: order.pickup_end_datetime || "—",
                      })),
                      allDeliveryStops: deliveryStops.map((stop: any) => ({
                        address: stop.address || "—",
                        city: stop.city || "—",
                        state: stop.state || "—",
                        zipCode: stop.zip_code || "",
                        datetime: stop.datetime || order.delivery_datetime || "—",
                        endDatetime: order.delivery_end_datetime || "—",
                      })),
                      // Simplified document info - only categories needed
                      documents: (order.order_files || []).map((file: any) => ({
                        category: file.file_category,
                      })),
                      notes: order.notes || "—",
                    },
                  };
                }) || [];

            // Select primary order for display (backward compatibility, exclude GAME-OVER)
            // Per spec: in_transit orders DON'T take priority over pending orders
            // Sort only by earliest pickup time
            const sortedActiveOrders = allOrdersWithStops
              .filter((order) => order.isActive && activeOrders.some((active) => active.id === order.id))
              .sort((a, b) => {
                // Sort by pickup datetime (earliest first) - NO status priority
                const aPickup = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : Infinity;
                const bPickup = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : Infinity;
                return aPickup - bPickup;
              });

            // Current order logic:
            // 1. Default: current = last/latest load that has BOL
            // 2. Exception: if last load has no BOL but previous load has POD, then last load is current
            // 3. Fallback: if no load with BOL, use last load
            // NOTE: We use ALL orders (not just those without POD) to find current load
            let currentOrder: typeof allOrdersWithStops[0] | null = null;
            
            // Sort ALL non-canceled orders by pickup datetime for current load logic
            const allSortedOrders = allOrdersWithStops
              .filter((order) => !order.canceled && order.notes !== "GAME|OVER")
              .sort((a, b) => {
                const aPickup = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : Infinity;
                const bPickup = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : Infinity;
                return aPickup - bPickup;
              });
            
            if (allSortedOrders.length > 0) {
              const lastOrder = allSortedOrders[allSortedOrders.length - 1];
              const lastOrderHasBOL = lastOrder.order_files?.some((file: any) => file.file_category === 'BOL');
              
              if (lastOrderHasBOL) {
                // Last load has BOL - it's the current load
                currentOrder = lastOrder;
              } else {
                // Last load doesn't have BOL
                // Check if there's a previous order with POD (completed)
                if (allSortedOrders.length >= 2) {
                  const previousOrder = allSortedOrders[allSortedOrders.length - 2];
                  const previousHasPOD = previousOrder.order_files?.some((file: any) => file.file_category === 'POD');
                  
                  if (previousHasPOD) {
                    // Previous load is complete (has POD), so the last load without BOL is current
                    currentOrder = lastOrder;
                  } else {
                    // Previous load doesn't have POD, find the last load with BOL
                    const lastWithBOL = [...allSortedOrders].reverse().find(order =>
                      order.order_files?.some((file: any) => file.file_category === 'BOL')
                    );
                    // Fallback: if no load with BOL found, use last load
                    currentOrder = lastWithBOL || lastOrder;
                  }
                } else {
                  // Only one order and it doesn't have BOL
                  currentOrder = lastOrder;
                }
              }
            } else if (recentCompletedOrders.length > 0) {
              currentOrder = allOrdersWithStops.find((order) => order.isRecentCompleted) || null;
            } else if (allOrdersWithStops.length > 0) {
              currentOrder = allOrdersWithStops.find((order) => order.notes !== "GAME|OVER") || null;
            }

            // Use transfer-aware stops for drivers with transfers
            const driverIdForTransfer = truck.driver1_id;
            const transferStopInfo: TransferSegmentInfo = driverIdForTransfer && currentOrder
              ? getTransferAwareStops(driverIdForTransfer, currentOrder, currentOrder?.pickupStop, currentOrder?.deliveryStop)
              : { effectivePickupStop: currentOrder?.pickupStop, effectiveDeliveryStop: currentOrder?.deliveryStop, isTransferDriver: false, driverSequenceNumber: 0, segmentLabel: "" };

            // PERF: Use pre-indexed maps for O(1) lookups instead of O(n) finds/filters
            const truckNote = truck.driver1_id ? truckNotesByDriverId.get(truck.driver1_id) : undefined;

            // Get lost day notes for this truck's driver
            const truckLostDayNotes = driverId ? (lostDayNotesByDriverId.get(driverId) || []) : [];

            // Find dispatcher info from driver1
            const dispatcherInfo = truck.driver1?.dispatcher_id ? dispatchersByUserId.get(truck.driver1.dispatcher_id) : undefined;

            // Format location
            const formatLocation = (city: string | null, state: string | null) => {
              if (city && state) return `${city}, ${state}`;
              if (city) return city;
              if (state) return state;
              return "—";
            };

            // Format transfer info as a stop-like object
            const formatTransferInfo = (transferInfo?: { city: string; state: string; address?: string; datetime?: string }) => {
              if (!transferInfo) return null;
              
              let location = "—";
              const parts = [];
              if (transferInfo.address) parts.push(transferInfo.address);
              if (transferInfo.city) parts.push(transferInfo.city);
              if (transferInfo.state) parts.push(transferInfo.state);
              
              if (parts.length > 0) {
                location = parts.join(", ");
                if (location.length > 30) {
                  location = location.substring(0, 30) + "...";
                }
              }
              
              let date = "—";
              let time = "—";
              
              if (transferInfo.datetime) {
                const parsed = parseSimpleDateTime(transferInfo.datetime);
                date = parsed.dateString;
                time = parsed.timeString;
              }
              
              return { id: null, location, date, time };
            };

            // Format pickup/delivery info
            const formatStopInfo = (stop: any, orderStartTime?: string, orderEndTime?: string) => {
              if (!stop) return { id: null, location: "—", date: "—", time: "—" };

              // Build full address with all available components
              let location = "—";
              const parts = [];

              if (stop.address) parts.push(stop.address);
              if (stop.city) parts.push(stop.city);
              if (stop.state) parts.push(stop.state);

              if (parts.length > 0) {
                location = parts.join(", ");
                // Truncate if too long for display
                if (location.length > 30) {
                  location = location.substring(0, 30) + "...";
                }
              }

              let date = "—";
              let time = "—";

              // Use order datetime if available, otherwise use stop datetime
              const datetimeToUse = orderStartTime || stop.datetime;
              const endDatetimeToUse = orderEndTime;

              if (datetimeToUse) {
                // Parse datetime without timezone conversion
                const parsed = parseSimpleDateTime(datetimeToUse);
                date = parsed.dateString;
                const startTime = parsed.timeString;

                // If there's an end time and it's different from start time, show range
                if (endDatetimeToUse) {
                  const parsedEnd = parseSimpleDateTime(endDatetimeToUse);
                  const endTime = parsedEnd.timeString;

                  if (startTime !== endTime) {
                    time = `${startTime} - ${endTime}`;
                  } else {
                    time = startTime;
                  }
                } else {
                  time = startTime;
                }
              }

              return { id: stop.id, location, date, time };
            };

            // Determine status based on order status and truck status
            let status = "Available";
            if (currentOrder) {
              switch (currentOrder.status) {
                case "pending":
                  status = "Loading";
                  break;
                case "in_transit":
                  status = "In Transit";
                  break;
                case "delivered":
                  status = "Available";
                  break;
                default:
                  status =
                    truck.status === "available"
                      ? "Available"
                      : truck.status === "in_use"
                        ? "In Transit"
                        : truck.status === "maintenance"
                          ? "Maintenance"
                          : "Available";
              }
            } else {
              status =
                truck.status === "available"
                  ? "Available"
                  : truck.status === "in_use"
                    ? "In Transit"
                    : truck.status === "maintenance"
                      ? "Maintenance"
                      : "Available";
            }

            // Check if it's a team (2 drivers)
            const isTeam = truck.driver1 && truck.driver2;

            return {
              id: truck.id,
              orderId: currentOrder?.id,
              truckNumber: truck.truck_number,
              companyName: truck.company?.name || null,
              driver: isTeam ? "Team" : truck.driver1?.name || "Unassigned",
              driver1Name: truck.driver1?.name || "Unassigned",
              driverId: truck.driver1?.id || null,
              driverPhone: truck.driver1?.phone || null,
              driverEmail: truck.driver1?.email || null,
              emergencyContactName: truck.driver1?.emergency_contact_name || null,
              emergencyContactRelation: truck.driver1?.emergency_contact_relation || null,
              emergencyContactPhone: truck.driver1?.emergency_contact_phone || null,
              driver2Id: truck.driver2?.id || null,
              driver2Name: truck.driver2?.name || null,
              driver2Phone: truck.driver2?.phone || null,
              driver2Email: truck.driver2?.email || null,
              trailerNumber: truck.trailer?.trailer_number || null,
              home:
                truck.driver1?.home_city && truck.driver1?.home_state
                  ? `${truck.driver1.home_city}, ${truck.driver1.home_state}`
                  : truck.driver1?.home_city || truck.driver1?.home_state || "—",
              dispatcher: dispatcherInfo?.full_name || dispatcherInfo?.email || "Unknown",
              dispatcherId: truck.driver1?.dispatcher_id,
              status,
              pickup: transferStopInfo.transferPickupInfo 
                ? formatTransferInfo(transferStopInfo.transferPickupInfo)! 
                : formatStopInfo(transferStopInfo.effectivePickupStop, currentOrder?.pickup_datetime, currentOrder?.pickup_end_datetime),
              delivery: transferStopInfo.transferDeliveryInfo 
                ? formatTransferInfo(transferStopInfo.transferDeliveryInfo)! 
                : formatStopInfo(
                    transferStopInfo.effectiveDeliveryStop,
                    currentOrder?.delivery_datetime,
                    currentOrder?.delivery_end_datetime,
                  ),
              awayDays: currentOrder
                ? Math.floor((Date.now() - new Date(currentOrder.updated_at).getTime()) / (1000 * 60 * 60 * 24))
                : 0,
              driveHours: truck.driver1?.hos_drive_minutes
                ? `${Math.floor(truck.driver1.hos_drive_minutes / 60)}:${String(truck.driver1.hos_drive_minutes % 60).padStart(2, "0")}h`
                : "0:00h",
              shiftHours: truck.driver1?.hos_shift_minutes
                ? `${Math.floor(truck.driver1.hos_shift_minutes / 60)}:${String(truck.driver1.hos_shift_minutes % 60).padStart(2, "0")}h`
                : "0:00h",
              cycleHours: truck.driver1?.hos_cycle_minutes
                ? `${Math.floor(truck.driver1.hos_cycle_minutes / 60)}:${String(truck.driver1.hos_cycle_minutes % 60).padStart(2, "0")}h`
                : "0:00h",
              driveMinutes: truck.driver1?.hos_drive_minutes || 0,
              shiftMinutes: truck.driver1?.hos_shift_minutes || 0,
              breakMinutes: truck.driver1?.hos_break_minutes || 0,
              cycleMinutes: truck.driver1?.hos_cycle_minutes || 0,
              hosStatus: truck.driver1?.hos_status || null,
              hosLastUpdated: truck.driver1?.hos_last_updated || null,
              twoWeekBlockDate: truck.driver1?.two_week_block_date || null,
              randomDrugTestDate: truck.driver1?.random_drug_test_date || null,
              note: truckNote?.note || "",
              lastEdit: truckNote
                ? new Date(truckNote.updated_at).toLocaleTimeString()
                : new Date(truck.updated_at).toLocaleTimeString(),
              editDate: truckNote
                ? new Date(truckNote.updated_at).toLocaleDateString()
                : new Date(truck.updated_at).toLocaleDateString(),
              // Multi-load support
              allOrders: allOrdersWithStops,
              activeOrders: activeOrders,
              activeOrdersCount: activeOrders.length,
              totalOrdersCount: driverOrders.length || 0,
              hasMultipleOrders: (driverOrders.length || 0) > 1,
              lost_day_notes: truckLostDayNotes,
              milesAway: truck.miles_away || 0,
              etaMinutes: truck.eta_minutes || 0,
              totalMiles: currentOrder?.loaded_miles || 0,
              goingYard: truck.driver1?.going_yard || false,
              needsRecovery: truck.needs_recovery || false,
              isRecoveryDriver: truck.driver1?.is_recovery || false,
              doNotTouchHos: truck.driver1?.do_not_touch_hos || false,
              trailerId: truck.trailer_id || null,
              dispatcherEmail: dispatcherInfo?.email || null,
              dispatcherName: dispatcherInfo?.full_name || null,
              // Maintenance tracking dates
              oil_change_date: truck.oil_change_date || null,
              tires_swap_date: truck.tires_swap_date || null,
              maintenance_check_date: truck.maintenance_check_date || null,
              // DOT inspection dates
              dot_inspection_date: truck.dot_inspection_date || null,
              trailer_dot_inspection_date: truck.trailer?.dot_inspection_date || null,
            };
          }) || [];

        // Fetch active drivers - filter by dispatcher when loading for specific office
        let driversQuery = supabase
          .from("drivers")
          .select(
            "id, name, phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, home_city, home_state, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, two_week_block_date, random_drug_test_date, dispatcher_id, is_active, going_yard, company_id, do_not_touch_hos",
          )
          .eq("is_active", true)
          .order("name", { ascending: true });

        // Filter drivers by dispatcher IDs when loading for specific office
        if (filterDispatcherIds && filterDispatcherIds.length > 0) {
          driversQuery = driversQuery.in("dispatcher_id", filterDispatcherIds);
        }

        const { data: allDrivers, error: driversError } = await driversQuery;

        if (driversError) throw driversError;

        // Filter to only include trucks with a dispatcher assigned to driver1
        const trucksWithDispatcher = reportData.filter((truck) => truck.dispatcherId);

        // Find drivers not assigned to any truck (neither as driver1 nor driver2)
        const assignedDriverIds = new Set(trucks?.flatMap((t) => [t.driver1_id, t.driver2_id].filter(Boolean)) || []);
        const unassignedDrivers = allDrivers?.filter((driver) => !assignedDriverIds.has(driver.id)) || [];

        // Fetch company names for unassigned drivers
        const unassignedDriverCompanyIds = [...new Set(unassignedDrivers.map(d => d.company_id).filter(Boolean))];
        const { data: driverCompanies } = unassignedDriverCompanyIds.length > 0 
          ? await supabase.from("companies").select("id, name").in("id", unassignedDriverCompanyIds)
          : { data: [] };
        const driverCompanyMap = new Map((driverCompanies || []).map(c => [c.id, c.name]));

        // Create report entries for unassigned drivers
        const unassignedDriverReports = unassignedDrivers.map((driver) => {
          const now = new Date().getTime();

          // Get orders for this driver
          const driverOrders = ordersByDriverCurrent.get(driver.id) || [];

          // activeOrders: Orders without POD that could be "current order"
          // Per REPORTS_SPECIFICATION.md Section 3: Current order is first order without POD
          const activeOrders =
            driverOrders.filter((order) => {
              if (order.notes === "GAME|OVER") return false;
              if (order.canceled) return false;
              // Skip orders with POD files - they are completed and can't be "current"
              const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
              if (hasPOD) return false;
              // Any pending/in_transit order without POD is a candidate for current order
              const isActiveStatus = order.status === "pending" || order.status === "in_transit";
              return isActiveStatus;
            }) || [];

          const recentCompletedOrders =
            driverOrders.filter((order) => {
              if (order.notes === "GAME|OVER") return false;
              if (order.canceled) return false;
              if (order.status === "delivered") return true;
              
              // Consider orders with POD files as completed regardless of status
              const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
              if (hasPOD) return true;
              
              if (order.status === "pending" && order.delivery_datetime) {
                const deliveryTime = new Date(order.delivery_datetime).getTime();
                const daysSinceDelivery = (now - deliveryTime) / (1000 * 60 * 60 * 24);
                return deliveryTime <= now && daysSinceDelivery <= 7;
              }
              return false;
            }) || [];

          // Get driver's company name
          const driverCompanyName = driver.company_id ? driverCompanyMap.get(driver.company_id) || null : null;

          // PERF: Use pre-indexed maps for O(1) lookups
          const driverDispatcherInfo = driver.dispatcher_id ? dispatchersByUserId.get(driver.dispatcher_id) : undefined;

          // Get driver note
          const driverNote = truckNotesByDriverId.get(driver.id);

          // Build allOrdersWithStops for unassigned drivers
          const allOrdersWithStops = driverOrders.map((order) => {
            const orderPickupDrops = order.pickup_drops || [];
            const pickupStops = orderPickupDrops.filter((pd: any) => pd.type === "pickup");
            const deliveryStops = orderPickupDrops.filter((pd: any) => pd.type === "delivery" || pd.type === "drop");
            const pickupStop = pickupStops[0];
            const deliveryStop = deliveryStops[deliveryStops.length - 1];
            const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
            const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
            
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
              order_files: order.order_files,
              pickupStop,
              deliveryStop,
              pickupStops,
              deliveryStops,
              isActive: activeOrders.some((activeOrder) => activeOrder.id === order.id),
              isRecentCompleted: recentCompletedOrders.some((completedOrder) => completedOrder.id === order.id),
              documentStatus: hasPOD ? 'complete' : hasBOL ? 'partial' : 'missing',
              documentColors: { pod: hasPOD, bol: hasBOL },
              loadDetails: {
                loadNumber: order.internal_load_number || "—",
                companyName: null, // Unassigned drivers don't have company info
                brokerLoadNumber: order.broker_load_number || "—",
                pickupInfo: pickupStop ? { address: pickupStop.address || "—", city: pickupStop.city || "—", state: pickupStop.state || "—", zipCode: pickupStop.zip_code || "", datetime: pickupStop.datetime || order.pickup_datetime || "—", endDatetime: order.pickup_end_datetime || "—" } : null,
                deliveryInfo: deliveryStop ? { address: deliveryStop.address || "—", city: deliveryStop.city || "—", state: deliveryStop.state || "—", zipCode: deliveryStop.zip_code || "", datetime: deliveryStop.datetime || order.delivery_datetime || "—", endDatetime: order.delivery_end_datetime || "—" } : null,
                allPickupStops: pickupStops.map((stop: any) => ({ address: stop.address || "—", city: stop.city || "—", state: stop.state || "—", zipCode: stop.zip_code || "", datetime: stop.datetime || order.pickup_datetime || "—", endDatetime: order.pickup_end_datetime || "—" })),
                allDeliveryStops: deliveryStops.map((stop: any) => ({ address: stop.address || "—", city: stop.city || "—", state: stop.state || "—", zipCode: stop.zip_code || "", datetime: stop.datetime || order.delivery_datetime || "—", endDatetime: order.delivery_end_datetime || "—" })),
                documents: (order.order_files || []).map((file: any) => ({ category: file.file_category })),
                notes: order.notes || "—",
              },
            };
          }) || [];

          // Determine current order using same logic as trucks
          let currentOrder: typeof allOrdersWithStops[0] | null = null;
          const allSortedOrders = allOrdersWithStops
            .filter((order) => !order.canceled && order.notes !== "GAME|OVER")
            .sort((a, b) => {
              const aPickup = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : Infinity;
              const bPickup = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : Infinity;
              return aPickup - bPickup;
            });
          
          if (allSortedOrders.length > 0) {
            const lastOrder = allSortedOrders[allSortedOrders.length - 1];
            const lastOrderHasBOL = lastOrder.order_files?.some((file: any) => file.file_category === 'BOL');
            if (lastOrderHasBOL) {
              currentOrder = lastOrder;
            } else if (allSortedOrders.length >= 2) {
              const previousOrder = allSortedOrders[allSortedOrders.length - 2];
              const previousHasPOD = previousOrder.order_files?.some((file: any) => file.file_category === 'POD');
              if (previousHasPOD) {
                currentOrder = lastOrder;
              } else {
                const lastWithBOL = [...allSortedOrders].reverse().find(order =>
                  order.order_files?.some((file: any) => file.file_category === 'BOL')
                );
                currentOrder = lastWithBOL || lastOrder;
              }
            } else {
              currentOrder = lastOrder;
            }
          } else if (recentCompletedOrders.length > 0) {
            currentOrder = allOrdersWithStops.find((order) => order.isRecentCompleted) || null;
          } else if (allOrdersWithStops.length > 0) {
            currentOrder = allOrdersWithStops.find((order) => order.notes !== "GAME|OVER") || null;
          }

          // Get transfer-aware stops for unassigned driver
          const transferStopInfo: TransferSegmentInfo = currentOrder
            ? getTransferAwareStops(driver.id, currentOrder, currentOrder?.pickupStop, currentOrder?.deliveryStop)
            : { effectivePickupStop: currentOrder?.pickupStop, effectiveDeliveryStop: currentOrder?.deliveryStop, isTransferDriver: false, driverSequenceNumber: 0, segmentLabel: "" };

          // Format transfer info as a stop-like object
          const formatTransferInfo = (transferInfo?: { city: string; state: string; address?: string; datetime?: string }) => {
            if (!transferInfo) return null;
            let location = "—";
            const parts = [];
            if (transferInfo.address) parts.push(transferInfo.address);
            if (transferInfo.city) parts.push(transferInfo.city);
            if (transferInfo.state) parts.push(transferInfo.state);
            if (parts.length > 0) {
              location = parts.join(", ");
              if (location.length > 30) location = location.substring(0, 30) + "...";
            }
            let date = "—";
            let time = "—";
            if (transferInfo.datetime) {
              const parsed = parseSimpleDateTime(transferInfo.datetime);
              date = parsed.dateString;
              time = parsed.timeString;
            }
            return { id: null, location, date, time };
          };

          // Format pickup/delivery info
          const formatStopInfo = (stop: any, orderStartTime?: string, orderEndTime?: string) => {
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
            const endDatetimeToUse = orderEndTime;
            if (datetimeToUse) {
              const parsed = parseSimpleDateTime(datetimeToUse);
              date = parsed.dateString;
              const startTime = parsed.timeString;
              if (endDatetimeToUse) {
                const parsedEnd = parseSimpleDateTime(endDatetimeToUse);
                const endTime = parsedEnd.timeString;
                if (startTime !== endTime) {
                  time = `${startTime} - ${endTime}`;
                } else {
                  time = startTime;
                }
              } else {
                time = startTime;
              }
            }
            return { id: stop.id, location, date, time };
          };

          // Determine status
          let status = "Available";
          if (currentOrder) {
            switch (currentOrder.status) {
              case "pending": status = "Loading"; break;
              case "in_transit": status = "In Transit"; break;
              case "delivered": status = "Available"; break;
              default: status = "Available";
            }
          }

          return {
            id: `driver-${driver.id}`,
            orderId: currentOrder?.id || null,
            truckNumber: null,
            companyName: driverCompanyName,
            driver: driver.name,
            driver1Name: driver.name,
            driverId: driver.id,
            driverPhone: driver.phone || null,
            driverEmail: driver.email || null,
            driver2Id: null,
            driver2Name: null,
            driver2Phone: null,
            driver2Email: null,
            trailerNumber: null,
            home:
              driver.home_city && driver.home_state
                ? `${driver.home_city}, ${driver.home_state}`
                : driver.home_city || driver.home_state || "—",
            dispatcher: driverDispatcherInfo?.full_name || driverDispatcherInfo?.email || "Unknown",
            dispatcherId: driver.dispatcher_id,
            status,
            pickup: transferStopInfo.transferPickupInfo 
              ? formatTransferInfo(transferStopInfo.transferPickupInfo)! 
              : formatStopInfo(transferStopInfo.effectivePickupStop, currentOrder?.pickup_datetime, currentOrder?.pickup_end_datetime),
            delivery: transferStopInfo.transferDeliveryInfo 
              ? formatTransferInfo(transferStopInfo.transferDeliveryInfo)! 
              : formatStopInfo(
                  transferStopInfo.effectiveDeliveryStop,
                  currentOrder?.delivery_datetime,
                  currentOrder?.delivery_end_datetime,
                ),
            awayDays: currentOrder
              ? Math.floor((Date.now() - new Date(currentOrder.updated_at).getTime()) / (1000 * 60 * 60 * 24))
              : 0,
            driveHours: driver.hos_drive_minutes
              ? `${Math.floor(driver.hos_drive_minutes / 60)}:${String(driver.hos_drive_minutes % 60).padStart(2, "0")}h`
              : "0:00h",
            shiftHours: driver.hos_shift_minutes
              ? `${Math.floor(driver.hos_shift_minutes / 60)}:${String(driver.hos_shift_minutes % 60).padStart(2, "0")}h`
              : "0:00h",
            cycleHours: driver.hos_cycle_minutes
              ? `${Math.floor(driver.hos_cycle_minutes / 60)}:${String(driver.hos_cycle_minutes % 60).padStart(2, "0")}h`
              : "0:00h",
            driveMinutes: driver.hos_drive_minutes || 0,
            shiftMinutes: driver.hos_shift_minutes || 0,
            breakMinutes: driver.hos_break_minutes || 0,
            cycleMinutes: driver.hos_cycle_minutes || 0,
            hosStatus: driver.hos_status || null,
            hosLastUpdated: driver.hos_last_updated || null,
            twoWeekBlockDate: driver.two_week_block_date || null,
            randomDrugTestDate: driver.random_drug_test_date || null,
            note: driverNote?.note || "",
            lastEdit: driverNote?.updated_at
              ? new Date(driverNote.updated_at).toLocaleTimeString()
              : new Date().toLocaleTimeString(),
            editDate: driverNote?.updated_at
              ? new Date(driverNote.updated_at).toLocaleDateString()
              : new Date().toLocaleDateString(),
            allOrders: allOrdersWithStops,
            activeOrders: activeOrders,
            activeOrdersCount: activeOrders.length,
            totalOrdersCount: driverOrders.length || 0,
            hasMultipleOrders: (driverOrders.length || 0) > 1,
            lost_day_notes: [],
            milesAway: 0,
            totalMiles: currentOrder?.loaded_miles || 0,
            goingYard: driver.going_yard || false,
          };
        });

        // Filter unassigned drivers to only include those with a dispatcher
        const unassignedWithDispatcher = unassignedDriverReports.filter((driver) => driver.dispatcherId);

        // Combine truck reports and unassigned driver reports
        const allReports = [...trucksWithDispatcher, ...unassignedWithDispatcher];

        // Group by dispatcher
        const dispatcherMap = new Map<
          string,
          {
            dispatcher: string;
            dispatcherId: string;
            office: string | null;
            ext: string | null;
            trucks: typeof allReports;
            isOffDuty?: boolean;
            originalDispatcherName?: string;
          }
        >();

        for (const report of allReports) {
          if (!dispatcherMap.has(report.dispatcherId)) {
            // PERF: Use pre-indexed map for O(1) lookup
            const dispatcherInfo = dispatchersByUserId.get(report.dispatcherId);
            dispatcherMap.set(report.dispatcherId, {
              dispatcher: report.dispatcher,
              dispatcherId: report.dispatcherId,
              office: dispatcherInfo?.office || null,
              ext: dispatcherInfo?.ext || null,
              trucks: [],
              isOffDuty: false,
            });
          }
          dispatcherMap.get(report.dispatcherId)!.trucks.push(report);
        }

        // Fetch off-duty dispatchers to show their trucks in a separate section
        const { data: offDutyStatuses } = await supabase
          .from("dispatcher_status")
          .select("dispatcher_id, inactive_trucks")
          .eq("is_active", false);

        // Build a map of driver IDs to their original off-duty dispatcher names
        // This is used to show "Disp: [name]" under driver names in active dispatcher sections
        const driverToOffDutyDispatcher = new Map<string, string>();
        
        if (offDutyStatuses && offDutyStatuses.length > 0) {
          for (const offDutyStatus of offDutyStatuses) {
            const inactiveDrivers = (offDutyStatus.inactive_trucks as any[]) || [];
            const offDutyDispatcherInfo = dispatchersByUserId.get(offDutyStatus.dispatcher_id);
            if (!offDutyDispatcherInfo) continue;
            
            const offDutyDispatcherName = offDutyDispatcherInfo.full_name || offDutyDispatcherInfo.email || "Unknown";
            
            // Map each driver to their off-duty dispatcher
            for (const driver of inactiveDrivers) {
              if (driver.id) {
                driverToOffDutyDispatcher.set(driver.id, offDutyDispatcherName);
              }
            }
          }
        }
        
        // Update existing trucks in active dispatcher groups with off-duty dispatcher info
        for (const group of dispatcherMap.values()) {
          for (const truck of group.trucks) {
            if (truck.driverId && driverToOffDutyDispatcher.has(truck.driverId)) {
              (truck as any).originalDispatcherName = driverToOffDutyDispatcher.get(truck.driverId);
            }
          }
        }

        // Create off-duty dispatcher groups with their stored driver data
        const offDutyGroups: typeof dispatcherMap extends Map<string, infer V> ? V[] : never[] = [];
        
        if (offDutyStatuses && offDutyStatuses.length > 0) {
          for (const offDutyStatus of offDutyStatuses) {
            const inactiveDrivers = (offDutyStatus.inactive_trucks as any[]) || [];
            if (inactiveDrivers.length === 0) continue;
            
            const offDutyDispatcherInfo = dispatchersByUserId.get(offDutyStatus.dispatcher_id);
            if (!offDutyDispatcherInfo) continue;
            
            // Skip if this office doesn't match the filter
            if (filterOffice && offDutyDispatcherInfo.office !== filterOffice) continue;
            
            // Store the dispatcher_id for use in the inner scope
            const offDutyDispatcherId = offDutyStatus.dispatcher_id;
            
            // Fetch real driver data for off-duty drivers to get Home, Company, HOS, etc.
            const driverIds = inactiveDrivers.map((d: any) => d.id).filter(Boolean);
            const { data: realDriverData } = driverIds.length > 0 
              ? await supabase
                  .from("drivers")
                  .select("id, name, phone, email, home_city, home_state, company_id, dispatcher_id, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, hos_status, hos_last_updated, do_not_touch_hos")
                  .in("id", driverIds)
              : { data: [] };
            
            // Create a map of real driver data
            const realDriverMap = new Map((realDriverData || []).map(d => [d.id, d]));
            
            // Get company names for off-duty drivers
            const companyIds = [...new Set((realDriverData || []).map(d => d.company_id).filter(Boolean))];
            const { data: companiesData } = companyIds.length > 0
              ? await supabase.from("companies").select("id, name").in("id", companyIds)
              : { data: [] };
            const companyMap = new Map((companiesData || []).map(c => [c.id, c.name]));
            
            // Get truck data for off-duty drivers to get miles_away
            const { data: trucksForOffDuty } = driverIds.length > 0
              ? await supabase
                  .from("trucks")
                  .select("id, truck_number, driver1_id, miles_away")
                  .in("driver1_id", driverIds)
              : { data: [] };
            const truckByDriverId = new Map((trucksForOffDuty || []).map(t => [t.driver1_id, t]));
            
            // Create truck-like objects from the stored driver data with real data enrichment
            const offDutyTrucks = inactiveDrivers.map((driver: any) => {
              // Find the driver's orders
              const driverOrders = ordersByDriver.get(driver.id) || [];
              
              // Build allOrdersWithStops similar to regular trucks
              const allOrdersWithStops = driverOrders
                .filter((order: any) => !order.canceled)
                .map((order: any) => {
                  const orderPickupDrops = order.pickup_drops || [];
                  const pickupStops = orderPickupDrops.filter((pd: any) => pd.type === "pickup");
                  const deliveryStops = orderPickupDrops.filter((pd: any) => pd.type === "delivery" || pd.type === "drop");
                  const pickupStop = pickupStops[0];
                  const deliveryStop = deliveryStops[deliveryStops.length - 1];
                  const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
                  const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
                  
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
                    order_files: order.order_files,
                    pickupStop,
                    deliveryStop,
                    pickupStops,
                    deliveryStops,
                    isActive: !hasPOD && (order.status === 'pending' || order.status === 'in_transit'),
                    isRecentCompleted: hasPOD || order.status === 'delivered',
                    documentStatus: hasPOD ? 'complete' : hasBOL ? 'partial' : 'missing',
                    documentColors: { pod: hasPOD, bol: hasBOL },
                    loadDetails: {
                      loadNumber: order.internal_load_number || "—",
                      companyName: null,
                      brokerLoadNumber: order.broker_load_number || "—",
                      pickupInfo: pickupStop ? { address: pickupStop.address || "—", city: pickupStop.city || "—", state: pickupStop.state || "—", zipCode: pickupStop.zip_code || "", datetime: pickupStop.datetime || order.pickup_datetime || "—", endDatetime: order.pickup_end_datetime || "—" } : null,
                      deliveryInfo: deliveryStop ? { address: deliveryStop.address || "—", city: deliveryStop.city || "—", state: deliveryStop.state || "—", zipCode: deliveryStop.zip_code || "", datetime: deliveryStop.datetime || order.delivery_datetime || "—", endDatetime: order.delivery_end_datetime || "—" } : null,
                      allPickupStops: pickupStops.map((stop: any) => ({ address: stop.address || "—", city: stop.city || "—", state: stop.state || "—", zipCode: stop.zip_code || "", datetime: stop.datetime || order.pickup_datetime || "—", endDatetime: order.pickup_end_datetime || "—" })),
                      allDeliveryStops: deliveryStops.map((stop: any) => ({ address: stop.address || "—", city: stop.city || "—", state: stop.state || "—", zipCode: stop.zip_code || "", datetime: stop.datetime || order.delivery_datetime || "—", endDatetime: order.delivery_end_datetime || "—" })),
                      documents: (order.order_files || []).map((file: any) => ({ category: file.file_category })),
                      notes: order.notes || "—",
                    },
                  };
                }) || [];
              
              // Determine current order
              let currentOrder: typeof allOrdersWithStops[0] | null = null;
              const allSortedOrders = allOrdersWithStops
                .filter((order) => !order.canceled && order.notes !== "GAME|OVER")
                .sort((a, b) => {
                  const aPickup = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : Infinity;
                  const bPickup = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : Infinity;
                  return aPickup - bPickup;
                });
              
              if (allSortedOrders.length > 0) {
                const lastOrder = allSortedOrders[allSortedOrders.length - 1];
                const lastOrderHasBOL = lastOrder.order_files?.some((file: any) => file.file_category === 'BOL');
                if (lastOrderHasBOL) {
                  currentOrder = lastOrder;
                } else if (allSortedOrders.length >= 2) {
                  const previousOrder = allSortedOrders[allSortedOrders.length - 2];
                  const previousHasPOD = previousOrder.order_files?.some((file: any) => file.file_category === 'POD');
                  if (previousHasPOD) {
                    currentOrder = lastOrder;
                  } else {
                    const lastWithBOL = [...allSortedOrders].reverse().find(order =>
                      order.order_files?.some((file: any) => file.file_category === 'BOL')
                    );
                    currentOrder = lastWithBOL || lastOrder;
                  }
                } else {
                  currentOrder = lastOrder;
                }
              }
              
              // Format pickup/delivery info
              const formatStopInfo = (stop: any, orderStartTime?: string, orderEndTime?: string) => {
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
              
              // Determine status
              let truckStatus = "Available";
              if (currentOrder) {
                switch (currentOrder.status) {
                  case "pending": truckStatus = "Loading"; break;
                  case "in_transit": truckStatus = "In Transit"; break;
                  case "delivered": truckStatus = "Available"; break;
                  default: truckStatus = "Available";
                }
              }
              
              // Get real driver data for enrichment
              const realDriver = realDriverMap.get(driver.id);
              const truckData = truckByDriverId.get(driver.id);
              const driverCompanyName = realDriver?.company_id ? companyMap.get(realDriver.company_id) || null : null;
              
              // Build home string from real driver data
              const homeCity = realDriver?.home_city;
              const homeState = realDriver?.home_state;
              const homeString = homeCity && homeState
                ? `${homeCity}, ${homeState}`
                : homeCity || homeState || "—";
              
              // Build HOS data from real driver data
              const driveMinutes = realDriver?.hos_drive_minutes || 0;
              const shiftMinutes = realDriver?.hos_shift_minutes || 0;
              const breakMinutes = realDriver?.hos_break_minutes || 0;
              const cycleMinutes = realDriver?.hos_cycle_minutes || 0;
              
              const formatHosTime = (minutes: number) => 
                `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}h`;
              
              return {
                id: truckData?.id || driver.truck?.id || `driver-${driver.id}`,
                orderId: currentOrder?.id || null,
                truckNumber: truckData?.truck_number || driver.truck?.truck_number || null,
                companyName: driverCompanyName,
                driver: driver.name,
                driver1Name: driver.name,
                driverId: driver.id,
                driverPhone: realDriver?.phone || driver.phone || null,
                driverEmail: realDriver?.email || driver.email || null,
                driver2Id: null,
                driver2Name: null,
                driver2Phone: null,
                driver2Email: null,
                trailerNumber: null,
                home: homeString,
                dispatcher: offDutyDispatcherInfo?.full_name || offDutyDispatcherInfo?.email || "Unknown",
                dispatcherId: offDutyDispatcherId,
                // Get current dispatcher name for drivers in off-duty section
                currentDispatcherName: realDriver?.dispatcher_id 
                  ? (dispatchersByUserId.get(realDriver.dispatcher_id)?.full_name || 
                     dispatchersByUserId.get(realDriver.dispatcher_id)?.email || null)
                  : null,
                status: truckStatus,
                pickup: formatStopInfo(currentOrder?.pickupStop, currentOrder?.pickup_datetime, currentOrder?.pickup_end_datetime),
                delivery: formatStopInfo(currentOrder?.deliveryStop, currentOrder?.delivery_datetime, currentOrder?.delivery_end_datetime),
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
                note: "",
                lastEdit: new Date().toLocaleTimeString(),
                editDate: new Date().toLocaleDateString(),
                allOrders: allOrdersWithStops,
                activeOrders: allOrdersWithStops.filter(o => o.isActive),
                activeOrdersCount: allOrdersWithStops.filter(o => o.isActive).length,
                totalOrdersCount: driverOrders.length || 0,
                hasMultipleOrders: (driverOrders.length || 0) > 1,
                lost_day_notes: [],
                milesAway: truckData?.miles_away || 0,
                totalMiles: currentOrder?.loaded_miles || 0,
                goingYard: false,
                isOffDutyDriver: true,
              };
            });
            
            if (offDutyTrucks.length > 0) {
              offDutyGroups.push({
                dispatcher: offDutyDispatcherInfo.full_name || offDutyDispatcherInfo.email || "Unknown",
                dispatcherId: `off-duty-${offDutyDispatcherId}`,
                office: offDutyDispatcherInfo.office || null,
                ext: offDutyDispatcherInfo.ext || null,
                trucks: offDutyTrucks,
                isOffDuty: true,
                originalDispatcherName: offDutyDispatcherInfo.full_name || offDutyDispatcherInfo.email || "Unknown",
              });
            }
          }
        }

        // Convert Map to array and add off-duty groups
        const groupedData = [...Array.from(dispatcherMap.values()), ...offDutyGroups];

        // Get current user to sort their dispatcher section first
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Sort so current user's dispatcher appears first, off-duty dispatchers last
        if (user) {
          groupedData.sort((a, b) => {
            // Off-duty dispatchers always go to the end
            if (a.isOffDuty && !b.isOffDuty) return 1;
            if (!a.isOffDuty && b.isOffDuty) return -1;
            
            const aIsCurrentUser = a.dispatcherId === user.id;
            const bIsCurrentUser = b.dispatcherId === user.id;

            if (aIsCurrentUser && !bIsCurrentUser) return -1;
            if (!aIsCurrentUser && bIsCurrentUser) return 1;
            return 0;
          });
        }

        return groupedData;
  };

  // Priority query - loads only user's office for fast initial display
  const priorityQuery = useQuery({
    queryKey: ["reports", "priority", priorityOffice],
    queryFn: () => queryWithTimeout(() => fetchReportsData(priorityOffice || null)),
    enabled: !disableFetch, // Disabled when used for mutations-only
    retry: 1,
    retryDelay: 1000,
    staleTime: 300000,
    gcTime: 600000,
    refetchOnWindowFocus: false,
    refetchInterval: disableFetch ? false : 120000,
  });

  // Background query - loads ALL data after priority is ready
  const backgroundQuery = useQuery({
    queryKey: ["reports", "full"],
    queryFn: () => queryWithTimeout(() => fetchReportsData(null)),
    enabled: !disableFetch && priorityQuery.isSuccess, // Only start after priority loads, disabled when mutations-only
    retry: 1,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 300000,
    gcTime: 600000,
    refetchOnWindowFocus: false,
    refetchInterval: disableFetch ? false : 300000,
  });

  // Merge: use background data if available, otherwise priority data
  // Keep priority data as-is while background loads - don't swap mid-interaction
  const mergedData = disableFetch ? null : (backgroundQuery.data ?? priorityQuery.data);
  
  const reportsQuery = {
    data: mergedData,
    isLoading: disableFetch ? false : priorityQuery.isLoading, // Only show loading for priority
    isPending: priorityQuery.isPending,
    isError: priorityQuery.isError && backgroundQuery.isError,
    error: priorityQuery.error ?? backgroundQuery.error,
    isSuccess: priorityQuery.isSuccess || backgroundQuery.isSuccess,
    isFetchingBackground: backgroundQuery.isFetching && !backgroundQuery.isLoading, // Indicates background is loading
    refetch: async () => {
      await Promise.all([priorityQuery.refetch(), backgroundQuery.refetch()]);
    },
  };

  return {
    ...reportsQuery,
    updateTruckStatus,
    updateTruckMilesAway,
    updateTruckNote,
    updatePickupDrop,
    updateLostDayNote,
    updatePickupDropArrival,
    updateCheckInOutTimes,
    markGoingToPickup,
    markGoingToDelivery,
  };
};
