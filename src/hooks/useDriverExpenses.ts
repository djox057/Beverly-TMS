import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DriverExpense {
  id: string;
  driver_id: string;
  truck_number: string | null;
  trailer_number: string | null;
  name: string;
  explanation: string;
  expense_date: string | null;
  amount: number;
  status: string;
  paid_date: string | null;
  paid_amount: number | null;
  notice_1: string | null;
  notice_2: string | null;
  is_fixed: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewDriverExpense {
  driver_id: string;
  truck_number?: string | null;
  trailer_number?: string | null;
  name: string;
  explanation: string;
  expense_date?: string | null;
  amount: number;
  status?: string;
  paid_date?: string | null;
  paid_amount?: number | null;
  notice_1?: string | null;
  notice_2?: string | null;
  is_fixed?: boolean;
}

// Default fixed expenses for new drivers
export const DEFAULT_FIXED_EXPENSES: Omit<NewDriverExpense, 'driver_id'>[] = [
  {
    name: "Start Expenses",
    explanation: "Escrow $2,000 ($250/8 week)",
    amount: 2000,
    status: "pending",
    notice_1: "$250/8 week",
    is_fixed: true
  },
  {
    name: "Equipment deposit",
    explanation: "one time charge",
    amount: 200,
    status: "pending",
    is_fixed: true
  },
  {
    name: "Start Expenses",
    explanation: "Drug Test",
    amount: 90,
    status: "pending",
    is_fixed: true
  },
  {
    name: "Start Expenses",
    explanation: "MVR; PSP",
    amount: 45,
    status: "pending",
    is_fixed: true
  }
];

export function useDriverExpenses(driverId: string | null) {
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ["driver-expenses", driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from("driver_expenses")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching driver expenses:", error);
        throw error;
      }

      return data as DriverExpense[];
    },
    enabled: !!driverId,
  });

  const addExpenseMutation = useMutation({
    mutationFn: async (expense: NewDriverExpense) => {
      const { data, error } = await supabase
        .from("driver_expenses")
        .insert(expense)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
      toast.success("Expense added successfully");
    },
    onError: (error) => {
      console.error("Error adding expense:", error);
      toast.error("Failed to add expense");
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DriverExpense> & { id: string }) => {
      const { data, error } = await supabase
        .from("driver_expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
      toast.success("Expense updated successfully");
    },
    onError: (error) => {
      console.error("Error updating expense:", error);
      toast.error("Failed to update expense");
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase
        .from("driver_expenses")
        .delete()
        .eq("id", expenseId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
      toast.success("Expense deleted successfully");
    },
    onError: (error) => {
      console.error("Error deleting expense:", error);
      toast.error("Failed to delete expense");
    },
  });

  const initializeDefaultExpenses = useMutation({
    mutationFn: async (driverId: string) => {
      // Check if driver already has fixed expenses
      const { data: existing } = await supabase
        .from("driver_expenses")
        .select("id")
        .eq("driver_id", driverId)
        .eq("is_fixed", true)
        .limit(1);

      if (existing && existing.length > 0) {
        return; // Already initialized
      }

      const expensesToInsert = DEFAULT_FIXED_EXPENSES.map(exp => ({
        ...exp,
        driver_id: driverId,
      }));

      const { error } = await supabase
        .from("driver_expenses")
        .insert(expensesToInsert);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
    },
  });

  return {
    expenses: expensesQuery.data || [],
    isLoading: expensesQuery.isLoading,
    error: expensesQuery.error,
    addExpense: addExpenseMutation.mutate,
    updateExpense: updateExpenseMutation.mutate,
    deleteExpense: deleteExpenseMutation.mutate,
    initializeDefaultExpenses: initializeDefaultExpenses.mutate,
    isAdding: addExpenseMutation.isPending,
    isUpdating: updateExpenseMutation.isPending,
  };
}
