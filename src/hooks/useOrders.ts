import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UseOrdersOptions {
  bookedBy?: string | null;
}

export const useOrders = (options?: UseOrdersOptions) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['orders', options?.bookedBy],
    queryFn: async () => {
      console.log("[useOrders] Fetching first 500 orders from materialized view...");
      
      const initialBatchSize = 500;
      const batchSize = 1000;
      
      // Fetch first 500 orders immediately
      let initialQuery = supabase
        .from("orders_materialized_view")
        .select("*")
        .order("created_at", { ascending: false })
        .range(0, initialBatchSize - 1);

      if (options?.bookedBy) {
        initialQuery = initialQuery.eq("booked_by", options.bookedBy);
      }

      const { data: initialBatch, error: initialError } = await initialQuery;

      if (initialError) {
        console.error("[useOrders] Error:", initialError);
        throw initialError;
      }

      console.log(`[useOrders] Loaded initial ${initialBatch?.length || 0} orders, loading rest in background...`);

      // Continue loading remaining orders in background
      if (initialBatch && initialBatch.length === initialBatchSize) {
        setTimeout(async () => {
          try {
            const backgroundOrders = [...initialBatch];
            let offset = initialBatchSize;
            let hasMore = true;

            while (hasMore) {
              let bgQuery = supabase
                .from("orders_materialized_view")
                .select("*")
                .order("created_at", { ascending: false })
                .range(offset, offset + batchSize - 1);

              if (options?.bookedBy) {
                bgQuery = bgQuery.eq("booked_by", options.bookedBy);
              }

              const { data: batch, error: batchError } = await bgQuery;

              if (batchError || !batch || batch.length === 0) {
                hasMore = false;
                break;
              }

              backgroundOrders.push(...batch);
              offset += batchSize;

              if (batch.length < batchSize) {
                hasMore = false;
              }
            }

            console.log(`[useOrders] Background loading complete: ${backgroundOrders.length} total orders`);
            
            // Update the cache with all orders - transform the data
            queryClient.setQueryData(['orders', options?.bookedBy], transformOrders(backgroundOrders));
          } catch (error) {
            console.error("[useOrders] Background loading error:", error);
          }
        }, 0);
      }

      const allOrders = initialBatch || [];

      // Transform and return initial batch
      return transformOrders(allOrders);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    staleTime: 5 * 60 * 1000, // Data refreshes every 5 minutes via materialized view
  });

  return query;
};

// Helper function to transform orders data
function transformOrders(allOrders: any[]) {
  return (allOrders || []).map((order: any) => {
        // Parse JSONB fields back to arrays
        const pickupDrops = Array.isArray(order.pickup_drops) ? order.pickup_drops : [];
        const orderFiles = Array.isArray(order.order_files) ? order.order_files : [];

        // Extract pickup and delivery information
        const firstPickup = pickupDrops.find((pd: any) => pd.type === 'pickup');
        const lastDelivery = pickupDrops.filter((pd: any) => pd.type === 'delivery').pop();

        // Calculate total driver pay
        const totalDriverPay = 
          (order.driver_price || 0) +
          (order.detention_driver || 0) +
          (order.layover_driver || 0) +
          (order.tonu_driver || 0) +
          (order.extra_stop_driver || 0) +
          (order.lumper_driver || 0) +
          (order.late_fee_driver || 0) +
          (order.no_tracking_fee_driver || 0) +
          (order.wrong_address_fee_driver || 0) +
          (order.other_charges_driver || 0);

        // Calculate total freight amount
        const totalFreightAmount = 
          (order.freight_amount || 0) +
          (order.detention || 0) +
          (order.layover || 0) +
          (order.tonu || 0) +
          (order.extra_stop || 0) +
          (order.lumper || 0) +
          (order.late_fee || 0) +
          (order.no_tracking_fee || 0) +
          (order.wrong_address_fee || 0) +
          (order.escort_fee || 0) +
          (order.other_charges || 0);

        // Filter files by category
        const rcFiles = orderFiles.filter((f: any) => f.file_category === 'RC');
        const podFiles = orderFiles.filter((f: any) => f.file_category === 'POD');
        const bolFiles = orderFiles.filter((f: any) => f.file_category === 'BOL');

        // Transform to camelCase with computed fields
        return {
          // Basic fields
          id: order.id,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          loadNumber: order.load_number,
          internalLoadNumber: order.internal_load_number,
          brokerLoadNumber: order.broker_load_number,
          status: order.status,
          locked: order.locked,
          canceled: order.canceled,
          invoiced: order.invoiced,
          isRecovery: order.is_recovery,
          
          // Truck and equipment
          truckNumber: order.truck_number,
          truckId: order.truck_id,
          truckCompanyName: order.truck_company_name,
          truckCompanyId: order.truck_company_id,
          trailerNumber: order.trailer_number,
          trailerId: order.trailer_id,
          
          // Driver info
          driverName: order.driver1_name,
          driver1Name: order.driver1_name,
          driver2Name: order.driver2_name,
          driver1Id: order.driver1_id,
          driver2Id: order.driver2_id,
          
          // Broker info
          brokerName: order.broker_name,
          brokerAddress: order.broker_address,
          brokerMcNumber: order.broker_mc_number,
          brokerId: order.broker_id,
          
          // Company info
          companyName: order.company_name,
          companyId: order.company_id,
          bookedBy: order.booked_by,
          bookedByCompanyId: order.booked_by_company_id,
          bookedByCompanyName: order.booked_by_company_name,
          
          // Pickup/Delivery extracted info
          pickupDate: firstPickup?.datetime ? new Date(firstPickup.datetime).toLocaleDateString() : '',
          pickupCity: firstPickup?.city || '',
          pickupState: firstPickup?.state || '',
          deliveryDate: lastDelivery?.datetime ? new Date(lastDelivery.datetime).toLocaleDateString() : '',
          deliveryCity: lastDelivery?.city || '',
          deliveryState: lastDelivery?.state || '',
          
          // Financial fields - broker amounts
          freightAmount: order.freight_amount,
          detention: order.detention,
          layover: order.layover,
          tonu: order.tonu,
          extraStop: order.extra_stop,
          lumper: order.lumper,
          lateFee: order.late_fee,
          noTrackingFee: order.no_tracking_fee,
          wrongAddressFee: order.wrong_address_fee,
          escortFee: order.escort_fee,
          escortFeeBrokerPaid: order.escort_fee_broker_paid,
          otherCharges: order.other_charges,
          totalFreightAmount,
          
          // Financial fields - driver amounts
          driverPrice: order.driver_price,
          detentionDriver: order.detention_driver,
          layoverDriver: order.layover_driver,
          tonuDriver: order.tonu_driver,
          extraStopDriver: order.extra_stop_driver,
          lumperDriver: order.lumper_driver,
          lateFeeDriver: order.late_fee_driver,
          noTrackingFeeDriver: order.no_tracking_fee_driver,
          wrongAddressFeeDriver: order.wrong_address_fee_driver,
          otherChargesDriver: order.other_charges_driver,
          totalDriverPay,
          
          // Mileage fields
          loadedMiles: order.loaded_miles,
          dhMiles: order.dh_miles,
          mileage: order.mileage,
          
          // Recovery fields
          recoveryDate: order.recovery_date,
          recoveryMiles: order.recovery_miles,
          recoveryFreightAmount: order.recovery_freight_amount,
          recoveryDriverPrice: order.recovery_driver_price,
          
          // Original values
          originalMiles: order.original_miles,
          originalFreightAmount: order.original_freight_amount,
          originalDriverPrice: order.original_driver_price,
          originalLoadedMiles: order.original_loaded_miles,
          originalDhMiles: order.original_dh_miles,
          originalDetention: order.original_detention,
          originalDetentionDriver: order.original_detention_driver,
          originalLayover: order.original_layover,
          originalLayoverDriver: order.original_layover_driver,
          originalTonu: order.original_tonu,
          originalTonuDriver: order.original_tonu_driver,
          originalExtraStop: order.original_extra_stop,
          originalExtraStopDriver: order.original_extra_stop_driver,
          originalLumper: order.original_lumper,
          originalLumperDriver: order.original_lumper_driver,
          originalLateFee: order.original_late_fee,
          originalLateFeeDriver: order.original_late_fee_driver,
          originalNoTrackingFee: order.original_no_tracking_fee,
          originalNoTrackingFeeDriver: order.original_no_tracking_fee_driver,
          originalWrongAddressFee: order.original_wrong_address_fee,
          originalWrongAddressFeeDriver: order.original_wrong_address_fee_driver,
          originalEscortFee: order.original_escort_fee,
          originalEscortFeeBrokerPaid: order.original_escort_fee_broker_paid,
          originalOtherCharges: order.original_other_charges,
          originalOtherChargesDriver: order.original_other_charges_driver,
          originalNotes: order.original_notes,
          originalTruckNumber: order.original_truck_number,
          originalTrailerNumber: order.original_trailer_number,
          originalDriver1Name: order.original_driver1_name,
          originalDriver2Name: order.original_driver2_name,
          originalTruckId: order.original_truck_id,
          originalTrailerId: order.original_trailer_id,
          originalDriver1Id: order.original_driver1_id,
          originalDriver2Id: order.original_driver2_id,
          
          // Other fields
          notes: order.notes,
          commodity: order.commodity,
          weight: order.weight,
          poNumber: order.po_number,
          puNumber: order.pu_number,
          referenceNumber: order.reference_number,
          pickupDatetime: order.pickup_datetime,
          pickupEndDatetime: order.pickup_end_datetime,
          deliveryDatetime: order.delivery_datetime,
          deliveryEndDatetime: order.delivery_end_datetime,
          dateChangeNotes: order.date_change_notes,
          
          // Nested objects for compatibility
          trucks: order.truck_number ? {
            truck_number: order.truck_number,
            company: order.truck_company_id ? {
              id: order.truck_company_id,
              name: order.truck_company_name
            } : null
          } : null,
          trailers: order.trailer_number ? {
            trailer_number: order.trailer_number
          } : null,
          drivers: order.driver1_name ? {
            name: order.driver1_name
          } : null,
          driver2: order.driver2_name ? {
            name: order.driver2_name
          } : null,
          original_driver1: order.original_driver1_name ? {
            name: order.original_driver1_name
          } : null,
          original_driver2: order.original_driver2_name ? {
            name: order.original_driver2_name
          } : null,
          original_truck: order.original_truck_number ? {
            truck_number: order.original_truck_number
          } : null,
          original_trailer: order.original_trailer_number ? {
            trailer_number: order.original_trailer_number
          } : null,
          brokers: order.broker_name ? {
            name: order.broker_name,
            address: order.broker_address,
            mc_number: order.broker_mc_number
          } : null,
          company: order.company_name ? {
            id: order.company_id,
            name: order.company_name
          } : null,
          booked_by_company: order.booked_by_company_name ? {
            id: order.booked_by_company_id,
            name: order.booked_by_company_name
          } : null,
          
          // Arrays
          pickup_drops: pickupDrops,
          order_files: orderFiles,
          rcFiles,
          podFiles,
          bolFiles,
        };
      });
}
