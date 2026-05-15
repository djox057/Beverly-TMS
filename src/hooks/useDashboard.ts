import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  const [activeOrdersRes, availableTrucksRes, assignedTrucksRes, totalBrokersRes] = await Promise.all([
    // Active orders = total count of all orders
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true }),
    // Available trucks = active trucks that have a driver assigned
    supabase
      .from('trucks')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('driver1_id', 'is', null),
    // For "Active Drivers" (assigned to a truck): pull active trucks with their drivers
    supabase
      .from('trucks')
      .select('driver1_id, driver2_id')
      .eq('is_active', true),
    supabase.from('brokers').select('id', { count: 'exact', head: true }),
  ]);

  const driverIds = new Set<string>();
  for (const t of (assignedTrucksRes.data || []) as Array<{ driver1_id: string | null; driver2_id: string | null }>) {
    if (t.driver1_id) driverIds.add(t.driver1_id);
    if (t.driver2_id) driverIds.add(t.driver2_id);
  }

  let activeAssignedDrivers = 0;
  if (driverIds.size > 0) {
    const ids = Array.from(driverIds);
    const { count } = await supabase
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .in('id', ids);
    activeAssignedDrivers = count || 0;
  }

  return {
    activeOrders: activeOrdersRes.count || 0,
    availableTrucks: availableTrucksRes.count || 0,
    activeDrivers: activeAssignedDrivers,
    totalBrokers: totalBrokersRes.count || 0,
  };
};

const fetchRecentOrders = async (): Promise<RecentOrder[]> => {
  // Stage 1: Flat orders fetch
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, load_number, status, updated_at, truck_id')
    .eq('canceled', false)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  // Stage 2: Batch fetch trucks and pickup_drops
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

  // Stage 3: Assemble
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
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
};

export const useRecentOrders = () => {
  return useQuery({
    queryKey: ['recent-orders'],
    queryFn: fetchRecentOrders,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
};
