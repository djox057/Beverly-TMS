import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DriverDebt {
  driverId: string;
  driverName: string;
  totalDebt: number;
}

export function useAllDriverDebts() {
  return useQuery({
    queryKey: ["all-driver-debts"],
    queryFn: async () => {
      // Fetch all unpaid/partial expenses
      const { data: expenses, error: expensesError } = await supabase
        .from("driver_expenses")
        .select("driver_id, amount, paid_amount, status")
        .neq("status", "paid");

      if (expensesError) {
        console.error("Error fetching driver expenses:", expensesError);
        throw expensesError;
      }

      // Fetch all cash advances
      const { data: cashAdvances, error: cashAdvError } = await supabase
        .from("driver_cash_advances")
        .select("driver_id, amount");

      if (cashAdvError) {
        console.error("Error fetching cash advances:", cashAdvError);
        throw cashAdvError;
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
      const debtByDriverId: Record<string, number> = {};

      // Add expense debts
      (expenses || []).forEach(exp => {
        if (!exp.driver_id) return;
        const remaining = exp.amount - (exp.paid_amount || 0);
        if (remaining > 0) {
          debtByDriverId[exp.driver_id] = (debtByDriverId[exp.driver_id] || 0) + remaining;
        }
      });

      // Add cash advance debts
      (cashAdvances || []).forEach(ca => {
        if (!ca.driver_id) return;
        debtByDriverId[ca.driver_id] = (debtByDriverId[ca.driver_id] || 0) + ca.amount;
      });

      // Build result map by driver name for easier lookup in Analytics
      const debtByDriverName: Record<string, number> = {};
      Object.entries(debtByDriverId).forEach(([driverId, debt]) => {
        const name = driverIdToName[driverId];
        if (name) {
          // Normalize the name for matching
          const normalizedName = name.trim();
          debtByDriverName[normalizedName] = (debtByDriverName[normalizedName] || 0) + debt;
        }
      });

      return debtByDriverName;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
