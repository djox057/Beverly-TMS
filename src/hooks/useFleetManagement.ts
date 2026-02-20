import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DispatcherFleet {
  dispatcher: {
    id: string;
    full_name: string;
    email: string;
    ext?: string;
    office?: string | null;
    roles?: string[];
  };
  drivers: any[];
  isActive: boolean;
}

export const useFleetManagement = () => {
  const [dispatchers, setDispatchers] = useState<DispatcherFleet[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [allDispatchers, setAllDispatchers] = useState<any[]>([]);
  const [dispatcherStatuses, setDispatcherStatuses] = useState<Map<string, boolean>>(new Map());
  const [assignedTrucksCount, setAssignedTrucksCount] = useState(0);
  const [unassignedTrucksCount, setUnassignedTrucksCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFleetData = async () => {
    try {
      setLoading(true);
      
      // Fetch dispatchers, managers, supervisors, and admins from user_roles (exclude accounting, safety, afterhours, and chicago_management)
      const { data: dispatchRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['dispatch', 'manager', 'supervisor', 'admin']);

      if (rolesError) throw rolesError;

      const dispatcherUserIds = (dispatchRoles || []).map(r => r.user_id);

      const { data: dispatcherProfiles, error: dispatcherError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, ext, office')
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
        .select('id, truck_number, trailer_id, driver1_id, driver2_id');

      if (trucksError) throw trucksError;

      // Match trucks to drivers (a driver can be either driver1 or driver2)
      const driversWithTrucks = drivers?.map(driver => {
        const truck = trucks?.find(t => t.driver1_id === driver.id || t.driver2_id === driver.id);
        return {
          ...driver,
          truck: truck ? { id: truck.id, truck_number: truck.truck_number, trailer_id: truck.trailer_id } : null
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

      // Create dispatcher fleets array with role information
      const dispatcherFleets = dispatcherProfiles?.map(dispatcher => {
        const status = statusMap.get(dispatcher.user_id);
        const isActive = status?.isActive ?? true;
        const userRoles = dispatchRoles?.filter(r => r.user_id === dispatcher.user_id).map(r => r.role) || [];
        
        // Use actual drivers if active, placeholder drivers if inactive
        const dispatcherDrivers = isActive 
          ? (dispatcherGroups[dispatcher.user_id] || [])
          : (status?.inactiveDrivers || []);

        return {
          dispatcher: {
            id: dispatcher.user_id,
            full_name: dispatcher.full_name,
            email: dispatcher.email,
          ext: dispatcher.ext,
            office: dispatcher.office,
            roles: userRoles
          },
          drivers: dispatcherDrivers,
          isActive
        };
      }) || [];

      // Count trucks correctly:
      // Assigned trucks = trucks with drivers that have a dispatcher
      // Unassigned trucks = trucks with no drivers OR trucks with drivers that have no dispatcher
      const assignedTruckIds = new Set<string>();
      const unassignedTruckIds = new Set<string>();
      
      trucks?.forEach(truck => {
        const hasDrivers = truck.driver1_id || truck.driver2_id;
        
        if (!hasDrivers) {
          // Truck has no drivers at all
          unassignedTruckIds.add(truck.id);
        } else {
          // Check if the drivers assigned to this truck have a dispatcher
          const driver1 = driversWithTrucks.find(d => d.id === truck.driver1_id);
          const driver2 = driversWithTrucks.find(d => d.id === truck.driver2_id);
          
          const driver1HasDispatcher = driver1?.dispatcher_id;
          const driver2HasDispatcher = driver2?.dispatcher_id;
          
          if (driver1HasDispatcher || driver2HasDispatcher) {
            // At least one driver has a dispatcher
            assignedTruckIds.add(truck.id);
          } else {
            // Truck has drivers but they don't have a dispatcher
            unassignedTruckIds.add(truck.id);
          }
        }
      });
      
      setAssignedTrucksCount(assignedTruckIds.size);
      setUnassignedTrucksCount(unassignedTruckIds.size);

      // Filter out dispatchers with no drivers for the main list, but keep all for assignment  
      setDispatchers(dispatcherFleets);
      setAllDispatchers(dispatcherProfiles?.map(d => {
        const userRoles = dispatchRoles?.filter(r => r.user_id === d.user_id).map(r => r.role) || [];
        return { 
          id: d.user_id, 
          full_name: d.full_name, 
          email: d.email,
          ext: d.ext,
          office: d.office,
          roles: userRoles
        };
      }) || []);
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

  const setDispatcherOffDuty = async (dispatcherId: string, driverAssignments: Record<string, string>, recordDayOff: boolean = false) => {
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
      const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
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

      // Record a lost day if the "Day off" toggle was checked AND it's a working day
      if (recordDayOff) {
        // Helper functions to check working day
        const isWeekday = (date: Date): boolean => {
          const day = date.getDay();
          return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
        };

        const getObservedDate = (year: number, month: number, day: number): Date => {
          const actual = new Date(year, month, day);
          const dayOfWeek = actual.getDay();
          if (dayOfWeek === 6) return new Date(year, month, day - 1); // Saturday -> Friday
          if (dayOfWeek === 0) return new Date(year, month, day + 1); // Sunday -> Monday
          return actual;
        };

        const getNthWeekdayOfMonth = (year: number, month: number, weekday: number, n: number): Date => {
          let count = 0;
          for (let day = 1; day <= 31; day++) {
            const d = new Date(year, month, day);
            if (d.getMonth() !== month) break;
            if (d.getDay() === weekday) {
              count++;
              if (count === n) return d;
            }
          }
          return new Date(year, month, 1);
        };

        const getLastWeekdayOfMonth = (year: number, month: number, weekday: number): Date => {
          const lastDay = new Date(year, month + 1, 0).getDate();
          for (let day = lastDay; day >= 1; day--) {
            const d = new Date(year, month, day);
            if (d.getDay() === weekday) return d;
          }
          return new Date(year, month, 1);
        };

        const isHoliday = (date: Date): boolean => {
          const year = date.getFullYear();
          const month = date.getMonth();
          const day = date.getDate();

          // Fixed holidays (with observed dates for weekends)
          const fixedHolidays = [
            { month: 0, day: 1 },   // New Year's Day
            { month: 5, day: 19 },  // Juneteenth
            { month: 6, day: 4 },   // Independence Day
            { month: 10, day: 11 }, // Veterans Day
            { month: 11, day: 25 }, // Christmas Day
          ];

          for (const h of fixedHolidays) {
            const observed = getObservedDate(year, h.month, h.day);
            if (observed.getMonth() === month && observed.getDate() === day) {
              return true;
            }
          }

          // Moving holidays
          const mlkDay = getNthWeekdayOfMonth(year, 0, 1, 3); // 3rd Monday of January
          if (month === mlkDay.getMonth() && day === mlkDay.getDate()) return true;

          const presidentsDay = getNthWeekdayOfMonth(year, 1, 1, 3); // 3rd Monday of February
          if (month === presidentsDay.getMonth() && day === presidentsDay.getDate()) return true;

          const memorialDay = getLastWeekdayOfMonth(year, 4, 1); // Last Monday of May
          if (month === memorialDay.getMonth() && day === memorialDay.getDate()) return true;

          const laborDay = getNthWeekdayOfMonth(year, 8, 1, 1); // 1st Monday of September
          if (month === laborDay.getMonth() && day === laborDay.getDate()) return true;

          const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4); // 4th Thursday of November
          if (month === thanksgiving.getMonth() && day === thanksgiving.getDate()) return true;

          return false;
        };

        const isWorkingDay = isWeekday(now) && !isHoliday(now);

        if (isWorkingDay) {
          const { error: lostDayError } = await supabase
            .from('dispatcher_off_duty_days')
            .upsert({
              dispatcher_id: dispatcherId,
              off_duty_date: todayDate,
            }, {
              onConflict: 'dispatcher_id,off_duty_date'
            });

          if (lostDayError) {
            console.error('Error recording lost day:', lostDayError);
            // Don't throw, just log - the main operation succeeded
          }
        } else {
          console.log('Today is not a working day (weekend or holiday), skipping lost day recording');
        }
      }

      // Assign each driver to its cover dispatcher
      for (const [driverId, coverId] of Object.entries(driverAssignments)) {
        const { error: assignError } = await supabase
          .from('drivers')
          .update({ dispatcher_id: coverId })
          .eq('id', driverId);

        if (assignError) throw assignError;
      }

      const dayOffMessage = recordDayOff ? ' Lost day recorded.' : '';
      toast({
        title: "Success",
        description: `Dispatcher set to Off Duty. ${Object.keys(driverAssignments).length} drivers reassigned to cover dispatchers.${dayOffMessage}`,
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
      let reassignedCount = 0;

      if (originalDriversData.length > 0) {
        // Extract driver IDs from the stored data
        const driverIds = originalDriversData.map((d: any) => d.id);
        
        // First, verify which drivers still exist and are active
        const { data: existingDrivers, error: checkError } = await supabase
          .from('drivers')
          .select('id')
          .in('id', driverIds)
          .eq('is_active', true);

        if (checkError) throw checkError;

        const validDriverIds = existingDrivers?.map(d => d.id) || [];
        
        if (validDriverIds.length > 0) {
          // Only reassign drivers that still exist and are active
          const { error: reassignError } = await supabase
            .from('drivers')
            .update({ dispatcher_id: dispatcherId })
            .in('id', validDriverIds);

          if (reassignError) throw reassignError;
          reassignedCount = validDriverIds.length;
        }

        const skippedCount = driverIds.length - validDriverIds.length;
        if (skippedCount > 0) {
          console.log(`Skipped ${skippedCount} drivers that no longer exist or are inactive`);
        }
      }

      // Update dispatcher status to active AFTER successful reassignment
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

      toast({
        title: "Success",
        description: reassignedCount > 0 
          ? `Dispatcher set to Active. ${reassignedCount} drivers returned.`
          : "Dispatcher set to Active.",
      });

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
    assignedTrucksCount,
    unassignedTrucksCount,
    loading,
    fetchFleetData,
    assignDriverToDispatcher,
    removeDriverFromDispatcher,
    setDispatcherOffDuty,
    setDispatcherActive,
  };
};
