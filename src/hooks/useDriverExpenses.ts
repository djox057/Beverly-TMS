import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";

// Get current date in Chicago timezone
function getChicagoDate(): string {
  return formatInTimeZone(new Date(), "America/Chicago", "yyyy-MM-dd");
}

export type ExpenseType = 'expense' | 'yearly' | 'credit';

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
  expense_type: ExpenseType;
  created_at: string;
  updated_at: string;
  cash_advance_id: string | null; // Links to driver_cash_advances table
}

// Calculate status based on paid_amount vs amount
export function calculateExpenseStatus(amount: number, paidAmount: number | null | undefined): string {
  const paid = paidAmount ?? 0;
  if (paid >= amount && amount > 0) return "paid";
  if (paid > 0) return "partial";
  return "pending";
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
  expense_type?: ExpenseType;
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
      // Auto-calculate status based on paid_amount vs amount
      const status = calculateExpenseStatus(expense.amount, expense.paid_amount);
      
      const { data, error } = await supabase
        .from("driver_expenses")
        .insert({ ...expense, status })
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
      // If amount or paid_amount is being updated, recalculate status
      let finalUpdates = { ...updates };
      
      // Fetch current expense to check if it's linked to a repair
      const { data: current } = await supabase
        .from("driver_expenses")
        .select("amount, paid_amount, repair_id")
        .eq("id", id)
        .single();
      
      if (updates.amount !== undefined || updates.paid_amount !== undefined) {
        const amount = updates.amount ?? current?.amount ?? 0;
        const paidAmount = updates.paid_amount !== undefined ? updates.paid_amount : current?.paid_amount;
        finalUpdates.status = calculateExpenseStatus(amount, paidAmount);
        
        // Auto-set paid_date to Chicago time when switching to paid
        const currentPaidAmount = current?.paid_amount ?? 0;
        const newPaidAmount = updates.paid_amount ?? currentPaidAmount;
        if (currentPaidAmount === 0 && newPaidAmount > 0 && !updates.paid_date) {
          finalUpdates.paid_date = getChicagoDate();
        } else if (newPaidAmount === 0) {
          finalUpdates.paid_date = null;
        }
      }
      
      const { data, error } = await supabase
        .from("driver_expenses")
        .update(finalUpdates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // If this expense is linked to a repair, sync paid status
      if (current?.repair_id) {
        const amount = updates.amount ?? current?.amount ?? 0;
        const paidAmount = updates.paid_amount !== undefined ? updates.paid_amount : current?.paid_amount ?? 0;
        const isPaid = paidAmount >= amount && amount > 0;
        
        await supabase
          .from("repairs")
          .update({ 
            is_paid: isPaid,
            // Also sync reason and accounting_note if updated
            ...(updates.explanation !== undefined && { reason: updates.explanation }),
            ...(updates.notice_1 !== undefined && { accounting_note: updates.notice_1 }),
            ...(updates.amount !== undefined && { amount: updates.amount }),
          })
          .eq("id", current.repair_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
      queryClient.invalidateQueries({ queryKey: ["repairs"] });
      toast.success("Expense updated successfully");
    },
    onError: (error) => {
      console.error("Error updating expense:", error);
      toast.error("Failed to update expense");
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      // First check if this expense is linked to a repair or cash advance
      const { data: expense } = await supabase
        .from("driver_expenses")
        .select("repair_id, cash_advance_id")
        .eq("id", expenseId)
        .single();

      // If linked to repair, delete the repair (which will cascade delete the expense)
      if (expense?.repair_id) {
        const { error: repairError } = await supabase
          .from("repairs")
          .delete()
          .eq("id", expense.repair_id);
        
        if (repairError) throw repairError;
      } else if (expense?.cash_advance_id) {
        // If linked to cash advance, delete the cash advance (which will cascade delete the expense)
        const { error: cashAdvanceError } = await supabase
          .from("driver_cash_advances")
          .delete()
          .eq("id", expense.cash_advance_id);
        
        if (cashAdvanceError) throw cashAdvanceError;
      } else {
        // Otherwise just delete the expense directly
        const { error } = await supabase
          .from("driver_expenses")
          .delete()
          .eq("id", expenseId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-expenses", driverId] });
      queryClient.invalidateQueries({ queryKey: ["driver-cash-advances", driverId] });
      queryClient.invalidateQueries({ queryKey: ["repairs"] });
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
