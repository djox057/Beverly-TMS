import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTrucks = () => {
  return useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      let allTrucks: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('trucks')
          .select(`
            *,
            trailer:trailer_id(trailer_number, trailer_type),
            driver1:drivers!trucks_driver1_id_fkey(id, name),
            driver2:drivers!trucks_driver2_id_fkey(id, name),
            dispatcher:dispatcher_id(id, full_name, email),
            company:company_id(id, name)
          `)
          .order('truck_number')
          .range(from, from + batchSize - 1);
        
        if (error) throw error;
        
        if (!data || data.length === 0) break;
        
        allTrucks = [...allTrucks, ...data];
        
        if (data.length < batchSize) break;
        
        from += batchSize;
      }
      
      return allTrucks;
    },
  });
};