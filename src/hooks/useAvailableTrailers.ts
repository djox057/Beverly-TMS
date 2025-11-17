import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAvailableTrailers = (currentTruckId?: string) => {
  return useQuery({
    queryKey: ['available-trailers', currentTruckId],
    queryFn: async () => {
      const { data: trailers, error: trailersError } = await supabase
        .from('trailers')
        .select('id, trailer_number')
        .order('trailer_number', { ascending: true });
      
      if (trailersError) throw trailersError;
      
      // Return all trailers - they can be reassigned
      return trailers || [];
    },
  });
};
