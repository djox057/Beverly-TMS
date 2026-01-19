import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DriverProblem {
  id: string;
  driver_id: string;
  reason: string;
  truck_number: string | null;
  dispatcher_name: string | null;
  created_at: string;
  created_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  status: string | null;
}

export function useDriverProblems() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all active (unresolved) driver problems
  const { data: problems = [], isLoading } = useQuery({
    queryKey: ["driver-problems"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_problems")
        .select("*")
        .is("resolved_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DriverProblem[];
    },
  });

  // Add a new problem
  const addProblem = useMutation({
    mutationFn: async ({ 
      driverId, 
      reason, 
      truckNumber, 
      dispatcherName 
    }: { 
      driverId: string; 
      reason: string; 
      truckNumber?: string; 
      dispatcherName?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("driver_problems")
        .insert({
          driver_id: driverId,
          reason,
          truck_number: truckNumber || null,
          dispatcher_name: dispatcherName || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-problems"] });
      toast({
        title: "Problem reported",
        description: "Driver problem has been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Resolve a problem
  const resolveProblem = useMutation({
    mutationFn: async (problemId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("driver_problems")
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id || null,
        })
        .eq("id", problemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-problems"] });
      toast({
        title: "Problem resolved",
        description: "Driver problem has been marked as resolved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update a problem (reason or status)
  const updateProblem = useMutation({
    mutationFn: async ({ problemId, reason, status }: { problemId: string; reason?: string; status?: string }) => {
      const updateData: { reason?: string; status?: string } = {};
      if (reason !== undefined) updateData.reason = reason;
      if (status !== undefined) updateData.status = status;

      const { error } = await supabase
        .from("driver_problems")
        .update(updateData)
        .eq("id", problemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-problems"] });
      toast({
        title: "Problem updated",
        description: "Driver problem has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get problem for a specific driver
  const getProblemForDriver = (driverId: string) => {
    return problems.find((p) => p.driver_id === driverId);
  };

  // Check if driver has a problem
  const hasDriverProblem = (driverId: string) => {
    return problems.some((p) => p.driver_id === driverId);
  };

  return {
    problems,
    isLoading,
    addProblem,
    resolveProblem,
    updateProblem,
    getProblemForDriver,
    hasDriverProblem,
  };
}
