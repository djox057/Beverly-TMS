import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { jitteredInterval } from "@/lib/utils";

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
  const [activeOrdersRes, availableTrucksRes, activeDriversRes, totalBrokersRes] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_transit', 'loading']),
    supabase.from('trucks').select('id', { count: 'exact', head: true }).eq('status', 'available'),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('brokers').select('id', { count: 'exact', head: true }),
  ]);

  return {
    activeOrders: activeOrdersRes.count || 0,
    availableTrucks: availableTrucksRes.count || 0,
    activeDrivers: activeDriversRes.count || 0,
    totalBrokers: totalBrokersRes.count || 0,
  };
};

const fetchRecentOrders = async (): Promise<RecentOrder[]> => {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, load_number, status, updated_at, truck_id')
    .eq('canceled', false)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  const truckIds = [...new Set(orders.map(o => o.truck_id).filter(Boolean))] as string[];
  const orderIds = orders.map(o => o.id);

  const [trucksRes, pickupDropsRes] = await Promise.all([
    truckIds.length > 0
      ? supabase.from('trucks').select('id, truck_number').in('id', truckIds)
      : { data: [] },
    supabase.from('pickup_drops').select('order_id, address, city, state, type').in('order_id', orderIds),
  ]);

  const truckMap = new Map((trucksRes.data || []).map(t => [t.id, t]));
  const pickupDropsByOrder = new Map<string, any[]>();
  for (const pd of (pickupDropsRes.data || [])) {
    const arr = pickupDropsByOrder.get(pd.order_id) || [];
    arr.push(pd);
    pickupDropsByOrder.set(pd.order_id, arr);
  }

  return orders.map(order => {
    const drops = pickupDropsByOrder.get(order.id) || [];
    const pickupStop = drops.find(pd => pd.type === 'pickup');
    const deliveryStop = drops.find(pd => pd.type === 'delivery');

    return {
      id: order.id,
      load_number: order.load_number,
      truck_number: truckMap.get(order.truck_id)?.truck_number || null,
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
  const refetchInterval = useMemo(() => jitteredInterval(60000), []);
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    staleTime: 60000,
    refetchInterval,
    retry: 1,
  });
};

export const useRecentOrders = () => {
  const refetchInterval = useMemo(() => jitteredInterval(60000), []);
  return useQuery({
    queryKey: ['recent-orders'],
    queryFn: fetchRecentOrders,
    staleTime: 60000,
    refetchInterval,
    retry: 1,
  });
};
