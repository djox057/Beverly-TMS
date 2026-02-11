import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrailersRealtime } from "./useTrailersRealtime";

export const useTrailers = () => {
  // Use advanced realtime hook (single-record fetch + cache patch, no full refetch)
  useTrailersRealtime();

  return useQuery({
    queryKey: ['trailers', 'v2'], // Added version to force cache invalidation
    queryFn: async () => {
      console.log('🚛 Fetching trailers with relationships...');
      let allTrailers: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('trailers')
          .select('*')
          .order('trailer_number', { ascending: true })
          .range(from, from + batchSize - 1);
        
        if (error) {
          console.error('❌ Error fetching trailers:', error);
          throw error;
        }
        
        if (data) {
          allTrailers = [...allTrailers, ...data];
          hasMore = data.length === batchSize;
          from += batchSize;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`✅ Total trailers fetched: ${allTrailers.length}`);
      
      // Fetch trucks separately to avoid RLS issues with reverse joins
      const { data: trucksData, error: trucksError } = await supabase
        .from('trucks')
        .select('id, truck_number, trailer_id');
      
      if (trucksError) {
        console.error('❌ Error fetching trucks for trailers:', trucksError);
      } else {
        console.log(`✅ Fetched ${trucksData?.length || 0} trucks for trailer mapping`);
        
        // Create a Map for faster truck lookups by trailer_id
        const trucksByTrailerId = new Map();
        if (trucksData) {
          trucksData.forEach(truck => {
            if (truck.trailer_id) {
              if (!trucksByTrailerId.has(truck.trailer_id)) {
                trucksByTrailerId.set(truck.trailer_id, []);
              }
              trucksByTrailerId.get(truck.trailer_id).push(truck);
            }
          });
        }
        
        // Map trucks to trailers using the Map
        allTrailers = allTrailers.map(trailer => ({
          ...trailer,
          trucks: trucksByTrailerId.get(trailer.id) || []
        }));
      }
      
      console.log('Sample trailer with trucks:', allTrailers[0]);
      return allTrailers;
    },
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 120000, // 2 minutes - reduce DB load from navigation refetches
    gcTime: 300000, // 5 minutes cache retention
    structuralSharing: false, // Prevent React Query from merging old/new data structures
  });
};