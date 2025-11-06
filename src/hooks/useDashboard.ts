import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface DashboardStats {
  activeOrders: number;
  availableTrucks: number;
  activeDrivers: number;
  totalBrokers: number;
}

export interface RecentOrder {
  id: string;
  load_number: string;
  truck_number: string | null;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  updated_at: string;
}

const fetchDashboardStats = async (): Promise<DashboardStats> => {
  // Get active orders count
  const { count: activeOrdersCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'in_transit', 'loading']);

  // Get available trucks count
  const { count: availableTrucksCount } = await supabase
    .from('trucks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'available');

  // Get total drivers count
  const { count: activeDriversCount } = await supabase
    .from('drivers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // Get total brokers count
  const { count: totalBrokersCount } = await supabase
    .from('brokers')
    .select('*', { count: 'exact', head: true });

  return {
    activeOrders: activeOrdersCount || 0,
    availableTrucks: availableTrucksCount || 0,
    activeDrivers: activeDriversCount || 0,
    totalBrokers: totalBrokersCount || 0,
  };
};

const fetchRecentOrders = async (): Promise<RecentOrder[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      load_number,
      status,
      updated_at,
      trucks!truck_id(truck_number),
      pickup_drops!left(
        address,
        city,
        state,
        type
      )
    `)
    .eq('canceled', false)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  return (data || []).map(order => {
    const pickupStop = order.pickup_drops?.find(pd => pd.type === 'pickup');
    const deliveryStop = order.pickup_drops?.find(pd => pd.type === 'delivery');
    
    return {
      id: order.id,
      load_number: order.load_number,
      truck_number: order.trucks?.truck_number || null,
      status: order.status,
      pickup_address: pickupStop?.address || null,
      delivery_address: deliveryStop?.address || null,
      pickup_city: pickupStop?.city || null,
      pickup_state: pickupStop?.state || null,
      delivery_city: deliveryStop?.city || null,
      delivery_state: deliveryStop?.state || null,
      updated_at: order.updated_at,
    };
  });
};

export const useDashboardStats = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-stats-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trucks" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "brokers" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });
};

export const useRecentOrders = () => {
  const queryClient = useQueryClient();

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("recent-orders-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => queryClient.invalidateQueries({ queryKey: ["recent-orders"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_drops" },
        () => queryClient.invalidateQueries({ queryKey: ["recent-orders"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['recent-orders'],
    queryFn: fetchRecentOrders,
  });
};