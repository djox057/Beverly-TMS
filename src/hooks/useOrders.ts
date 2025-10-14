import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const useOrders = (page: number = 1, pageSize: number = 50) => {
  const queryClient = useQueryClient();

  // Set up real-time subscriptions with debouncing
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
    const debouncedInvalidate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['reports'] });
      }, 500);
    };

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        debouncedInvalidate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_drops'
        },
        debouncedInvalidate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_files'
        },
        debouncedInvalidate
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['orders', page, pageSize],
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Minimal data for list view - no files, minimal joins
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await supabase
        .from('orders')
        .select(`
          id,
          internal_load_number,
          broker_load_number,
          status,
          canceled,
          locked,
          invoiced,
          freight_amount,
          detention,
          layover,
          extra_stop,
          lumper,
          late_fee,
          tonu,
          loaded_miles,
          dh_miles,
          mileage,
          driver_price,
          pickup_datetime,
          pickup_end_datetime,
          delivery_datetime,
          delivery_end_datetime,
          notes,
          booked_by,
          created_at,
          truck:trucks!orders_truck_id_fkey(truck_number, company:companies(name)),
          driver1:drivers!orders_driver1_id_fkey(name),
          broker:brokers!orders_broker_id_fkey(name, address),
          company:companies!orders_company_id_fkey(name),
          pickup_drops(type, city, state, datetime, address)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      
      const transformedOrders = (data || []).map((order: any) => {
        const pickupLocation = order.pickup_drops?.find((pd: any) => pd.type === 'pickup');
        const deliveryLocation = order.pickup_drops?.find((pd: any) => pd.type === 'delivery');
        
        // Format date ranges - always show only the start date
        const formatDateRange = (startDate: string, endDate: string) => {
          if (!startDate) return 'N/A';
          return new Date(startDate).toLocaleDateString();
        };
        
        // Calculate total mileage from loaded_miles + dh_miles or use legacy mileage
        const totalMileage = (order.loaded_miles || 0) + (order.dh_miles || 0) || order.mileage || 0;
        
        return {
          id: order.id,
          truckNumber: order.truck?.truck_number || 'N/A',
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
          totalFreightAmount: (order.freight_amount || 0) + (order.detention || 0) + (order.layover || 0) + (order.extra_stop || 0) + (order.lumper || 0) + (order.tonu || 0) - (order.late_fee || 0),
          notes: order.notes || '',
          bookedBy: order.booked_by || 'N/A',
          companyName: order.company?.name || 'N/A',
          locked: order.locked || false,
          canceled: order.canceled || false,
          status: order.status || 'pending',
          createdAt: order.created_at
        };
      });

      return {
        orders: transformedOrders,
        totalCount: count || 0,
        hasMore: (count || 0) > to + 1,
        currentPage: page,
        pageSize
      };
    },
  });
};