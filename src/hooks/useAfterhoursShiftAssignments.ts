import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type ShiftKey = 'night' | 'morning';

export interface ShiftFleetUser {
  id: string;
  full_name: string | null;
  email: string;
  office: string | null;
  isManager: boolean;
}

export interface ShiftFleet {
  user: ShiftFleetUser;
  drivers: any[];
}

export interface ShiftFleetGroup {
  shift: ShiftKey;
  fleets: ShiftFleet[];
}

export interface ShiftFleetDay {
  date: string;
  dayName: string;
  groups: ShiftFleetGroup[];
}

const SHIFTS: ShiftKey[] = ['night', 'morning'];

export const useAfterhoursShiftAssignments = () => {
  const [shiftFleetsByDay, setShiftFleetsByDay] = useState<ShiftFleetDay[]>([]);
  const [allDriversWithTrucks, setAllDriversWithTrucks] = useState<any[]>([]);
  const [shiftDates, setShiftDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const chiNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const todayStr = fmt(chiNow);
      const endWindow = new Date(chiNow);
      endWindow.setDate(endWindow.getDate() + 9);
      const endStr = fmt(endWindow);

      const { data: scheduleRows, error: scheduleErr } = await supabase
        .from('afterhours_shift_schedule')
        .select('user_id, scheduled_date, shift')
        .gte('scheduled_date', todayStr)
        .lte('scheduled_date', endStr);
      if (scheduleErr) throw scheduleErr;

      const dates = [...new Set((scheduleRows || []).map((s: any) => s.scheduled_date as string))].sort();
      setShiftDates(dates);

      if (dates.length === 0) {
        setShiftFleetsByDay([]);
        setAllDriversWithTrucks([]);
        return;
      }

      const [assignmentsRes, driversRes, trucksRes] = await Promise.all([
        supabase
          .from('afterhours_shift_assignments')
          .select('id, afterhours_user_id, driver_id, scheduled_date, shift')
          .in('scheduled_date', dates),
        supabase.from('drivers').select('id, name, dispatcher_id, is_active').eq('is_active', true),
        supabase.from('trucks').select('id, truck_number, driver1_id, driver2_id'),
      ]);
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (driversRes.error) throw driversRes.error;
      if (trucksRes.error) throw trucksRes.error;

      const userIds = [...new Set((scheduleRows || []).map((s: any) => s.user_id as string).filter(Boolean))];

      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email, office').in('user_id', userIds),
        supabase.from('user_roles').select('user_id').eq('role', 'manager').in('user_id', userIds),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const managerIds = new Set((rolesRes.data || []).map((r: any) => r.user_id));
      const userMap = new Map<string, ShiftFleetUser>();
      (profilesRes.data || []).forEach((p: any) => {
        userMap.set(p.user_id, {
          id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          office: p.office,
          isManager: managerIds.has(p.user_id),
        });
      });

      // Dispatcher names for driver rows
      const dispatcherIds = [
        ...new Set((driversRes.data || []).map((d: any) => d.dispatcher_id).filter(Boolean)),
      ] as string[];
      const dispatcherMap = new Map<string, string>();
      if (dispatcherIds.length > 0) {
        const { data: dispProfiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', dispatcherIds);
        (dispProfiles || []).forEach((p: any) => dispatcherMap.set(p.user_id, p.full_name || p.email));
      }

      const truckByDriver = new Map<string, any>();
      (trucksRes.data || []).forEach((t: any) => {
        if (t.driver1_id) truckByDriver.set(t.driver1_id, t);
        if (t.driver2_id) truckByDriver.set(t.driver2_id, t);
      });

      const enrichedDrivers = (driversRes.data || []).map((d: any) => ({
        ...d,
        truck: truckByDriver.get(d.id) || null,
        dispatcher_name: d.dispatcher_id ? dispatcherMap.get(d.dispatcher_id) || null : null,
      }));
      setAllDriversWithTrucks(enrichedDrivers);

      const driverMap = new Map(enrichedDrivers.map((d: any) => [d.id, d]));
      const assignments = assignmentsRes.data || [];

      const byDay: ShiftFleetDay[] = [];
      for (const dateStr of dates) {
        const dayName = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        const groups: ShiftFleetGroup[] = [];
        for (const shift of SHIFTS) {
          const usersForShift = (scheduleRows || [])
            .filter((s: any) => s.scheduled_date === dateStr && s.shift === shift && s.user_id)
            .map((s: any) => userMap.get(s.user_id))
            .filter(Boolean) as ShiftFleetUser[];
          if (usersForShift.length === 0) continue;

          const fleets: ShiftFleet[] = usersForShift.map((user) => ({
            user,
            drivers: assignments
              .filter(
                (a: any) =>
                  a.scheduled_date === dateStr && a.shift === shift && a.afterhours_user_id === user.id,
              )
              .map((a: any) => driverMap.get(a.driver_id))
              .filter(Boolean),
          }));
          groups.push({ shift, fleets });
        }
        if (groups.length > 0) byDay.push({ date: dateStr, dayName, groups });
      }

      setShiftFleetsByDay(byDay);
    } catch (error: any) {
      console.error('Error fetching afterhours shift assignments:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch afterhours shift assignments',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const assignDriversBulk = async (
    afterhoursUserId: string,
    driverIds: string[],
    scheduledDate: string,
    shift: ShiftKey,
  ) => {
    try {
      const rows = driverIds.map((driver_id) => ({
        afterhours_user_id: afterhoursUserId,
        driver_id,
        scheduled_date: scheduledDate,
        shift,
      }));
      const { error } = await supabase
        .from('afterhours_shift_assignments')
        .upsert(rows, { onConflict: 'afterhours_user_id,driver_id,scheduled_date,shift' });
      if (error) throw error;
      toast({ title: 'Success', description: `${driverIds.length} driver(s) assigned` });
      fetchData();
    } catch (error: any) {
      console.error('Error assigning drivers:', error);
      toast({ title: 'Error', description: error.message || 'Failed to assign drivers', variant: 'destructive' });
    }
  };

  const removeDriversBulk = async (
    afterhoursUserId: string,
    driverIds: string[],
    scheduledDate: string,
    shift: ShiftKey,
  ) => {
    try {
      const { error } = await supabase
        .from('afterhours_shift_assignments')
        .delete()
        .eq('afterhours_user_id', afterhoursUserId)
        .eq('scheduled_date', scheduledDate)
        .eq('shift', shift)
        .in('driver_id', driverIds);
      if (error) throw error;
      toast({ title: 'Success', description: `${driverIds.length} driver(s) removed` });
      fetchData();
    } catch (error: any) {
      console.error('Error removing drivers:', error);
      toast({ title: 'Error', description: 'Failed to remove drivers', variant: 'destructive' });
    }
  };

  const unassignAll = async () => {
    try {
      if (shiftDates.length === 0) return;
      const { error } = await supabase
        .from('afterhours_shift_assignments')
        .delete()
        .in('scheduled_date', shiftDates);
      if (error) throw error;
      toast({ title: 'Success', description: 'All shift assignments removed' });
      fetchData();
    } catch (error: any) {
      console.error('Error unassigning all:', error);
      toast({ title: 'Error', description: 'Failed to unassign all', variant: 'destructive' });
    }
  };

  return {
    shiftFleetsByDay,
    allDriversWithTrucks,
    shiftDates,
    loading,
    refetch: fetchData,
    assignDriversBulk,
    removeDriversBulk,
    unassignAll,
  };
};
