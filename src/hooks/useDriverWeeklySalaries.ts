import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DriverWeeklySalary {
  id: string;
  driver_id: string;
  week_date: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export const useDriverWeeklySalaries = (driverId: string) => {
  const queryClient = useQueryClient();
  const queryKey = ["driver-weekly-salaries", driverId];

  const { data: salaries = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_weekly_salaries")
        .select("*")
        .eq("driver_id", driverId)
        .order("week_date", { ascending: true });
      if (error) throw error;
      return data as DriverWeeklySalary[];
    },
    enabled: !!driverId,
  });

  const upsertSalary = useMutation({
    mutationFn: async ({ week_date, amount }: { week_date: string; amount: number }) => {
      const { error } = await supabase
        .from("driver_weekly_salaries")
        .upsert(
          { driver_id: driverId, week_date, amount },
          { onConflict: "driver_id,week_date" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { salaries, isLoading, upsertSalary };
};
