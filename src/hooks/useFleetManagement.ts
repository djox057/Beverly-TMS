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
  drivers: any[];
  isActive: boolean;
}

export const useFleetManagement = () => {
  const [dispatchers, setDispatchers] = useState<DispatcherFleet[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [allDispatchers, setAllDispatchers] = useState<any[]>([]);
  const [dispatcherStatuses, setDispatcherStatuses] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFleetData = async () => {
    try {
      setLoading(true);
      
      // Fetch dispatchers, managers, and supervisors from user_roles (exclude accounting, safety, and afterhours)
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

      // Fetch all drivers with their dispatcher assignments
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (driversError) throw driversError;

      // Fetch all trucks to match with drivers
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select('id, truck_number, company_id, trailer_id, driver1_id, driver2_id');

      if (trucksError) throw trucksError;

      // Match trucks to drivers (a driver can be either driver1 or driver2)
      const driversWithTrucks = drivers?.map(driver => {
        const truck = trucks?.find(t => t.driver1_id === driver.id || t.driver2_id === driver.id);
        return {
          ...driver,
          truck: truck ? { id: truck.id, truck_number: truck.truck_number, company_id: truck.company_id, trailer_id: truck.trailer_id } : null
        };
      }) || [];

      // Fetch dispatcher statuses with inactive drivers data
      const { data: statuses, error: statusError } = await supabase
        .from('dispatcher_status')
        .select('dispatcher_id, is_active, inactive_trucks');

      if (statusError) throw statusError;

      // Create status map and store full status data (note: inactive_trucks contains driver data now)
      const statusMap = new Map<string, { isActive: boolean; inactiveDrivers: any[] }>();
      statuses?.forEach(status => {
        statusMap.set(status.dispatcher_id, {
          isActive: status.is_active,
          inactiveDrivers: (status.inactive_trucks as any[]) || [] // Keeping column name for backwards compat
        });
      });

      // Group drivers by dispatcher
      const dispatcherGroups: { [key: string]: any[] } = {};
      const unassignedDrivers: any[] = [];

      driversWithTrucks.forEach(driver => {
        if (driver.dispatcher_id) {
          if (!dispatcherGroups[driver.dispatcher_id]) {
            dispatcherGroups[driver.dispatcher_id] = [];
          }
          dispatcherGroups[driver.dispatcher_id].push(driver);
        } else {
          unassignedDrivers.push(driver);
        }
      });

      // Create dispatcher fleets array
      const dispatcherFleets = dispatcherProfiles?.map(dispatcher => {
        const status = statusMap.get(dispatcher.user_id);
        const isActive = status?.isActive ?? true;
        
        // Use actual drivers if active, placeholder drivers if inactive
        const dispatcherDrivers = isActive 
          ? (dispatcherGroups[dispatcher.user_id] || [])
          : (status?.inactiveDrivers || []);

        return {
          dispatcher: {
            id: dispatcher.user_id,
            full_name: dispatcher.full_name,
            email: dispatcher.email,
            ext: dispatcher.ext
          },
          drivers: dispatcherDrivers,
          isActive
        };
      }) || [];

      // Filter out dispatchers with no drivers for the main list, but keep all for assignment  
      setDispatchers(dispatcherFleets);
      setAllDispatchers(dispatcherProfiles?.map(d => ({ 
        id: d.user_id, 
        full_name: d.full_name, 
        email: d.email,
        ext: d.ext
      })) || []);
      setAvailableDrivers(unassignedDrivers);
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

  const assignDriverToDispatcher = async (driverId: string, dispatcherId: string) => {
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ dispatcher_id: dispatcherId })
        .eq('id', driverId);

      if (error) throw error;

      // Find dispatcher name for the toast
      const dispatcher = allDispatchers.find(d => d.id === dispatcherId);
      const dispatcherName = dispatcher?.full_name || dispatcher?.email || 'dispatcher';

      toast({
        title: "Success",
        description: `Driver assigned to ${dispatcherName} successfully`,
      });

      fetchFleetData();
    } catch (error: any) {
      console.error('Error assigning driver to dispatcher:', error);
      toast({
        title: "Error",
        description: "Failed to assign driver to dispatcher",
        variant: "destructive",
      });
    }
  };

  const removeDriverFromDispatcher = async (driverId: string) => {
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ dispatcher_id: null })
        .eq('id', driverId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Driver removed from dispatcher successfully",
      });

      fetchFleetData();
    } catch (error: any) {
      console.error('Error removing driver from dispatcher:', error);
      toast({
        title: "Error",
        description: "Failed to remove driver from dispatcher",
        variant: "destructive",
      });
    }
  };

  const setDispatcherOffDuty = async (dispatcherId: string, driverAssignments: Record<string, string>) => {
    try {
      // Get the dispatcher's drivers with their full data for placeholders
      const dispatcherFleet = dispatchers.find(d => d.dispatcher.id === dispatcherId);
      if (!dispatcherFleet) throw new Error('Dispatcher not found');

      // Store complete driver data for placeholders (keeping inactive_trucks column name for backwards compat)
      const inactiveDriversData = dispatcherFleet.drivers.map(driver => ({
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        truck: driver.truck
      }));
      
      // Store original driver assignments before going off duty
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      const { error: statusError } = await supabase
        .from('dispatcher_status')
        .upsert({
          dispatcher_id: dispatcherId,
          is_active: false,
          inactive_trucks: inactiveDriversData, // Using inactive_trucks column for driver data
          updated_at: timestamp
        }, {
          onConflict: 'dispatcher_id'
        });

      if (statusError) throw statusError;

      // Assign each driver to its cover dispatcher
      for (const [driverId, coverId] of Object.entries(driverAssignments)) {
        const { error: assignError } = await supabase
          .from('drivers')
          .update({ dispatcher_id: coverId })
          .eq('id', driverId);

        if (assignError) throw assignError;
      }

      toast({
        title: "Success",
        description: `Dispatcher set to Off Duty. ${Object.keys(driverAssignments).length} drivers reassigned to cover dispatchers.`,
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
      // Get the stored driver data from when dispatcher went off duty (in inactive_trucks column)
      const { data: status } = await supabase
        .from('dispatcher_status')
        .select('inactive_trucks')
        .eq('dispatcher_id', dispatcherId)
        .maybeSingle();

      const originalDriversData = (status?.inactive_trucks as any[]) || [];

      if (originalDriversData.length > 0) {
        // Extract driver IDs from the stored data
        const driverIds = originalDriversData.map((d: any) => d.id);
        
        // Reassign all original drivers back to this dispatcher
        const { error: reassignError } = await supabase
          .from('drivers')
          .update({ dispatcher_id: dispatcherId })
          .in('id', driverIds);

        if (reassignError) throw reassignError;

        toast({
          title: "Success",
          description: `Dispatcher set to Active. ${driverIds.length} drivers returned.`,
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
    availableDrivers,
    allDispatchers,
    dispatcherStatuses,
    loading,
    fetchFleetData,
    assignDriverToDispatcher,
    removeDriverFromDispatcher,
    setDispatcherOffDuty,
    setDispatcherActive,
  };
};
