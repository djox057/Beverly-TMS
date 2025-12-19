import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface FuelDriverMapping {
  id: string;
  fuel_driver_name: string;
  driver_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnmatchedDriver {
  fuel_driver_name: string;
  transaction_count: number;
}

export const useFuelDriverMappings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all mappings
  const { data: mappings = [], isLoading: mappingsLoading } = useQuery({
    queryKey: ["fuel-driver-mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuel_driver_mappings")
        .select("*")
        .order("fuel_driver_name");
      if (error) throw error;
      return data as FuelDriverMapping[];
    },
  });

  // Fetch all drivers for matching dropdown
  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ["drivers-for-fuel-matching"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, name, first_name, last_name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Find unmatched fuel transaction drivers
  const { data: unmatchedDrivers = [], isLoading: unmatchedLoading, refetch: refetchUnmatched } = useQuery({
    queryKey: ["unmatched-fuel-drivers"],
    queryFn: async () => {
      // Get all unique driver names from fuel transactions
      const { data: fuelDrivers, error: fuelError } = await supabase
        .from("fuel_transactions")
        .select("driver_name");
      
      if (fuelError) throw fuelError;
      
      // Get unique driver names with counts
      const driverCounts = (fuelDrivers || []).reduce((acc, { driver_name }) => {
        acc[driver_name] = (acc[driver_name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const uniqueFuelDrivers = Object.keys(driverCounts);
      
      // Get all driver names from database
      const { data: dbDrivers, error: dbError } = await supabase
        .from("drivers")
        .select("name, first_name, last_name");
      
      if (dbError) throw dbError;
      
      // Get existing mappings
      const { data: existingMappings, error: mappingError } = await supabase
        .from("fuel_driver_mappings")
        .select("fuel_driver_name");
      
      if (mappingError) throw mappingError;
      
      const mappedNames = new Set((existingMappings || []).map(m => m.fuel_driver_name.toLowerCase().trim()));
      
      // Create a set of normalized database driver names
      const dbDriverNames = new Set<string>();
      (dbDrivers || []).forEach(d => {
        if (d.name) dbDriverNames.add(d.name.toLowerCase().trim());
        if (d.first_name && d.last_name) {
          dbDriverNames.add(`${d.first_name} ${d.last_name}`.toLowerCase().trim());
          dbDriverNames.add(`${d.last_name} ${d.first_name}`.toLowerCase().trim());
        }
      });
      
      // Find unmatched drivers (not in DB and not already mapped)
      const unmatched: UnmatchedDriver[] = [];
      uniqueFuelDrivers.forEach(fuelDriver => {
        const normalizedName = fuelDriver.toLowerCase().trim();
        if (!dbDriverNames.has(normalizedName) && !mappedNames.has(normalizedName)) {
          unmatched.push({
            fuel_driver_name: fuelDriver,
            transaction_count: driverCounts[fuelDriver],
          });
        }
      });
      
      return unmatched.sort((a, b) => a.fuel_driver_name.localeCompare(b.fuel_driver_name));
    },
  });

  // Create or update a mapping
  const saveMappingMutation = useMutation({
    mutationFn: async ({ fuelDriverName, driverId }: { fuelDriverName: string; driverId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("fuel_driver_mappings")
        .upsert({
          fuel_driver_name: fuelDriverName,
          driver_id: driverId,
          created_by: user?.id,
        }, {
          onConflict: "fuel_driver_name",
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-driver-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["unmatched-fuel-drivers"] });
      toast({
        title: "Mapping saved",
        description: "Driver mapping has been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving mapping",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete a mapping
  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fuel_driver_mappings")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-driver-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["unmatched-fuel-drivers"] });
      toast({
        title: "Mapping deleted",
        description: "Driver mapping has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting mapping",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    mappings,
    drivers,
    unmatchedDrivers,
    isLoading: mappingsLoading || driversLoading || unmatchedLoading,
    saveMapping: saveMappingMutation.mutate,
    isSaving: saveMappingMutation.isPending,
    deleteMapping: deleteMappingMutation.mutate,
    isDeleting: deleteMappingMutation.isPending,
    refetchUnmatched,
  };
};
