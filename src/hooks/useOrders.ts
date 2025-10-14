import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

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
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          truck:trucks!orders_truck_id_fkey(truck_number, company:companies(name)),
          driver1:drivers!orders_driver1_id_fkey(name),
          broker:brokers!orders_broker_id_fkey(name, address),
          company:companies!orders_company_id_fkey(name),
          booked_by_company:companies!orders_booked_by_company_id_fkey(name),
          pickup_drops(type, city, state, datetime, address),
          order_files(id, file_name, file_path, file_size, content_type, file_category)
        `)
        .order('created_at', { ascending: false })
        .limit(300);
      
      if (error) throw error;
      
      const transformedOrders = data.map((order: any) => {
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
          createdAt: order.created_at,
          files: order.order_files || [],
          rcFiles: order.order_files?.filter((f: any) => f.file_category === 'RC') || [],
          bolFiles: order.order_files?.filter((f: any) => f.file_category === 'BOL') || [],
          podFiles: order.order_files?.filter((f: any) => f.file_category === 'POD') || [],
          additionalFiles: order.order_files?.filter((f: any) => f.file_category === 'ADDITIONAL') || []
        };
      });

        return transformedOrders;
    },
  });
};