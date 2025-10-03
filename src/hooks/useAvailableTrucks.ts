import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAvailableTrucks = (currentDriverId?: string) => {
  return useQuery({
    queryKey: ['available-trucks', currentDriverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('id, truck_number, driver1_id')
        .order('truck_number', { ascending: true });
      
      if (error) throw error;
      
      // Filter trucks that don't have a driver assigned
      // or are currently assigned to the driver being edited
      return data?.filter(truck => 
        truck.driver1_id === null || 
        truck.driver1_id === currentDriverId
      ) || [];
    },
  });
};
