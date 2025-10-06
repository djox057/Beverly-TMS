import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DispatcherFleet {
  dispatcher: {
    id: string;
    full_name: string;
    email: string;
  };
  trucks: any[];
}

export const useFleetManagement = () => {
  const [dispatchers, setDispatchers] = useState<DispatcherFleet[]>([]);
  const [availableTrucks, setAvailableTrucks] = useState<any[]>([]);
  const [allDispatchers, setAllDispatchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFleetData = async () => {
    try {
      setLoading(true);
      
      // Fetch all dispatchers
      const { data: dispatcherProfiles, error: dispatcherError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('role', 'dispatch')
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
          email: dispatcher.email
        },
        trucks: dispatcherGroups[dispatcher.user_id] || []
      })) || [];

      // Filter out dispatchers with no trucks for the main list, but keep all for assignment  
      setDispatchers(dispatcherFleets);
      setAllDispatchers(dispatcherProfiles?.map(d => ({ 
        id: d.user_id, 
        full_name: d.full_name, 
        email: d.email 
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

  useEffect(() => {
    fetchFleetData();
  }, []);

  return {
    dispatchers,
    availableTrucks,
    allDispatchers,
    loading,
    fetchFleetData,
    assignTruckToDispatcher,
    removeTruckFromDispatcher,
  };
};
