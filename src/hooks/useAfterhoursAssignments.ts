import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AfterhoursUser {
  id: string;
  full_name: string | null;
  email: string;
  office: string | null;
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

      // Parallel: afterhours users, assignments, active drivers, trucks
      const [rolesRes, assignmentsRes, driversRes, trucksRes] = await Promise.all([
        supabase.from('user_roles').select('user_id').eq('role', 'afterhours'),
        supabase.from('afterhours_assignments').select('*'),
        supabase.from('drivers').select('id, name, dispatcher_id, is_active').eq('is_active', true),
        supabase.from('trucks').select('id, truck_number, driver1_id, driver2_id, trailer_id'),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (driversRes.error) throw driversRes.error;
      if (trucksRes.error) throw trucksRes.error;

      const afterhoursUserIds = (rolesRes.data || []).map(r => r.user_id);

      // Fetch profiles for afterhours users
      let afterhoursUsers: AfterhoursUser[] = [];
      if (afterhoursUserIds.length > 0) {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, office')
          .in('user_id', afterhoursUserIds);
        if (error) throw error;
        afterhoursUsers = (profiles || []).map(p => ({
          id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          office: p.office,
        }));
      }

      // Fetch dispatcher profiles to show dispatcher name on drivers
      const dispatcherIds = [...new Set((driversRes.data || []).map(d => d.dispatcher_id).filter(Boolean))] as string[];
      let dispatcherMap = new Map<string, string>();
      if (dispatcherIds.length > 0) {
        const { data: dispProfiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', dispatcherIds);
        (dispProfiles || []).forEach(p => {
          dispatcherMap.set(p.user_id, p.full_name || p.email);
        });
      }

      // Build truck-by-driver map
      const truckByDriver = new Map<string, any>();
      (trucksRes.data || []).forEach(t => {
        if (t.driver1_id) truckByDriver.set(t.driver1_id, t);
        if (t.driver2_id) truckByDriver.set(t.driver2_id, t);
      });

      // Build enriched drivers list
      const enrichedDrivers = (driversRes.data || []).map(d => ({
        ...d,
        truck: truckByDriver.get(d.id) || null,
        dispatcher_name: d.dispatcher_id ? dispatcherMap.get(d.dispatcher_id) || null : null,
      }));

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

  return {
    afterhoursFleets,
    allDriversWithTrucks,
    loading,
    assignDriver,
    removeDriver,
    refetch: fetchData,
  };
};
