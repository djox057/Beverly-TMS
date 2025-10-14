import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DispatcherFleet {
  dispatcher: {
    id: string;
    full_name: string;
    email: string;
    ext?: string;
  };
  trucks: any[];
  isActive: boolean;
}

export const useFleetManagement = () => {
  const [dispatchers, setDispatchers] = useState<DispatcherFleet[]>([]);
  const [availableTrucks, setAvailableTrucks] = useState<any[]>([]);
  const [allDispatchers, setAllDispatchers] = useState<any[]>([]);
  const [dispatcherStatuses, setDispatcherStatuses] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFleetData = async () => {
    try {
      setLoading(true);
      
      // Fetch all dispatchers, managers, and supervisors from user_roles (exclude accounting)
      const { data: dispatchRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['dispatch', 'manager', 'supervisor']);

      if (rolesError) throw rolesError;

      const dispatcherUserIds = (dispatchRoles || []).map(r => r.user_id);

      const { data: dispatcherProfiles, error: dispatcherError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, ext')
        .in('user_id', dispatcherUserIds.length > 0 ? dispatcherUserIds : ['00000000-0000-0000-0000-000000000000'])
        .order('full_name');

      if (dispatcherError) throw dispatcherError;

      // Fetch all trucks with their dispatcher assignments and driver info
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select(`
          *,
          driver1:drivers!trucks_driver1_id_fkey(id, name, phone, email)
        `)
        .order('updated_at', { ascending: false });

      if (trucksError) throw trucksError;

      // Fetch dispatcher statuses
      const { data: statuses, error: statusError } = await supabase
        .from('dispatcher_status')
        .select('dispatcher_id, is_active');

      if (statusError) throw statusError;

      // Create status map
      const statusMap = new Map<string, boolean>();
      statuses?.forEach(status => {
        statusMap.set(status.dispatcher_id, status.is_active);
      });
      setDispatcherStatuses(statusMap);

      // Group trucks by dispatcher
      const dispatcherGroups: { [key: string]: any[] } = {};
      const unassignedTrucks: any[] = [];

      trucks?.forEach(truck => {
        if (truck.dispatcher_id) {
          if (!dispatcherGroups[truck.dispatcher_id]) {
            dispatcherGroups[truck.dispatcher_id] = [];
          }
          dispatcherGroups[truck.dispatcher_id].push(truck);
        } else {
          unassignedTrucks.push(truck);
        }
      });

      // Create dispatcher fleets array
      const dispatcherFleets = dispatcherProfiles?.map(dispatcher => ({
        dispatcher: {
          id: dispatcher.user_id,
          full_name: dispatcher.full_name,
          email: dispatcher.email,
          ext: dispatcher.ext
        },
        trucks: dispatcherGroups[dispatcher.user_id] || [],
        isActive: statusMap.get(dispatcher.user_id) ?? true
      })) || [];

      // Filter out dispatchers with no trucks for the main list, but keep all for assignment  
      setDispatchers(dispatcherFleets);
      setAllDispatchers(dispatcherProfiles?.map(d => ({ 
        id: d.user_id, 
        full_name: d.full_name, 
        email: d.email,
        ext: d.ext
      })) || []);
      setAvailableTrucks(unassignedTrucks);
    } catch (error: any) {
      console.error('Error fetching fleet data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch fleet data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const assignTruckToDispatcher = async (truckId: string, dispatcherId: string) => {
    try {
      const { error } = await supabase
        .from('trucks')
        .update({ dispatcher_id: dispatcherId })
        .eq('id', truckId);

      if (error) throw error;

      // Find dispatcher name for the toast
      const dispatcher = allDispatchers.find(d => d.id === dispatcherId);
      const dispatcherName = dispatcher?.full_name || dispatcher?.email || 'dispatcher';

      toast({
        title: "Success",
        description: `Truck assigned to ${dispatcherName} successfully`,
      });

      fetchFleetData();
    } catch (error: any) {
      console.error('Error assigning truck to dispatcher:', error);
      toast({
        title: "Error",
        description: "Failed to assign truck to dispatcher",
        variant: "destructive",
      });
    }
  };

  const removeTruckFromDispatcher = async (truckId: string) => {
    try {
      const { error } = await supabase
        .from('trucks')
        .update({ dispatcher_id: null })
        .eq('id', truckId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Truck removed from dispatcher successfully",
      });

      fetchFleetData();
    } catch (error: any) {
      console.error('Error removing truck from dispatcher:', error);
      toast({
        title: "Error",
        description: "Failed to remove truck from dispatcher",
        variant: "destructive",
      });
    }
  };

  const setDispatcherOffDuty = async (dispatcherId: string, truckAssignments: Record<string, string>) => {
    try {
      const truckIds = Object.keys(truckAssignments);
      
      // Store original truck assignments before going off duty
      const { error: statusError } = await supabase
        .from('dispatcher_status')
        .upsert({
          dispatcher_id: dispatcherId,
          is_active: false,
          inactive_trucks: truckIds,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'dispatcher_id'
        });

      if (statusError) throw statusError;

      // Assign each truck to its cover dispatcher
      for (const [truckId, coverId] of Object.entries(truckAssignments)) {
        const { error: assignError } = await supabase
          .from('trucks')
          .update({ dispatcher_id: coverId })
          .eq('id', truckId);

        if (assignError) throw assignError;
      }

      toast({
        title: "Success",
        description: `Dispatcher set to Off Duty. ${truckIds.length} trucks reassigned to cover dispatchers.`,
      });

      fetchFleetData();
    } catch (error: any) {
      console.error('Error setting dispatcher off duty:', error);
      toast({
        title: "Error",
        description: "Failed to set dispatcher off duty",
        variant: "destructive",
      });
    }
  };

  const setDispatcherActive = async (dispatcherId: string) => {
    try {
      // Get the stored truck IDs from when dispatcher went off duty
      const { data: status } = await supabase
        .from('dispatcher_status')
        .select('inactive_trucks')
        .eq('dispatcher_id', dispatcherId)
        .maybeSingle();

      const originalTruckIds = (status?.inactive_trucks as string[]) || [];

      if (originalTruckIds.length > 0) {
        // Reassign all original trucks back to this dispatcher
        const { error: reassignError } = await supabase
          .from('trucks')
          .update({ dispatcher_id: dispatcherId })
          .in('id', originalTruckIds);

        if (reassignError) throw reassignError;

        toast({
          title: "Success",
          description: `Dispatcher set to Active. ${originalTruckIds.length} trucks returned.`,
        });
      } else {
        toast({
          title: "Success",
          description: "Dispatcher set to Active.",
        });
      }

      // Update dispatcher status to active
      const { error: statusError } = await supabase
        .from('dispatcher_status')
        .upsert({
          dispatcher_id: dispatcherId,
          is_active: true,
          inactive_trucks: null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'dispatcher_id'
        });

      if (statusError) throw statusError;

      fetchFleetData();
    } catch (error: any) {
      console.error('Error setting dispatcher active:', error);
      toast({
        title: "Error",
        description: "Failed to set dispatcher active",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, []);

  return {
    dispatchers,
    availableTrucks,
    allDispatchers,
    dispatcherStatuses,
    loading,
    fetchFleetData,
    assignTruckToDispatcher,
    removeTruckFromDispatcher,
    setDispatcherOffDuty,
    setDispatcherActive,
  };
};
