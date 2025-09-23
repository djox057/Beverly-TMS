import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTrucks = () => {
  return useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select(`
          *,
          trailer:trailer_id(trailer_number, trailer_type),
          driver1:drivers!trucks_driver1_id_fkey(id, name),
          driver2:drivers!trucks_driver2_id_fkey(id, name)
        `)
        .order('truck_number');
      
      if (error) throw error;
      return data;
    },
  });
};