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

const PAGE_SIZE = 100;

// Apply common filters to a query builder
const applyFilters = (query: any, filters: FuelFilters) => {
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
  if (filters.paymentType === "EFS") {
    query = query.eq("location_name", "EFS Request");
  } else if (filters.paymentType === "CARD") {
    query = query.or("location_name.neq.EFS Request,location_name.is.null");
  }
  return query;
};

// Helper function to fetch all records for summary calculation
const fetchAllInBatches = async (filters: FuelFilters): Promise<FuelTransaction[]> => {
  const BATCH_SIZE = 1000;
  let allData: FuelTransaction[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("fuel_transactions")
      .select("id, item, quantity, amount, fees")
      .order("transaction_date", { ascending: false })
      .range(from, from + BATCH_SIZE - 1);

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) throw error;

    allData = [...allData, ...(data as any[])];

    if (data.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      from += BATCH_SIZE;
    }
  }

  return allData as any;
};

export const useFuelTransactions = (filters: FuelFilters, page: number = 1) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch paginated transactions with count
  const { data: paginatedResult, isLoading, error } = useQuery({
    queryKey: ["fuel-transactions", filters, page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("fuel_transactions")
        .select("*", { count: "exact" })
        .order("transaction_date", { ascending: false })
        .range(from, to);

      query = applyFilters(query, filters);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        transactions: (data || []) as FuelTransaction[],
        totalCount: count || 0,
      };
    },
  });

  const transactions = paginatedResult?.transactions || [];
  const totalCount = paginatedResult?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch summary data (lightweight - only needed columns)
  const { data: summaryData } = useQuery({
    queryKey: ["fuel-transactions-summary", filters],
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

      const existingKeys = new Set(existingRecords.map(createDuplicateKey));

      const newRecords = records.filter(record => {
        const key = createDuplicateKey(record);
        return !existingKeys.has(key);
      });

      if (newRecords.length === 0) {
        return { data: [], company, skipped: records.length };
      }

      const recordsWithMetadata = newRecords.map(record => ({
        ...record,
        company,
        uploaded_by: user?.id || null,
      }));

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
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions-summary"] });
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

  // Delete all transactions mutation
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("fuel_transactions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-transactions-summary"] });
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

  // Calculate summary statistics from lightweight summary data
  const allTxns = summaryData || [];
  const summary = {
    dieselGallons: allTxns
      .filter((t: any) => t.item === "ULSD")
      .reduce((sum: number, t: any) => sum + (t.quantity || 0), 0),
    dieselAmount: allTxns
      .filter((t: any) => t.item === "ULSD")
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0),
    defGallons: allTxns
      .filter((t: any) => t.item === "DEFD")
      .reduce((sum: number, t: any) => sum + (t.quantity || 0), 0),
    defAmount: allTxns
      .filter((t: any) => t.item === "DEFD")
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0),
    feesTotal: allTxns.reduce((sum: number, t: any) => sum + (t.fees || 0), 0),
    otherAmount: allTxns
      .filter((t: any) => t.item !== "ULSD" && t.item !== "DEFD")
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0),
    grandTotal: allTxns.reduce((sum: number, t: any) => sum + (t.amount || 0) + (t.fees || 0), 0),
    transactionCount: totalCount,
  };

  return {
    transactions,
    totalCount,
    totalPages,
    pageSize: PAGE_SIZE,
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
