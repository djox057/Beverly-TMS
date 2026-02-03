import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DriverDebtData {
  currentDebt: number; // Excludes yearly expenses
  totalDebt: number;   // Includes everything
}

export function useAllDriverDebts() {
  return useQuery({
    queryKey: ["all-driver-debts"],
    queryFn: async () => {
      // Fetch all unpaid/partial expenses (now includes cash advances)
      // Also fetch expense_type to handle credits and yearly differently
      const { data: expenses, error: expensesError } = await supabase
        .from("driver_expenses")
        .select("driver_id, amount, paid_amount, status, expense_type")
        .neq("status", "paid");

      if (expensesError) {
        console.error("Error fetching driver expenses:", expensesError);
        throw expensesError;
      }

      // Fetch driver names for mapping
      const { data: drivers, error: driversError } = await supabase
        .from("drivers")
        .select("id, name");

      if (driversError) {
        console.error("Error fetching drivers:", driversError);
        throw driversError;
      }

      // Build driver name map
      const driverIdToName: Record<string, string> = {};
      (drivers || []).forEach(d => {
        if (d.name) driverIdToName[d.id] = d.name;
      });

      // Calculate debt per driver
      // Credits subtract from debt, yearly only adds to total (not current)
      const debtByDriverId: Record<string, { currentDebt: number; totalDebt: number }> = {};

      (expenses || []).forEach(exp => {
        if (!exp.driver_id) return;
        const remaining = exp.amount - (exp.paid_amount || 0);
        if (remaining <= 0) return;

        if (!debtByDriverId[exp.driver_id]) {
          debtByDriverId[exp.driver_id] = { currentDebt: 0, totalDebt: 0 };
        }

        if (exp.expense_type === 'company_expense') {
          // Company expenses don't count toward any debt
          return;
        } else if (exp.expense_type === 'credit') {
          // Credits subtract from both
          debtByDriverId[exp.driver_id].currentDebt -= remaining;
          debtByDriverId[exp.driver_id].totalDebt -= remaining;
        } else if (exp.expense_type === 'yearly') {
          // Yearly only adds to total
          debtByDriverId[exp.driver_id].totalDebt += remaining;
        } else {
          // Regular expenses add to both
          debtByDriverId[exp.driver_id].currentDebt += remaining;
          debtByDriverId[exp.driver_id].totalDebt += remaining;
        }
      });

      // Build result map by driver name for easier lookup in Analytics
      const debtByDriverName: Record<string, DriverDebtData> = {};
      Object.entries(debtByDriverId).forEach(([driverId, debt]) => {
        const name = driverIdToName[driverId];
        if (name) {
          const normalizedName = name.trim();
          if (!debtByDriverName[normalizedName]) {
            debtByDriverName[normalizedName] = { currentDebt: 0, totalDebt: 0 };
          }
          debtByDriverName[normalizedName].currentDebt += debt.currentDebt;
          debtByDriverName[normalizedName].totalDebt += debt.totalDebt;
        }
      });

      return debtByDriverName;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
