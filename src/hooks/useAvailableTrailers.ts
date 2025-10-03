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
      
      // Get all trucks to see which trailers are in use
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select('id, trailer_id');
      
      if (trucksError) throw trucksError;
      
      const usedTrailerIds = new Set(
        trucks
          ?.filter(t => t.trailer_id !== null && t.id !== currentTruckId)
          .map(t => t.trailer_id) || []
      );
      
      // Return trailers that aren't assigned to any truck (except current)
      return trailers?.filter(trailer => 
        !usedTrailerIds.has(trailer.id)
      ) || [];
    },
  });
};
