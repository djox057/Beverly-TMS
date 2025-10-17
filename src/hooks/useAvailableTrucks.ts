import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAvailableTrucks = (forRecovery?: boolean) => {
  return useQuery({
    queryKey: ['available-trucks', forRecovery],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('id, truck_number, driver1_id, trailer_id')
        .order('truck_number', { ascending: true });
      
      if (error) throw error;
      
      // For recovery loads, show all trucks that have drivers assigned
      // For normal use, show trucks without drivers
      if (forRecovery) {
        return data?.filter(truck => truck.driver1_id !== null) || [];
      }
      
      return data || [];
    },
  });
};
