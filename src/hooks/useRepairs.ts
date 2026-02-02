import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Repair {
  id: string;
  repair_type: 'truck' | 'trailer';
  truck_id: string | null;
  trailer_id: string | null;
  driver_id: string;
  reason: string;
  amount: number;
  is_paid: boolean;
  repair_date: string;
  accounting_note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined fields
  truck_number?: string;
  trailer_number?: string;
  driver_name?: string;
}

export interface RepairFormData {
  repair_type: 'truck' | 'trailer';
  truck_id: string | null;
  trailer_id: string | null;
  driver_id: string;
  reason: string;
  amount: number;
  is_paid: boolean;
  repair_date: string;
  accounting_note: string | null;
}

export function useRepairs(repairType?: 'truck' | 'trailer') {
  const queryClient = useQueryClient();

  const { data: repairs = [], isLoading } = useQuery({
    queryKey: ['repairs', repairType],
    queryFn: async () => {
      let query = supabase
        .from('repairs')
        .select(`
          *,
          trucks:truck_id(truck_number),
          trailers:trailer_id(trailer_number),
          drivers:driver_id(name)
        `)
        .order('created_at', { ascending: false });

      if (repairType) {
        query = query.eq('repair_type', repairType);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((repair: any) => ({
        ...repair,
        truck_number: repair.trucks?.truck_number || null,
        trailer_number: repair.trailers?.trailer_number || null,
        driver_name: repair.drivers?.name || null,
      })) as Repair[];
    },
  });

  const createRepair = useMutation({
    mutationFn: async (data: RepairFormData) => {
      const { data: result, error } = await supabase
        .from('repairs')
        .insert({
          repair_type: data.repair_type,
          truck_id: data.truck_id,
          trailer_id: data.trailer_id,
          driver_id: data.driver_id,
          reason: data.reason,
          amount: data.amount,
          is_paid: data.is_paid,
          repair_date: data.repair_date,
          accounting_note: data.accounting_note,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success("Repair created successfully");
    },
    onError: (error) => {
      console.error('Error creating repair:', error);
      toast.error("Failed to create repair");
    },
  });

  const updateRepair = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RepairFormData> }) => {
      const { data: result, error } = await supabase
        .from('repairs')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success("Repair updated successfully");
    },
    onError: (error) => {
      console.error('Error updating repair:', error);
      toast.error("Failed to update repair");
    },
  });

  const deleteRepair = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('repairs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success("Repair deleted successfully");
    },
    onError: (error) => {
      console.error('Error deleting repair:', error);
      toast.error("Failed to delete repair");
    },
  });

  const togglePaid = useMutation({
    mutationFn: async ({ id, is_paid }: { id: string; is_paid: boolean }) => {
      const { error } = await supabase
        .from('repairs')
        .update({ is_paid })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
    },
    onError: (error) => {
      console.error('Error updating paid status:', error);
      toast.error("Failed to update paid status");
    },
  });

  return {
    repairs,
    isLoading,
    createRepair,
    updateRepair,
    deleteRepair,
    togglePaid,
  };
}
