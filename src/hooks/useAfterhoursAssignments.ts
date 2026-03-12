import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AfterhoursUser {
  id: string;
  full_name: string | null;
  email: string;
  office: string | null;
  scheduledDays: string[]; // e.g. ['Saturday', 'Sunday']
}

interface AfterhoursAssignment {
  id: string;
  afterhours_user_id: string;
  driver_id: string;
  assigned_at: string;
}

export interface AfterhoursFleet {
  user: AfterhoursUser;
  drivers: any[];
}

export const useAfterhoursAssignments = () => {
  const [afterhoursFleets, setAfterhoursFleets] = useState<AfterhoursFleet[]>([]);
  const [allDriversWithTrucks, setAllDriversWithTrucks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Find the upcoming weekend (next Saturday)
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat
      const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
      const nextSaturday = new Date(today);
      nextSaturday.setDate(today.getDate() + (dayOfWeek === 6 ? 0 : dayOfWeek === 0 ? -1 : daysUntilSat));
      const nextSunday = new Date(nextSaturday);
      nextSunday.setDate(nextSaturday.getDate() + 1);

      const satStr = nextSaturday.toISOString().split('T')[0];
      const sunStr = nextSunday.toISOString().split('T')[0];

      // Parallel: scheduled users for upcoming weekend, assignments, active drivers, trucks
      const [scheduleRes, assignmentsRes, driversRes, trucksRes] = await Promise.all([
        supabase.from('afterhours_schedule').select('*').in('scheduled_date', [satStr, sunStr]),
        supabase.from('afterhours_assignments').select('*'),
        supabase.from('drivers').select('id, name, dispatcher_id, is_active').eq('is_active', true),
        supabase.from('trucks').select('id, truck_number, driver1_id, driver2_id, trailer_id'),
      ]);

      if (scheduleRes.error) throw scheduleRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (driversRes.error) throw driversRes.error;
      if (trucksRes.error) throw trucksRes.error;

      // Build map of user_id -> scheduled days
      const userDaysMap = new Map<string, Set<string>>();
      (scheduleRes.data || []).filter(s => s.user_id).forEach(s => {
        const dayName = new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        if (!userDaysMap.has(s.user_id!)) userDaysMap.set(s.user_id!, new Set());
        userDaysMap.get(s.user_id!)!.add(dayName);
      });

      const afterhoursUserIds = [...userDaysMap.keys()];

      // Fetch profiles and filter out maintenance-role users
      let afterhoursUsers: AfterhoursUser[] = [];
      if (afterhoursUserIds.length > 0) {
        // Fetch profiles and maintenance roles in parallel
        const [profilesRes, maintenanceRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('user_id, full_name, email, office')
            .in('user_id', afterhoursUserIds),
          supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'maintenance')
            .in('user_id', afterhoursUserIds),
        ]);
        if (profilesRes.error) throw profilesRes.error;
        const maintenanceUserIds = new Set((maintenanceRes.data || []).map(r => r.user_id));

        afterhoursUsers = (profilesRes.data || [])
          .filter(p => !maintenanceUserIds.has(p.user_id))
          .map(p => ({
            id: p.user_id,
            full_name: p.full_name,
            email: p.email,
            office: p.office,
            scheduledDays: [...(userDaysMap.get(p.user_id) || [])],
          }));
      }

      // Fetch dispatcher profiles to show dispatcher name + office on drivers
      const dispatcherIds = [...new Set((driversRes.data || []).map(d => d.dispatcher_id).filter(Boolean))] as string[];
      let dispatcherMap = new Map<string, { name: string; office: string | null }>();
      if (dispatcherIds.length > 0) {
        const { data: dispProfiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, office')
          .in('user_id', dispatcherIds);
        (dispProfiles || []).forEach(p => {
          dispatcherMap.set(p.user_id, { name: p.full_name || p.email, office: p.office });
        });
      }

      // Build truck-by-driver map
      const truckByDriver = new Map<string, any>();
      (trucksRes.data || []).forEach(t => {
        if (t.driver1_id) truckByDriver.set(t.driver1_id, t);
        if (t.driver2_id) truckByDriver.set(t.driver2_id, t);
      });

      // Build enriched drivers list
      const enrichedDrivers = (driversRes.data || []).map(d => {
        const dispInfo = d.dispatcher_id ? dispatcherMap.get(d.dispatcher_id) : null;
        return {
          ...d,
          truck: truckByDriver.get(d.id) || null,
          dispatcher_name: dispInfo?.name || null,
          dispatcher_office: dispInfo?.office || null,
        };
      });

      setAllDriversWithTrucks(enrichedDrivers);

      const assignments = assignmentsRes.data as AfterhoursAssignment[] || [];
      const driverMap = new Map(enrichedDrivers.map(d => [d.id, d]));

      // Build fleets
      const fleets: AfterhoursFleet[] = afterhoursUsers.map(user => ({
        user,
        drivers: assignments
          .filter(a => a.afterhours_user_id === user.id)
          .map(a => driverMap.get(a.driver_id))
          .filter(Boolean),
      }));

      setAfterhoursFleets(fleets);
    } catch (error: any) {
      console.error('Error fetching afterhours assignments:', error);
      toast({
        title: "Error",
        description: "Failed to fetch afterhours assignments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const assignDriver = async (afterhoursUserId: string, driverId: string) => {
    try {
      const { error } = await supabase
        .from('afterhours_assignments')
        .insert({ afterhours_user_id: afterhoursUserId, driver_id: driverId });
      if (error) throw error;
      toast({ title: "Success", description: "Driver assigned to afterhours dispatcher" });
      fetchData();
    } catch (error: any) {
      console.error('Error assigning driver:', error);
      toast({ title: "Error", description: error.message || "Failed to assign driver", variant: "destructive" });
    }
  };

  const assignDriversBulk = async (afterhoursUserId: string, driverIds: string[]) => {
    try {
      const rows = driverIds.map(driver_id => ({
        afterhours_user_id: afterhoursUserId,
        driver_id,
      }));
      const { error } = await supabase
        .from('afterhours_assignments')
        .insert(rows);
      if (error) throw error;
      toast({ title: "Success", description: `${driverIds.length} driver(s) assigned` });
      fetchData();
    } catch (error: any) {
      console.error('Error bulk assigning drivers:', error);
      toast({ title: "Error", description: error.message || "Failed to assign drivers", variant: "destructive" });
    }
  };

  const removeDriver = async (afterhoursUserId: string, driverId: string) => {
    try {
      const { error } = await supabase
        .from('afterhours_assignments')
        .delete()
        .eq('afterhours_user_id', afterhoursUserId)
        .eq('driver_id', driverId);
      if (error) throw error;
      toast({ title: "Success", description: "Driver removed from afterhours dispatcher" });
      fetchData();
    } catch (error: any) {
      console.error('Error removing driver:', error);
      toast({ title: "Error", description: "Failed to remove driver", variant: "destructive" });
    }
  };

  const removeDriversBulk = async (afterhoursUserId: string, driverIds: string[]) => {
    try {
      const { error } = await supabase
        .from('afterhours_assignments')
        .delete()
        .eq('afterhours_user_id', afterhoursUserId)
        .in('driver_id', driverIds);
      if (error) throw error;
      toast({ title: "Success", description: `${driverIds.length} driver(s) removed` });
      fetchData();
    } catch (error: any) {
      console.error('Error bulk removing drivers:', error);
      toast({ title: "Error", description: "Failed to remove drivers", variant: "destructive" });
    }
  };

  return {
    afterhoursFleets,
    allDriversWithTrucks,
    loading,
    assignDriver,
    assignDriversBulk,
    removeDriver,
    removeDriversBulk,
    refetch: fetchData,
  };
};
