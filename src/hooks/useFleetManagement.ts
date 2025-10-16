import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Use React Query to cache fleet data
  const { data: fleetData, isLoading: loading, refetch: fetchFleetData } = useQuery({
    queryKey: ['fleet-management'],
    queryFn: async () => {
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

      // Fetch dispatcher statuses with inactive trucks data
      const { data: statuses, error: statusError } = await supabase
        .from('dispatcher_status')
        .select('dispatcher_id, is_active, inactive_trucks');

      if (statusError) throw statusError;

      // Create status map and store full status data
      const statusMap = new Map<string, { isActive: boolean; inactiveTrucks: any[] }>();
      statuses?.forEach(status => {
        statusMap.set(status.dispatcher_id, {
          isActive: status.is_active,
          inactiveTrucks: (status.inactive_trucks as any[]) || []
        });
      });

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
      const dispatcherFleets = dispatcherProfiles?.map(dispatcher => {
        const status = statusMap.get(dispatcher.user_id);
        const isActive = status?.isActive ?? true;
        
        // Use actual trucks if active, placeholder trucks if inactive
        const dispatcherTrucks = isActive 
          ? (dispatcherGroups[dispatcher.user_id] || [])
          : (status?.inactiveTrucks || []);

        return {
          dispatcher: {
            id: dispatcher.user_id,
            full_name: dispatcher.full_name,
            email: dispatcher.email,
            ext: dispatcher.ext
          },
          trucks: dispatcherTrucks,
          isActive
        };
      }) || [];

      return {
        dispatchers: dispatcherFleets,
        allDispatchers: dispatcherProfiles?.map(d => ({ 
          id: d.user_id, 
          full_name: d.full_name, 
          email: d.email,
          ext: d.ext
        })) || [],
        availableTrucks: unassignedTrucks
      };
    },
    staleTime: 3 * 60 * 1000, // Cache for 3 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
  });

  const dispatchers = fleetData?.dispatchers || [];
  const allDispatchers = fleetData?.allDispatchers || [];
  const availableTrucks = fleetData?.availableTrucks || [];
  const dispatcherStatuses = new Map<string, boolean>();

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

      queryClient.invalidateQueries({ queryKey: ['fleet-management'] });
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

      queryClient.invalidateQueries({ queryKey: ['fleet-management'] });
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
      // Get the dispatcher's trucks with their full data for placeholders
      const dispatcherFleet = dispatchers.find(d => d.dispatcher.id === dispatcherId);
      if (!dispatcherFleet) throw new Error('Dispatcher not found');

      // Store complete truck data for placeholders
      const inactiveTrucksData = dispatcherFleet.trucks.map(truck => ({
        id: truck.id,
        truck_number: truck.truck_number,
        driver1: truck.driver1,
        company_id: truck.company_id,
        trailer_id: truck.trailer_id
      }));
      
      // Store original truck assignments before going off duty
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      const { error: statusError } = await supabase
        .from('dispatcher_status')
        .upsert({
          dispatcher_id: dispatcherId,
          is_active: false,
          inactive_trucks: inactiveTrucksData,
          updated_at: timestamp
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
        description: `Dispatcher set to Off Duty. ${Object.keys(truckAssignments).length} trucks reassigned to cover dispatchers.`,
      });

      queryClient.invalidateQueries({ queryKey: ['fleet-management'] });
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
      // Get the stored truck data from when dispatcher went off duty
      const { data: status } = await supabase
        .from('dispatcher_status')
        .select('inactive_trucks')
        .eq('dispatcher_id', dispatcherId)
        .maybeSingle();

      const originalTrucksData = (status?.inactive_trucks as any[]) || [];

      if (originalTrucksData.length > 0) {
        // Extract truck IDs from the stored data
        const truckIds = originalTrucksData.map((t: any) => t.id);
        
        // Reassign all original trucks back to this dispatcher
        const { error: reassignError } = await supabase
          .from('trucks')
          .update({ dispatcher_id: dispatcherId })
          .in('id', truckIds);

        if (reassignError) throw reassignError;

        toast({
          title: "Success",
          description: `Dispatcher set to Active. ${truckIds.length} trucks returned.`,
        });
      } else {
        toast({
          title: "Success",
          description: "Dispatcher set to Active.",
        });
      }

      // Update dispatcher status to active
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      const { error: statusError } = await supabase
        .from('dispatcher_status')
        .upsert({
          dispatcher_id: dispatcherId,
          is_active: true,
          inactive_trucks: null,
          updated_at: timestamp
        }, {
          onConflict: 'dispatcher_id'
        });

      if (statusError) throw statusError;

      queryClient.invalidateQueries({ queryKey: ['fleet-management'] });
    } catch (error: any) {
      console.error('Error setting dispatcher active:', error);
      toast({
        title: "Error",
        description: "Failed to set dispatcher active",
        variant: "destructive",
      });
    }
  };

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
