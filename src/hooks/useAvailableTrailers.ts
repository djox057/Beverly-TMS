import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const useAvailableTrailers = (currentTruckId?: string) => {
  const queryClient = useQueryClient();

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

  // Effect to remove yard trailers from trucks that have them assigned
  useEffect(() => {
    const removeYardTrailersFromTrucks = async () => {
      if (yardLoadTrailerIds.length === 0) return;

      // Find trucks that have yard trailers assigned
      const { data: trucksWithYardTrailers, error: fetchError } = await supabase
        .from('trucks')
        .select('id, trailer_id')
        .in('trailer_id', yardLoadTrailerIds);

      if (fetchError) {
        console.error('Error fetching trucks with yard trailers:', fetchError);
        return;
      }

      if (trucksWithYardTrailers && trucksWithYardTrailers.length > 0) {
        // Remove the trailer from these trucks
        const truckIds = trucksWithYardTrailers.map(t => t.id);
        const { error: updateError } = await supabase
          .from('trucks')
          .update({ trailer_id: null })
          .in('id', truckIds);

        if (updateError) {
          console.error('Error removing yard trailers from trucks:', updateError);
        } else {
          console.log(`Removed yard trailers from ${truckIds.length} truck(s)`);
          // Invalidate trucks query to reflect changes
          queryClient.invalidateQueries({ queryKey: ['trucks'] });
        }
      }
    };

    removeYardTrailersFromTrucks();
  }, [yardLoadTrailerIds, queryClient]);

  return useQuery({
    queryKey: ['available-trailers', currentTruckId, yardLoadTrailerIds],
    queryFn: async () => {
      const { data: trailers, error: trailersError } = await supabase
        .from('trailers')
        .select('id, trailer_number')
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
