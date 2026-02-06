import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAvailableTrucks = (forRecovery?: boolean) => {
  return useQuery({
    queryKey: ['available-trucks', forRecovery],
    queryFn: async () => {
      // Stage 1: Flat trucks fetch
      const { data: trucks, error } = await supabase
        .from('trucks')
        .select('id, truck_number, driver1_id, trailer_id, is_active')
        .eq('is_active', true)
        .order('truck_number', { ascending: true });
      
      if (error) throw error;
      if (!trucks || trucks.length === 0) return [];

      // For recovery loads, filter to trucks with drivers
      const filtered = forRecovery
        ? trucks.filter(truck => truck.driver1_id !== null)
        : trucks;

      if (filtered.length === 0) return [];

      // Stage 2: Batch fetch drivers for filtered trucks
      const driverIds = [...new Set(filtered.map(t => t.driver1_id).filter(Boolean))] as string[];

      const driversRes = driverIds.length > 0
        ? await supabase.from('drivers').select('id, name, dispatcher_id').in('id', driverIds)
        : { data: [] };

      const driverMap = new Map((driversRes.data || []).map(d => [d.id, d]));

      // Stage 3: Assemble (match original joined shape)
      return filtered.map(truck => ({
        ...truck,
        driver1: driverMap.get(truck.driver1_id) || null,
      }));
    },
  });
};
