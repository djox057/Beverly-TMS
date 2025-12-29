import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFuelTransactions, FuelFilters } from "./useFuelTransactions";

export interface IftaRecord {
  id: string;
  vehicle: string;
  fuel_type: string;
  jurisdiction: string;
  taxable_miles: number;
  total_miles: number;
  tax_paid_gallons: number;
  uploaded_at: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface IftaRecordInsert {
  vehicle: string;
  fuel_type: string;
  jurisdiction: string;
  taxable_miles: number;
  total_miles: number;
  tax_paid_gallons: number;
}

export interface DriverStateData {
  driverName: string;
  truckNumber: string;
  states: {
    state: string;
    totalMiles: number;
    taxableMiles: number;
    ulsdGallons: number;
  }[];
  totalMiles: number;
  totalUlsdGallons: number;
}

// Extract truck number from IFTA vehicle format "TRUCK 241140" -> "241140"
const extractTruckNumber = (vehicle: string): string => {
  const match = vehicle.match(/TRUCK\s*(\d+)/i);
  return match ? match[1] : vehicle;
};

export const useIftaRecords = (fuelFilters?: FuelFilters) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all IFTA records
  const { data: iftaRecords = [], isLoading: isLoadingIfta } = useQuery({
    queryKey: ["ifta-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ifta_records")
        .select("*")
        .order("vehicle", { ascending: true });
      
      if (error) throw error;
      return data as IftaRecord[];
    },
  });

  // Fetch fuel transactions to get ULSD gallons by driver/state
  const defaultFilters: FuelFilters = {
    startDate: null,
    endDate: null,
    truckNumber: "",
    driverName: "",
    itemType: "ULSD",
  };
  
  const { transactions: fuelTransactions } = useFuelTransactions(fuelFilters || defaultFilters);

  // Combine IFTA miles data with fuel ULSD data per driver per state
  const driverStateReport: DriverStateData[] = (() => {
    // Group IFTA records by truck number
    const iftaByTruck = new Map<string, { jurisdiction: string; totalMiles: number; taxableMiles: number }[]>();
    
    for (const record of iftaRecords) {
      const truckNum = extractTruckNumber(record.vehicle);
      if (!iftaByTruck.has(truckNum)) {
        iftaByTruck.set(truckNum, []);
      }
      const existing = iftaByTruck.get(truckNum)!.find(r => r.jurisdiction === record.jurisdiction);
      if (existing) {
        existing.totalMiles += record.total_miles;
        existing.taxableMiles += record.taxable_miles;
      } else {
        iftaByTruck.get(truckNum)!.push({
          jurisdiction: record.jurisdiction,
          totalMiles: record.total_miles,
          taxableMiles: record.taxable_miles,
        });
      }
    }

    // Group ULSD fuel transactions by driver and state
    const fuelByDriverState = new Map<string, Map<string, { gallons: number; truckNumber: string }>>();
    
    for (const tx of fuelTransactions) {
      if (tx.item !== "ULSD" || !tx.state) continue;
      
      if (!fuelByDriverState.has(tx.driver_name)) {
        fuelByDriverState.set(tx.driver_name, new Map());
      }
      const driverStates = fuelByDriverState.get(tx.driver_name)!;
      const existing = driverStates.get(tx.state);
      if (existing) {
        existing.gallons += tx.quantity || 0;
      } else {
        driverStates.set(tx.state, { gallons: tx.quantity || 0, truckNumber: tx.truck_number });
      }
    }

    // Build driver report combining IFTA miles and fuel gallons
    const result: DriverStateData[] = [];
    
    for (const [driverName, stateData] of fuelByDriverState) {
      // Get first truck number for this driver (from fuel data)
      const firstTruck = Array.from(stateData.values())[0]?.truckNumber || "";
      const iftaStates = iftaByTruck.get(firstTruck) || [];
      
      // Combine all states from both IFTA and fuel data
      const allStates = new Set([
        ...iftaStates.map(s => s.jurisdiction),
        ...Array.from(stateData.keys()),
      ]);
      
      const states = Array.from(allStates).map(state => {
        const iftaData = iftaStates.find(s => s.jurisdiction === state);
        const fuelData = stateData.get(state);
        
        return {
          state,
          totalMiles: iftaData?.totalMiles || 0,
          taxableMiles: iftaData?.taxableMiles || 0,
          ulsdGallons: fuelData?.gallons || 0,
        };
      }).sort((a, b) => a.state.localeCompare(b.state));
      
      result.push({
        driverName,
        truckNumber: firstTruck,
        states,
        totalMiles: states.reduce((sum, s) => sum + s.totalMiles, 0),
        totalUlsdGallons: states.reduce((sum, s) => sum + s.ulsdGallons, 0),
      });
    }
    
    return result.sort((a, b) => a.driverName.localeCompare(b.driverName));
  })();

  // Upload IFTA records mutation
  const uploadMutation = useMutation({
    mutationFn: async (records: IftaRecordInsert[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const recordsWithMetadata = records.map(record => ({
        ...record,
        uploaded_by: user?.id || null,
      }));

      const { data, error } = await supabase
        .from("ifta_records")
        .insert(recordsWithMetadata)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ifta-records"] });
      toast({
        title: "Upload successful",
        description: `${data?.length || 0} IFTA records imported.`,
      });
    },
    onError: (error) => {
      console.error("IFTA upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete all IFTA records mutation
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ifta_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ifta-records"] });
      toast({
        title: "Data cleared",
        description: "All IFTA records have been deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    iftaRecords,
    isLoadingIfta,
    driverStateReport,
    uploadIftaRecords: uploadMutation.mutate,
    isUploadingIfta: uploadMutation.isPending,
    deleteAllIfta: deleteAllMutation.mutate,
    isDeletingIfta: deleteAllMutation.isPending,
  };
};
