import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";

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
      truckId,
    }: {
      driverId: string;
      result: "positive" | "negative" | "pending" | null;
      truckId?: string;
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

      // Add comment to driver notes if truckId is provided and it's a valid UUID (not prefixed like "driver-xxx")
      const isValidTruckId = truckId && !truckId.startsWith('driver-');
      
      if (isValidTruckId && result) {
        const noteText = result === 'positive' 
          ? 'Drug result Positive' 
          : result === 'negative' 
          ? 'Drug result Negative' 
          : 'Drug test result Pending';

        // Get existing note for this driver (use driverId directly)
        const { data: existingNote } = await supabase
          .from("truck_notes")
          .select("id, note")
          .eq("driver_id", driverId)
          .maybeSingle();

        // Replace entire note with just the drug test result
        const newNote = noteText;

        // Update or insert driver note
        if (existingNote) {
          // Update existing note
          await supabase
            .from("truck_notes")
            .update({
              note: newNote,
              updated_by: user?.id,
            })
            .eq("id", existingNote.id);
        } else {
          // Insert new note
          await supabase
            .from("truck_notes")
            .insert({
              truck_id: truckId,
              driver_id: driverId,
              note: newNote,
              updated_by: user?.id,
            });
        }
      }

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
  const getDrugTestForDriver = useCallback((driverId: string) => {
    return drugTests?.find((test) => test.driver_id === driverId);
  }, [drugTests]);

  return {
    drugTests,
    isLoading,
    upsertDrugTest,
    getDrugTestForDriver,
  };
};
