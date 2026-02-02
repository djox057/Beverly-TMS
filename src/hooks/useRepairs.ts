import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateExpenseStatus } from "@/hooks/useDriverExpenses";

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
      // Create repair
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

      // Get truck/trailer number for expense
      let truckNumber: string | null = null;
      let trailerNumber: string | null = null;
      
      if (data.truck_id) {
        const { data: truck } = await supabase
          .from('trucks')
          .select('truck_number')
          .eq('id', data.truck_id)
          .single();
        truckNumber = truck?.truck_number || null;
      }
      
      if (data.trailer_id) {
        const { data: trailer } = await supabase
          .from('trailers')
          .select('trailer_number')
          .eq('id', data.trailer_id)
          .single();
        trailerNumber = trailer?.trailer_number || null;
      }

      // Also create driver_expense linked to this repair
      const paidAmount = data.is_paid ? data.amount : 0;
      const status = calculateExpenseStatus(data.amount, paidAmount);
      
      await supabase.from('driver_expenses').insert({
        driver_id: data.driver_id,
        repair_id: result.id,
        name: data.repair_type === 'truck' ? 'Truck Repair' : 'Trailer Repair',
        explanation: data.reason,
        amount: data.amount,
        paid_amount: paidAmount,
        paid_date: data.is_paid ? data.repair_date : null,
        notice_1: data.accounting_note,
        status,
        expense_date: data.repair_date,
        truck_number: truckNumber,
        trailer_number: trailerNumber,
        is_fixed: false,
      });

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      queryClient.invalidateQueries({ queryKey: ['driver-expenses'] });
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

      // Update linked driver_expense if exists
      const { data: linkedExpense } = await supabase
        .from('driver_expenses')
        .select('id')
        .eq('repair_id', id)
        .single();

      if (linkedExpense) {
        const paidAmount = data.is_paid ? (data.amount ?? result.amount) : 0;
        const status = calculateExpenseStatus(data.amount ?? result.amount, paidAmount);
        
        // Get truck/trailer number if changed
        let truckNumber: string | null = null;
        let trailerNumber: string | null = null;
        
        const truckId = data.truck_id ?? result.truck_id;
        const trailerId = data.trailer_id ?? result.trailer_id;
        
        if (truckId) {
          const { data: truck } = await supabase
            .from('trucks')
            .select('truck_number')
            .eq('id', truckId)
            .single();
          truckNumber = truck?.truck_number || null;
        }
        
        if (trailerId) {
          const { data: trailer } = await supabase
            .from('trailers')
            .select('trailer_number')
            .eq('id', trailerId)
            .single();
          trailerNumber = trailer?.trailer_number || null;
        }

        await supabase
          .from('driver_expenses')
          .update({
            explanation: data.reason ?? result.reason,
            amount: data.amount ?? result.amount,
            paid_amount: paidAmount,
            paid_date: data.is_paid ? (data.repair_date ?? result.repair_date) : null,
            notice_1: data.accounting_note ?? result.accounting_note,
            status,
            expense_date: data.repair_date ?? result.repair_date,
            truck_number: truckNumber,
            trailer_number: trailerNumber,
          })
          .eq('id', linkedExpense.id);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      queryClient.invalidateQueries({ queryKey: ['driver-expenses'] });
      toast.success("Repair updated successfully");
    },
    onError: (error) => {
      console.error('Error updating repair:', error);
      toast.error("Failed to update repair");
    },
  });

  const deleteRepair = useMutation({
    mutationFn: async (id: string) => {
      // Delete will cascade to driver_expenses due to ON DELETE CASCADE
      const { error } = await supabase
        .from('repairs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      queryClient.invalidateQueries({ queryKey: ['driver-expenses'] });
      toast.success("Repair deleted successfully");
    },
    onError: (error) => {
      console.error('Error deleting repair:', error);
      toast.error("Failed to delete repair");
    },
  });

  const togglePaid = useMutation({
    mutationFn: async ({ id, is_paid }: { id: string; is_paid: boolean }) => {
      // Get the repair amount first
      const { data: repair } = await supabase
        .from('repairs')
        .select('amount, repair_date')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('repairs')
        .update({ is_paid })
        .eq('id', id);

      if (error) throw error;

      // Update linked driver_expense
      const { data: linkedExpense } = await supabase
        .from('driver_expenses')
        .select('id')
        .eq('repair_id', id)
        .single();

      if (linkedExpense && repair) {
        const paidAmount = is_paid ? repair.amount : 0;
        const status = calculateExpenseStatus(repair.amount, paidAmount);
        
        await supabase
          .from('driver_expenses')
          .update({
            paid_amount: paidAmount,
            paid_date: is_paid ? repair.repair_date : null,
            status,
          })
          .eq('id', linkedExpense.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      queryClient.invalidateQueries({ queryKey: ['driver-expenses'] });
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
