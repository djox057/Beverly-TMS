import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useFleetManagement = () => {
  return useQuery({
    queryKey: ['fleet-management'],
    queryFn: async () => {
      const { data: trucks, error } = await supabase
        .from('trucks')
        .select(`
          id,
          truck_number,
          fleet_assignment,
          driver1:drivers!trucks_driver1_id_fkey(name),
          trailer:trailers!trucks_trailer_id_fkey(trailer_number)
        `)
        .order('fleet_assignment, truck_number');

      if (error) throw error;

      // Group trucks by fleet
      const fleetGroups: { [key: string]: any[] } = {};
      
      trucks?.forEach(truck => {
        const fleet = truck.fleet_assignment || 'Unassigned';
        if (!fleetGroups[fleet]) {
          fleetGroups[fleet] = [];
        }
        fleetGroups[fleet].push(truck);
      });

      return fleetGroups;
    },
  });
};

export const useUpdateTruckFleet = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ truckId, fleetAssignment }: { truckId: string; fleetAssignment: string | null }) => {
      const { error } = await supabase
        .from('trucks')
        .update({ fleet_assignment: fleetAssignment })
        .eq('id', truckId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet-management'] });
      toast({
        title: "Success",
        description: "Truck fleet assignment updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update fleet assignment",
        variant: "destructive",
      });
    },
  });
};

export const useAvailableFleets = () => {
  return useQuery({
    queryKey: ['available-fleets'],
    queryFn: async () => {
      const { data: trucks, error } = await supabase
        .from('trucks')
        .select('fleet_assignment')
        .not('fleet_assignment', 'is', null);

      if (error) throw error;

      // Get unique fleet names
      const fleets = [...new Set(trucks?.map(t => t.fleet_assignment).filter(Boolean))];
      return fleets.sort();
    },
  });
};