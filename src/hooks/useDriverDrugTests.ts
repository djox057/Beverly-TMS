import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DrugTest {
  id: string;
  driver_id: string;
  result: "positive" | "negative" | "pending" | null;
  tested_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useDriverDrugTests = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all drug tests
  const { data: drugTests, isLoading } = useQuery({
    queryKey: ["driver-drug-tests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_drug_tests")
        .select("*");

      if (error) throw error;
      return data as DrugTest[];
    },
  });

  // Upsert drug test mutation
  const upsertDrugTest = useMutation({
    mutationFn: async ({
      driverId,
      result,
    }: {
      driverId: string;
      result: "positive" | "negative" | "pending" | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("driver_drug_tests")
        .upsert(
          {
            driver_id: driverId,
            result,
            tested_by: user?.id,
          },
          { onConflict: "driver_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-drug-tests"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast({
        title: "Drug test updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating drug test",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper function to get drug test for a driver
  const getDrugTestForDriver = (driverId: string) => {
    return drugTests?.find((test) => test.driver_id === driverId);
  };

  return {
    drugTests,
    isLoading,
    upsertDrugTest,
    getDrugTestForDriver,
  };
};
