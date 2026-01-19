import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface UseOrdersRealtimeOptions {
  bookedBy?: string | null;
  dispatcherUserId?: string | null;
}

/**
 * Hook that subscribes to real-time changes on orders and related tables.
 * Updates the React Query cache directly via setQueryData to avoid expensive refetches.
 */
export function useOrdersRealtime(options?: UseOrdersRealtimeOptions) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const queryKey = ["orders", options?.bookedBy, options?.dispatcherUserId];

    // Helper to fetch a single order with all joins
    const fetchSingleOrder = async (orderId: string) => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          pickup_drops (*),
          order_files (*),
          order_transfers (
            *,
            driver1:drivers!order_transfers_driver1_id_fkey (id, name),
            driver2:drivers!order_transfers_driver2_id_fkey (id, name),
            truck:trucks!order_transfers_truck_id_fkey (id, truck_number),
            trailer:trailers!order_transfers_trailer_id_fkey (id, trailer_number)
          ),
          recovery_history (
            *,
            recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (id, name),
            recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (id, name),
            recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (id, truck_number),
            recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (id, trailer_number)
          ),
          broker:brokers (id, name, mc_number, address),
          company:companies!orders_company_id_fkey (id, name),
          booked_by_company:companies!orders_booked_by_company_id_fkey (id, name),
          truck:trucks!orders_truck_id_fkey (id, truck_number, company:companies (id, name)),
          trailer:trailers!orders_trailer_id_fkey (id, trailer_number),
          driver1:drivers!orders_driver1_id_fkey (id, name, company_id, company:companies (id, name)),
          driver2:drivers!orders_driver2_id_fkey (id, name, company_id, company:companies (id, name)),
          original_driver1:drivers!orders_original_driver1_id_fkey (id, name),
          original_driver2:drivers!orders_original_driver2_id_fkey (id, name),
          original_truck:trucks!orders_original_truck_id_fkey (id, truck_number),
          original_trailer:trailers!orders_original_trailer_id_fkey (id, trailer_number)
        `
        )
        .eq("id", orderId)
        .single();

      if (error || !data) return null;
      return data;
    };

    // Transform raw order to match the expected structure
    const transformOrder = (order: any) => {
      const toNum = (val: any): number => {
        if (val === null || val === undefined || val === "" || val === "null") return 0;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      };

      const pickupDrops = Array.isArray(order.pickup_drops) ? order.pickup_drops : [];
      const orderFiles = Array.isArray(order.order_files) ? order.order_files : [];
      const firstPickup = pickupDrops.find((pd: any) => pd.type === "pickup");
      const lastDelivery = pickupDrops.filter((pd: any) => pd.type === "delivery").pop();

      const totalDriverPay =
        toNum(order.driver_price) +
        toNum(order.detention_driver) +
        toNum(order.layover_driver) +
        toNum(order.tonu_driver) +
        toNum(order.extra_stop_driver) +
        toNum(order.lumper_driver) -
        toNum(order.late_fee_driver) -
        toNum(order.no_tracking_fee_driver) -
        toNum(order.wrong_address_fee_driver) +
        toNum(order.other_charges_driver);

      const totalFreightAmount =
        toNum(order.freight_amount) +
        toNum(order.detention) +
        toNum(order.layover) +
        toNum(order.tonu) +
        toNum(order.extra_stop) +
        toNum(order.lumper) -
        toNum(order.late_fee) -
        toNum(order.no_tracking_fee) -
        toNum(order.wrong_address_fee) -
        toNum(order.other_charges) +
        toNum(order.other_additionals) +
        toNum(order.escort_fee);

      const rcFiles = orderFiles.filter((f: any) => f.file_category === "RC");
      const podFiles = orderFiles.filter((f: any) => f.file_category === "POD");
      const bolFiles = orderFiles.filter((f: any) => f.file_category === "BOL");

      return {
        ...order,
        id: order.id,
        loadNumber: order.load_number,
        internalLoadNumber: order.internal_load_number,
        brokerLoadNumber: order.broker_load_number,
        pickupDatetime: order.pickup_datetime,
        pickupEndDatetime: order.pickup_end_datetime,
        deliveryDatetime: order.delivery_datetime,
        deliveryEndDatetime: order.delivery_end_datetime,
        freightAmount: toNum(order.freight_amount),
        driverPrice: toNum(order.driver_price),
        totalFreightAmount,
        totalDriverPay,
        loadedMiles: toNum(order.loaded_miles),
        dhMiles: toNum(order.dh_miles),
        mileage: toNum(order.mileage) || (toNum(order.loaded_miles) + toNum(order.dh_miles)),
        notes: order.notes,
        status: order.status,
        locked: order.locked,
        canceled: order.canceled,
        paid: order.paid,
        invoiced: order.invoiced,
        bookedBy: order.booked_by,
        detention: toNum(order.detention),
        detentionDriver: toNum(order.detention_driver),
        layover: toNum(order.layover),
        layoverDriver: toNum(order.layover_driver),
        tonu: toNum(order.tonu),
        tonuDriver: toNum(order.tonu_driver),
        extraStop: toNum(order.extra_stop),
        extraStopDriver: toNum(order.extra_stop_driver),
        lumper: toNum(order.lumper),
        lumperDriver: toNum(order.lumper_driver),
        lateFee: toNum(order.late_fee),
        lateFeeDriver: toNum(order.late_fee_driver),
        noTrackingFee: toNum(order.no_tracking_fee),
        noTrackingFeeDriver: toNum(order.no_tracking_fee_driver),
        wrongAddressFee: toNum(order.wrong_address_fee),
        wrongAddressFeeDriver: toNum(order.wrong_address_fee_driver),
        otherCharges: toNum(order.other_charges),
        otherChargesDriver: toNum(order.other_charges_driver),
        otherChargesReason: order.other_charges_reason,
        otherAdditionals: toNum(order.other_additionals),
        otherAdditionalsDriver: toNum(order.other_additionals_driver),
        otherAdditionalsReason: order.other_additionals_reason,
        escortFee: toNum(order.escort_fee),
        escortFeeBrokerPaid: order.escort_fee_broker_paid,
        commodity: order.commodity,
        weight: order.weight,
        puNumber: order.pu_number,
        poNumber: order.po_number,
        referenceNumber: order.reference_number,
        isPartial: order.is_partial,
        isRecovery: order.is_recovery,
        recoveryDate: order.recovery_date,
        recoveryMiles: toNum(order.recovery_miles),
        recoveryFreightAmount: toNum(order.recovery_freight_amount),
        recoveryDriverPrice: toNum(order.recovery_driver_price),
        additionalMiles: toNum(order.additional_miles),
        dateChangeNotes: order.date_change_notes,
        deletedDriver1Name: order.deleted_driver1_name,
        deletedDriver2Name: order.deleted_driver2_name,
        deletedTruckNumber: order.deleted_truck_number,
        deletedTrailerNumber: order.deleted_trailer_number,
        lumperRevisedRcPath: order.lumper_revised_rc_path,
        partialBrokers: order.partial_brokers,
        partialBrokerLoads: order.partial_broker_loads,
        partialBookedByCompanies: order.partial_booked_by_companies,
        companyId: order.company_id,
        bookedByCompanyId: order.booked_by_company_id,
        truckId: order.truck_id,
        trailerId: order.trailer_id,
        driver1Id: order.driver1_id,
        driver2Id: order.driver2_id,
        brokerId: order.broker_id,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        truck: order.truck,
        trailer: order.trailer,
        driver1: order.driver1,
        driver2: order.driver2,
        broker: order.broker,
        company: order.company,
        bookedByCompany: order.booked_by_company,
        originalDriver1: order.original_driver1,
        originalDriver2: order.original_driver2,
        originalTruck: order.original_truck,
        originalTrailer: order.original_trailer,
        pickupDrops,
        orderFiles,
        orderTransfers: order.order_transfers || [],
        recoveryHistory: order.recovery_history || [],
        rcFiles,
        podFiles,
        bolFiles,
        pickupAddress: firstPickup?.address || "",
        pickupCity: firstPickup?.city || "",
        pickupState: firstPickup?.state || "",
        deliveryAddress: lastDelivery?.address || "",
        deliveryCity: lastDelivery?.city || "",
        deliveryState: lastDelivery?.state || "",
      };
    };

    // Handle order changes
    const handleOrderChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const eventType = payload.eventType;
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;

      console.log(`[Realtime] Order ${eventType}:`, newRecord?.id || oldRecord?.id);

      if (eventType === "DELETE") {
        // Remove from cache
        queryClient.setQueryData(queryKey, (old: any[] | undefined) => {
          if (!old) return old;
          return old.filter((o) => o.id !== oldRecord.id);
        });
        return;
      }

      // For INSERT and UPDATE, fetch the full order with joins
      const orderId = newRecord?.id;
      if (!orderId) return;

      const fullOrder = await fetchSingleOrder(orderId);
      if (!fullOrder) return;

      const transformedOrder = transformOrder(fullOrder);

      queryClient.setQueryData(queryKey, (old: any[] | undefined) => {
        if (!old) return [transformedOrder];

        const existingIndex = old.findIndex((o) => o.id === orderId);
        if (existingIndex >= 0) {
          // Update existing order
          const updated = [...old];
          updated[existingIndex] = transformedOrder;
          return updated;
        } else {
          // Insert new order at the beginning
          return [transformedOrder, ...old];
        }
      });
    };

    // Handle related table changes (pickup_drops, order_files, order_transfers)
    const handleRelatedTableChange = async (
      payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
    ) => {
      const newRecord = payload.new as any;
      const oldRecord = payload.old as any;
      const orderId = newRecord?.order_id || oldRecord?.order_id;

      if (!orderId) return;

      console.log(`[Realtime] Related table change for order:`, orderId);

      // Fetch the full updated order
      const fullOrder = await fetchSingleOrder(orderId);
      if (!fullOrder) return;

      const transformedOrder = transformOrder(fullOrder);

      queryClient.setQueryData(queryKey, (old: any[] | undefined) => {
        if (!old) return old;

        const existingIndex = old.findIndex((o) => o.id === orderId);
        if (existingIndex >= 0) {
          const updated = [...old];
          updated[existingIndex] = transformedOrder;
          return updated;
        }
        return old;
      });
    };

    // Create channel and subscribe
    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        handleOrderChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_drops" },
        handleRelatedTableChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_files" },
        handleRelatedTableChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_transfers" },
        handleRelatedTableChange
      )
      .subscribe((status) => {
        console.log("[Realtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      console.log("[Realtime] Unsubscribing from orders channel");
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient, options?.bookedBy, options?.dispatcherUserId]);
}
