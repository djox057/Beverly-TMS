import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAvailableTrailers = (currentTruckId?: string) => {

  // Fetch yard load trailer IDs (trailers that are on yard loads and should not be assignable)
  const { data: yardLoadTrailerIds = [] } = useQuery({
    queryKey: ['yard-load-trailer-ids'],
    queryFn: async () => {
      // Yard loads are orders where driver1_id IS NULL and truck_id IS NULL
      const { data, error } = await supabase
        .from('orders')
        .select('trailer_id')
        .is('driver1_id', null)
        .is('truck_id', null)
        .not('trailer_id', 'is', null);
      
      if (error) throw error;
      return (data || []).map(o => o.trailer_id).filter(Boolean) as string[];
    },
    staleTime: 30000, // 30 seconds
  });

  // NOTE: We intentionally do NOT auto-unassign yard-load trailers from trucks here.
  // Doing so can race with the yard-load pickup flow (truck gets set to the yard trailer,
  // then this effect clears it back to null). We only filter these trailers out of the
  // "available trailers" list (see below).

  return useQuery({
    queryKey: ['available-trailers', currentTruckId, yardLoadTrailerIds],
    queryFn: async () => {
      const { data: trailers, error: trailersError } = await supabase
        .from('trailers')
        .select('id, trailer_number, is_active')
        .eq('is_active', true) // Only return active trailers
        .order('trailer_number', { ascending: true });
      
      if (trailersError) throw trailersError;
      
      // Filter out trailers that are on yard loads
      const availableTrailers = (trailers || []).filter(
        trailer => !yardLoadTrailerIds.includes(trailer.id)
      );
      
      return availableTrailers;
    },
  });
};
