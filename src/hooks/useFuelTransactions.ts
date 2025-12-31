import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { startOfWeek, subWeeks, format } from "date-fns";

export interface FuelTransaction {
  id: string;
  truck_number: string;
  driver_name: string;
  transaction_number: string;
  transaction_date: string;
  location_name: string | null;
  city: string | null;
  state: string | null;
  fees: number;
  item: string;
  unit_price: number;
  quantity: number;
  amount: number;
  uploaded_at: string;
  uploaded_by: string | null;
  paid: boolean;
}

export interface FuelTransactionInsert {
  truck_number: string;
  driver_name: string;
  transaction_number: string;
  transaction_date: string;
  location_name?: string | null;
  city?: string | null;
  state?: string | null;
  fees?: number;
  item: string;
  unit_price?: number;
  quantity?: number;
  amount?: number;
  company?: string | null;
}

export interface FuelFilters {
  startDate: Date | null;
  endDate: Date | null;
  truckNumber: string;
  driverName: string;
  itemType: string;
  paymentType: "ALL" | "EFS" | "CARD";
}

// Get default date range: current week + last 2 weeks
export const getDefaultDateRange = () => {
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const threeWeeksAgo = subWeeks(currentWeekStart, 2);
  return {
    startDate: threeWeeksAgo,
    endDate: today,
  };
};

// Helper function to fetch all fuel_transactions records in batches (for CARD)
const fetchAllCardInBatches = async (filters: FuelFilters): Promise<FuelTransaction[]> => {
  const BATCH_SIZE = 1000;
  let allData: FuelTransaction[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("fuel_transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .range(from, from + BATCH_SIZE - 1);

    if (filters.startDate) {
      query = query.gte("transaction_date", format(filters.startDate, "yyyy-MM-dd"));
    }
    if (filters.endDate) {
      query = query.lte("transaction_date", format(filters.endDate, "yyyy-MM-dd"));
    }
    if (filters.truckNumber) {
      query = query.eq("truck_number", filters.truckNumber);
    }
    if (filters.driverName) {
      query = query.eq("driver_name", filters.driverName);
    }
    if (filters.itemType && filters.itemType !== "ALL") {
      query = query.eq("item", filters.itemType);
    }

    const { data, error } = await query;
    if (error) throw error;

    allData = [...allData, ...(data as FuelTransaction[])];
    
    if (data.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      from += BATCH_SIZE;
    }
  }

  return allData;
};

// Helper function to fetch EFS other requests (for EFS filter)
const fetchEfsOtherRequests = async (filters: FuelFilters): Promise<FuelTransaction[]> => {
  const BATCH_SIZE = 1000;
  let allData: FuelTransaction[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("efs_other_requests")
      .select("id, driver_name, truck_number, amount, purpose, requested_at, city, state, quantity")
      .order("requested_at", { ascending: false })
      .range(from, from + BATCH_SIZE - 1);

    if (filters.startDate) {
      query = query.gte("requested_at", format(filters.startDate, "yyyy-MM-dd"));
    }
    if (filters.endDate) {
      // Add 1 day to include records on the end date
      const endDatePlusOne = new Date(filters.endDate);
      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
      query = query.lt("requested_at", format(endDatePlusOne, "yyyy-MM-dd"));
    }
    if (filters.truckNumber) {
      query = query.eq("truck_number", filters.truckNumber);
    }
    if (filters.driverName) {
      query = query.ilike("driver_name", `%${filters.driverName}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Transform EFS requests to match FuelTransaction interface
    const transformed: FuelTransaction[] = (data || []).map((req: any) => ({
      id: req.id,
      truck_number: req.truck_number || "",
      driver_name: req.driver_name,
      transaction_number: `EFS-${req.id.slice(0, 8)}`,
      transaction_date: req.requested_at ? format(new Date(req.requested_at), "yyyy-MM-dd") : "",
      location_name: null,
      city: req.city || null,
      state: req.state || null,
      fees: 0,
      item: req.purpose || "EFS Request",
      unit_price: 0,
      quantity: req.quantity || 0,
      amount: req.amount || 0,
      uploaded_at: req.requested_at,
      uploaded_by: null,
      paid: false,
    }));

    allData = [...allData, ...transformed];
    
    if (data.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      from += BATCH_SIZE;
    }
  }

  return allData;
};

// Helper function to fetch all records based on payment type
const fetchAllInBatches = async (filters: FuelFilters): Promise<FuelTransaction[]> => {
  if (filters.paymentType === "EFS") {
    return fetchEfsOtherRequests(filters);
  } else if (filters.paymentType === "CARD") {
    return fetchAllCardInBatches(filters);
  } else {
    // ALL - combine both
    const [cardData, efsData] = await Promise.all([
      fetchAllCardInBatches(filters),
      fetchEfsOtherRequests(filters),
    ]);
    // Combine and sort by date descending
    return [...cardData, ...efsData].sort((a, b) => 
      new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );
  }
};

export const useFuelTransactions = (filters: FuelFilters) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch transactions with filters (batched to handle 10,000+ records)
  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ["fuel-transactions", filters],
    queryFn: async () => fetchAllInBatches(filters),
  });

  // Get unique truck numbers for filter dropdown (batched)
  const { data: truckNumbers = [] } = useQuery({
    queryKey: ["fuel-truck-numbers"],
    queryFn: async () => {
      const BATCH_SIZE = 1000;
      const allTrucks: string[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("fuel_transactions")
          .select("truck_number")
          .order("truck_number")
          .range(from, from + BATCH_SIZE - 1);
        if (error) throw error;
        allTrucks.push(...data.map((d) => d.truck_number));
        hasMore = data.length === BATCH_SIZE;
        from += BATCH_SIZE;
      }

      return [...new Set(allTrucks)].sort();
    },
  });

  // Get unique driver names for filter dropdown (batched)
  const { data: driverNames = [] } = useQuery({
    queryKey: ["fuel-driver-names"],
    queryFn: async () => {
      const BATCH_SIZE = 1000;
      const allDrivers: string[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("fuel_transactions")
          .select("driver_name")
          .order("driver_name")
          .range(from, from + BATCH_SIZE - 1);
        if (error) throw error;
        allDrivers.push(...data.map((d) => d.driver_name));
        hasMore = data.length === BATCH_SIZE;
        from += BATCH_SIZE;
      }

      return [...new Set(allDrivers)].sort();
    },
  });

  // Get unique item types for filter dropdown (batched)
  const { data: itemTypes = [] } = useQuery({
    queryKey: ["fuel-item-types"],
    queryFn: async () => {
      const BATCH_SIZE = 1000;
      const allItems: string[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("fuel_transactions")
          .select("item")
          .order("item")
          .range(from, from + BATCH_SIZE - 1);
        if (error) throw error;
        allItems.push(...data.map((d) => d.item));
        hasMore = data.length === BATCH_SIZE;
        from += BATCH_SIZE;
      }

      return [...new Set(allItems)].sort();
    },
  });

  // Helper to create a unique key for deduplication
  const createDuplicateKey = (record: {
    truck_number: string;
    driver_name: string;
    transaction_number: string;
    transaction_date: string;
    location_name?: string | null;
    city?: string | null;
    state?: string | null;
    fees?: number | null;
    item: string;
    unit_price?: number | null;
    quantity?: number | null;
    amount?: number | null;
  }) => {
    return [
      record.truck_number,
      record.driver_name,
      record.transaction_number,
      record.transaction_date,
      record.location_name || "",
      record.city || "",
      record.state || "",
      record.fees ?? 0,
      record.item,
      record.unit_price ?? 0,
      record.quantity ?? 0,
      record.amount ?? 0,
    ].join("|");
  };

  // Upload transactions mutation (adds new records, skips duplicates)
  const uploadMutation = useMutation({
    mutationFn: async ({ records, company }: { records: FuelTransactionInsert[]; company: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch existing transactions for this company to check for duplicates
      const BATCH_SIZE = 1000;
      const existingRecords: FuelTransaction[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("fuel_transactions")
          .select("*")
          .eq("company", company)
          .range(from, from + BATCH_SIZE - 1);
        
        if (error) throw error;
        existingRecords.push(...(data as FuelTransaction[]));
        hasMore = data.length === BATCH_SIZE;
        from += BATCH_SIZE;
      }

      // Create a set of existing record keys for fast lookup
      const existingKeys = new Set(existingRecords.map(createDuplicateKey));

      // Filter out duplicates from new records
      const newRecords = records.filter(record => {
        const key = createDuplicateKey(record);
        return !existingKeys.has(key);
      });

      if (newRecords.length === 0) {
        return { data: [], company, skipped: records.length };
      }

      // Add company and uploaded_by to each new record
      const recordsWithMetadata = newRecords.map(record => ({
        ...record,
        company,
        uploaded_by: user?.id || null,
      }));

      // Insert new records in batches
      const insertedRecords: FuelTransaction[] = [];
      for (let i = 0; i < recordsWithMetadata.length; i += BATCH_SIZE) {
        const batch = recordsWithMetadata.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from("fuel_transactions")
          .insert(batch)
          .select();

        if (error) throw error;
        insertedRecords.push(...(data as FuelTransaction[]));
      }

      return { data: insertedRecords, company, skipped: records.length - newRecords.length };
    },
    onSuccess: ({ data, company, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-truck-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-driver-names"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-item-types"] });
      const skippedMsg = skipped > 0 ? ` (${skipped} duplicates skipped)` : "";
      toast({
        title: "Upload successful",
        description: `${data?.length || 0} new transactions imported for ${company}${skippedMsg}.`,
      });
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete all transactions mutation (for clearing data)
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("fuel_transactions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-truck-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-driver-names"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-item-types"] });
      toast({
        title: "Data cleared",
        description: "All fuel transactions have been deleted.",
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

  // Toggle paid status mutation
  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase
        .from("fuel_transactions")
        .update({ paid })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Calculate summary statistics
  const summary = {
    dieselGallons: transactions
      .filter((t) => t.item === "ULSD")
      .reduce((sum, t) => sum + (t.quantity || 0), 0),
    dieselAmount: transactions
      .filter((t) => t.item === "ULSD")
      .reduce((sum, t) => sum + (t.amount || 0), 0),
    defGallons: transactions
      .filter((t) => t.item === "DEFD")
      .reduce((sum, t) => sum + (t.quantity || 0), 0),
    defAmount: transactions
      .filter((t) => t.item === "DEFD")
      .reduce((sum, t) => sum + (t.amount || 0), 0),
    feesTotal: transactions.reduce((sum, t) => sum + (t.fees || 0), 0),
    otherAmount: transactions
      .filter((t) => t.item !== "ULSD" && t.item !== "DEFD")
      .reduce((sum, t) => sum + (t.amount || 0), 0),
    grandTotal: transactions.reduce((sum, t) => sum + (t.amount || 0) + (t.fees || 0), 0),
    transactionCount: transactions.length,
  };

  return {
    transactions,
    isLoading,
    error,
    truckNumbers,
    driverNames,
    itemTypes,
    summary,
    uploadTransactions: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    deleteAll: deleteAllMutation.mutate,
    isDeleting: deleteAllMutation.isPending,
    togglePaid: togglePaidMutation.mutate,
    isTogglingPaid: togglePaidMutation.isPending,
  };
};
