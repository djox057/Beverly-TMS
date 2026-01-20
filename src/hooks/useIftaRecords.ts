import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFuelTransactions, FuelFilters } from "./useFuelTransactions";
import { startOfQuarter, endOfQuarter } from "date-fns";

export interface IftaFilters {
  quarter: string | null; // Format: "2026-Q1"
}

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

export interface TruckStateData {
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

const BATCH_SIZE = 1000;

// Fetch all IFTA records in batches to handle > 1000 records
async function fetchAllIftaRecordsInBatches(): Promise<IftaRecord[]> {
  const allRecords: IftaRecord[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("ifta_records")
      .select("*")
      .order("vehicle", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allRecords.push(...(data as IftaRecord[]));
      offset += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

// Helper to get quarter date range from quarter string like "2026-Q1"
export function getQuarterDateRange(quarter: string | null): { startDate: Date | null; endDate: Date | null } {
  if (!quarter) return { startDate: null, endDate: null };
  
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return { startDate: null, endDate: null };
  
  const year = parseInt(match[1]);
  const q = parseInt(match[2]);
  
  // Quarter start months: Q1=Jan(0), Q2=Apr(3), Q3=Jul(6), Q4=Oct(9)
  const quarterStartMonth = (q - 1) * 3;
  const quarterStartDate = new Date(year, quarterStartMonth, 1);
  
  return {
    startDate: startOfQuarter(quarterStartDate),
    endDate: endOfQuarter(quarterStartDate),
  };
}

// Generate quarter options including +1 quarter in future
export function generateQuarterOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  
  // Generate quarters from 2024-Q1 up to current quarter + 1
  for (let year = 2024; year <= currentYear + 1; year++) {
    for (let q = 1; q <= 4; q++) {
      // Skip future quarters beyond current + 1
      if (year > currentYear || (year === currentYear && q > currentQuarter + 1)) {
        if (!(year === currentYear && q === currentQuarter + 1)) {
          continue;
        }
      }
      
      const quarterLabel = `Q${q} ${year}`;
      options.push({
        value: `${year}-Q${q}`,
        label: quarterLabel,
      });
    }
  }
  
  return options.reverse(); // Most recent first
}

export const useIftaRecords = (fuelFilters?: FuelFilters, iftaFilters?: IftaFilters) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all IFTA records with batch loading
  const { data: iftaRecords = [], isLoading: isLoadingIfta } = useQuery({
    queryKey: ["ifta-records"],
    queryFn: fetchAllIftaRecordsInBatches,
  });

  // Get quarter date range for filtering fuel transactions
  const quarterRange = getQuarterDateRange(iftaFilters?.quarter || null);

  // Fetch fuel transactions filtered by quarter if selected
  const iftaFuelFilters: FuelFilters = {
    startDate: quarterRange.startDate,
    endDate: quarterRange.endDate,
    truckNumber: fuelFilters?.truckNumber || "",
    driverName: fuelFilters?.driverName || "",
    itemType: "ULSD",  // Only ULSD for IFTA
    paymentType: "ALL",  // Include all payment types
  };
  
  const { transactions: fuelTransactions } = useFuelTransactions(iftaFuelFilters);

  // Combine IFTA miles data with fuel ULSD data per truck per state
  const truckStateReport: TruckStateData[] = (() => {
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

    // Group ULSD fuel transactions by truck and state
    const fuelByTruckState = new Map<string, Map<string, number>>();
    
    for (const tx of fuelTransactions) {
      if (tx.item !== "ULSD" || !tx.state || !tx.truck_number) continue;
      
      if (!fuelByTruckState.has(tx.truck_number)) {
        fuelByTruckState.set(tx.truck_number, new Map());
      }
      const truckStates = fuelByTruckState.get(tx.truck_number)!;
      const existing = truckStates.get(tx.state) || 0;
      truckStates.set(tx.state, existing + (tx.quantity || 0));
    }

    // Get all unique truck numbers from both IFTA and fuel data
    const allTrucks = new Set([
      ...iftaByTruck.keys(),
      ...fuelByTruckState.keys(),
    ]);

    // Build truck report combining IFTA miles and fuel gallons
    const result: TruckStateData[] = [];
    
    for (const truckNumber of allTrucks) {
      const iftaStates = iftaByTruck.get(truckNumber) || [];
      const fuelStates = fuelByTruckState.get(truckNumber) || new Map();
      
      // Combine all states from both IFTA and fuel data
      const allStates = new Set([
        ...iftaStates.map(s => s.jurisdiction),
        ...fuelStates.keys(),
      ]);
      
      const states = Array.from(allStates).map(state => {
        const iftaData = iftaStates.find(s => s.jurisdiction === state);
        const ulsdGallons = fuelStates.get(state) || 0;
        
        return {
          state,
          totalMiles: iftaData?.totalMiles || 0,
          taxableMiles: iftaData?.taxableMiles || 0,
          ulsdGallons,
        };
      }).sort((a, b) => a.state.localeCompare(b.state));
      
      result.push({
        truckNumber,
        states,
        totalMiles: states.reduce((sum, s) => sum + s.totalMiles, 0),
        totalUlsdGallons: states.reduce((sum, s) => sum + s.ulsdGallons, 0),
      });
    }
    
    return result.sort((a, b) => a.truckNumber.localeCompare(b.truckNumber));
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
    truckStateReport,
    uploadIftaRecords: uploadMutation.mutate,
    isUploadingIfta: uploadMutation.isPending,
    deleteAllIfta: deleteAllMutation.mutate,
    isDeletingIfta: deleteAllMutation.isPending,
  };
};
