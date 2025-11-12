import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { parseSimpleDateTime } from "@/utils/dateUtils";

// Utility function to add timeout protection to queries
const queryWithTimeout = async <T>(queryFn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout - please check your connection')), timeoutMs)
  );
  return Promise.race([queryFn(), timeoutPromise]);
};

export const useOrders = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscriptions for orders and related tables
  useEffect(() => {
    const channel = supabase
      .channel('orders-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_drops'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_files'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trucks'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drivers'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'brokers'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'companies'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      console.log('🔍 Fetching orders...');
      
      return queryWithTimeout(async () => {
        // Check if we have cached data
        const cachedData = queryClient.getQueryData<any[]>(['orders']);
        
        // If we have cached data, only fetch new orders (created after the most recent one)
        if (cachedData && cachedData.length > 0) {
          const mostRecentDate = cachedData[0]?.created_at;
          
          if (mostRecentDate) {
            console.log('📥 Fetching only new orders since:', mostRecentDate);
            
            const { data: newOrders, error } = await supabase
              .from('orders')
              .select(`
                *,
                truck:trucks!truck_id(truck_number, company:companies(name)),
                trailer:trailers!trailer_id(trailer_number),
                driver1:drivers!driver1_id(name),
                original_driver1:drivers!original_driver1_id(name),
                original_truck:trucks!original_truck_id(truck_number),
                broker:brokers!broker_id(name, address),
                company:companies!company_id(name),
                booked_by_company:companies!booked_by_company_id(name),
                pickup_drops(type, city, state, zip_code, datetime, address),
                order_files(id, file_name, file_path, file_size, content_type, file_category),
                escort_fee,
                escort_fee_broker_paid,
                is_recovery,
                original_miles,
                original_freight_amount,
                original_driver_price,
                recovery_miles,
                recovery_freight_amount,
                recovery_driver_price,
                recovery_date
              `)
              .gt('created_at', mostRecentDate)
              .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            if (newOrders && newOrders.length > 0) {
              console.log(`✅ Found ${newOrders.length} new orders`);
              // Merge new orders with cached data
              const allOrders = [...newOrders, ...cachedData];
              
              // Transform and return
              const transformedOrders = allOrders.map((order: any) => {
                const pickupLocation = order.pickup_drops?.find((pd: any) => pd.type === 'pickup');
                const deliveryLocation = order.pickup_drops?.find((pd: any) => pd.type === 'delivery');
                
                const formatDateRange = (startDate: string, endDate: string) => {
                  if (!startDate) return 'N/A';
                  const parsed = parseSimpleDateTime(startDate);
                  return parsed.dateString;
                };
                
                const totalMileage = (order.loaded_miles || 0) + (order.dh_miles || 0) || order.mileage || 0;
                
                return {
                  id: order.id,
                  truckId: order.truck_id,
                  driver1Id: order.driver1_id,
                  truckNumber: order.truck?.truck_number || 'N/A',
                  trailerNumber: order.trailer?.trailer_number || 'N/A',
                  truckCompanyName: order.truck?.company?.name || 'N/A',
                  internalLoadNumber: order.internal_load_number?.toString() || 'N/A',
                  pickupDate: formatDateRange(order.pickup_datetime, order.pickup_end_datetime),
                  pickupCity: pickupLocation?.city || 'N/A',
                  pickupState: pickupLocation?.state || 'N/A',
                  deliveryDate: formatDateRange(order.delivery_datetime, order.delivery_end_datetime),
                  deliveryCity: deliveryLocation?.city || 'N/A',
                  deliveryState: deliveryLocation?.state || 'N/A',
                  mileage: totalMileage,
                  driverPrice: order.driver_price || 0,
                  detentionDriver: order.detention_driver || 0,
                  layoverDriver: order.layover_driver || 0,
                  extraStopDriver: order.extra_stop_driver || 0,
                  lumperDriver: order.lumper_driver || 0,
                  lateFeeDriver: order.late_fee_driver || 0,
                  tonuDriver: order.tonu_driver || 0,
                  noTrackingFeeDriver: order.no_tracking_fee_driver || 0,
                  wrongAddressFeeDriver: order.wrong_address_fee_driver || 0,
                  totalDriverPay: (order.driver_price || 0) + (order.detention_driver || 0) + (order.layover_driver || 0) - (order.late_fee_driver || 0) - (order.no_tracking_fee_driver || 0) - (order.wrong_address_fee_driver || 0) + (order.tonu_driver || 0),
                  driverName: order.driver1?.name || 'N/A',
                  brokerName: order.broker?.name || 'N/A',
                  brokerAddress: order.broker?.address || '',
                  brokerLoadNumber: order.broker_load_number || 'N/A',
                  invoiced: order.invoiced ? 'Done' : '',
                  freightAmount: order.freight_amount || 0,
                  detention: order.detention || 0,
                  layover: order.layover || 0,
                  extraStop: order.extra_stop || 0,
                  lumper: order.lumper || 0,
                  lateFee: order.late_fee || 0,
                  tonu: order.tonu || 0,
                  escortFee: order.escort_fee || 0,
                  escortFeeBrokerPaid: order.escort_fee_broker_paid || false,
                  totalFreightAmount: (order.freight_amount || 0) + (order.detention || 0) + (order.layover || 0) + (order.extra_stop || 0) + (order.lumper || 0) + (order.tonu || 0) - (order.late_fee || 0) + (order.escort_fee_broker_paid ? (order.escort_fee || 0) : 0),
                  notes: order.notes || '',
                  bookedBy: order.booked_by || 'N/A',
                  companyName: order.booked_by_company?.name || 'N/A',
                  locked: order.locked || false,
                  canceled: order.canceled || false,
                  status: order.status || 'pending',
                  createdAt: order.created_at,
                  deliveryDatetime: order.delivery_datetime,
                  deliveryEndDatetime: order.delivery_end_datetime,
                  dateChangeNotes: order.date_change_notes || '',
                  files: order.order_files || [],
                  rcFiles: order.order_files?.filter((f: any) => f.file_category === 'RC') || [],
                  bolFiles: order.order_files?.filter((f: any) => f.file_category === 'BOL') || [],
                  podFiles: order.order_files?.filter((f: any) => f.file_category === 'POD') || [],
                  additionalFiles: order.order_files?.filter((f: any) => f.file_category === 'ADDITIONAL') || [],
                  isRecovery: order.is_recovery || false,
                  originalDriverName: order.original_driver1?.name || null,
                  originalTruckNumber: order.original_truck?.truck_number || null,
                  originalMiles: order.original_miles || 0,
                  originalFreightAmount: order.original_freight_amount || 0,
                  originalDriverPrice: order.original_driver_price || 0,
                  recoveryMiles: order.recovery_miles || 0,
                  recoveryFreightAmount: order.recovery_freight_amount || 0,
                  recoveryDriverPrice: order.recovery_driver_price || 0,
                  recoveryDate: order.recovery_date || null,
                  pickup_drops: order.pickup_drops || [],
                };
              });
              
              return transformedOrders;
            } else {
              console.log('✅ No new orders, using cached data');
            }
          }
        }
        
        // If no cached data or mostRecentDate, fetch all orders
        console.log('📥 Fetching all orders (no cache)...');
        let allOrders: any[] = [];
        let from = 0;
        const batchSize = 1000;
        
        while (true) {
          console.log(`🔍 Fetching orders batch ${from / batchSize + 1}...`);
          
          const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            truck:trucks!truck_id(truck_number, company:companies(name)),
            trailer:trailers!trailer_id(trailer_number),
            driver1:drivers!driver1_id(name),
            original_driver1:drivers!original_driver1_id(name),
            original_truck:trucks!original_truck_id(truck_number),
            broker:brokers!broker_id(name, address),
            company:companies!company_id(name),
            booked_by_company:companies!booked_by_company_id(name),
            pickup_drops(type, city, state, zip_code, datetime, address),
            order_files(id, file_name, file_path, file_size, content_type, file_category),
            escort_fee,
            escort_fee_broker_paid,
            is_recovery,
            original_miles,
            original_freight_amount,
            original_driver_price,
            recovery_miles,
            recovery_freight_amount,
            recovery_driver_price,
            recovery_date
          `)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);
        
          if (error) throw error;
          
          if (!data || data.length === 0) break;
          
          console.log(`✅ Fetched ${data.length} orders in batch ${from / batchSize + 1}`);
          allOrders = [...allOrders, ...data];
          
          if (data.length < batchSize) break;
          
          from += batchSize;
        }
        
        console.log(`✅ TOTAL ORDERS FETCHED: ${allOrders.length}`);
      
      const transformedOrders = allOrders.map((order: any) => {
        const pickupLocation = order.pickup_drops?.find((pd: any) => pd.type === 'pickup');
        const deliveryLocation = order.pickup_drops?.find((pd: any) => pd.type === 'delivery');
        
        // Format date ranges - always show only the start date
        // Use parseSimpleDateTime to avoid timezone conversion issues
        const formatDateRange = (startDate: string, endDate: string) => {
          if (!startDate) return 'N/A';
          const parsed = parseSimpleDateTime(startDate);
          return parsed.dateString;
        };
        
        // Calculate total mileage from loaded_miles + dh_miles or use legacy mileage
        const totalMileage = (order.loaded_miles || 0) + (order.dh_miles || 0) || order.mileage || 0;
        
        return {
          id: order.id,
          truckId: order.truck_id,
          driver1Id: order.driver1_id,
          truckNumber: order.truck?.truck_number || 'N/A',
          trailerNumber: order.trailer?.trailer_number || 'N/A',
          truckCompanyName: order.truck?.company?.name || 'N/A',
          internalLoadNumber: order.internal_load_number?.toString() || 'N/A',
          pickupDate: formatDateRange(order.pickup_datetime, order.pickup_end_datetime),
          pickupCity: pickupLocation?.city || 'N/A',
          pickupState: pickupLocation?.state || 'N/A',
          deliveryDate: formatDateRange(order.delivery_datetime, order.delivery_end_datetime),
          deliveryCity: deliveryLocation?.city || 'N/A',
          deliveryState: deliveryLocation?.state || 'N/A',
          mileage: totalMileage,
          driverPrice: order.driver_price || 0,
          detentionDriver: order.detention_driver || 0,
          layoverDriver: order.layover_driver || 0,
          extraStopDriver: order.extra_stop_driver || 0,
          lumperDriver: order.lumper_driver || 0,
          lateFeeDriver: order.late_fee_driver || 0,
          tonuDriver: order.tonu_driver || 0,
          noTrackingFeeDriver: order.no_tracking_fee_driver || 0,
          wrongAddressFeeDriver: order.wrong_address_fee_driver || 0,
          totalDriverPay: (order.driver_price || 0) + (order.detention_driver || 0) + (order.layover_driver || 0) - (order.late_fee_driver || 0) - (order.no_tracking_fee_driver || 0) - (order.wrong_address_fee_driver || 0) + (order.tonu_driver || 0),
          driverName: order.driver1?.name || 'N/A',
          brokerName: order.broker?.name || 'N/A',
          brokerAddress: order.broker?.address || '',
          brokerLoadNumber: order.broker_load_number || 'N/A',
          invoiced: order.invoiced ? 'Done' : '',
          freightAmount: order.freight_amount || 0,
          detention: order.detention || 0,
          layover: order.layover || 0,
          extraStop: order.extra_stop || 0,
          lumper: order.lumper || 0,
          lateFee: order.late_fee || 0,
          tonu: order.tonu || 0,
          escortFee: order.escort_fee || 0,
          escortFeeBrokerPaid: order.escort_fee_broker_paid || false,
          totalFreightAmount: (order.freight_amount || 0) + (order.detention || 0) + (order.layover || 0) + (order.extra_stop || 0) + (order.lumper || 0) + (order.tonu || 0) - (order.late_fee || 0) + (order.escort_fee_broker_paid ? (order.escort_fee || 0) : 0),
          notes: order.notes || '',
          bookedBy: order.booked_by || 'N/A',
          companyName: order.booked_by_company?.name || 'N/A',
          locked: order.locked || false,
          canceled: order.canceled || false,
          status: order.status || 'pending',
          createdAt: order.created_at,
          deliveryDatetime: order.delivery_datetime,
          deliveryEndDatetime: order.delivery_end_datetime,
          dateChangeNotes: order.date_change_notes || '',
          files: order.order_files || [],
          rcFiles: order.order_files?.filter((f: any) => f.file_category === 'RC') || [],
          bolFiles: order.order_files?.filter((f: any) => f.file_category === 'BOL') || [],
          podFiles: order.order_files?.filter((f: any) => f.file_category === 'POD') || [],
          additionalFiles: order.order_files?.filter((f: any) => f.file_category === 'ADDITIONAL') || [],
          isRecovery: order.is_recovery || false,
          originalDriverName: order.original_driver1?.name || null,
          originalTruckNumber: order.original_truck?.truck_number || null,
          originalMiles: order.original_miles || 0,
          originalFreightAmount: order.original_freight_amount || 0,
          originalDriverPrice: order.original_driver_price || 0,
          recoveryMiles: order.recovery_miles || 0,
          recoveryFreightAmount: order.recovery_freight_amount || 0,
          recoveryDriverPrice: order.recovery_driver_price || 0,
          recoveryDate: order.recovery_date || null,
          pickup_drops: order.pickup_drops || [],
        };
      });

        return transformedOrders;
      }, 30000);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 300000, // Cache for 5 minutes
    gcTime: 600000, // Keep in memory for 10 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
};