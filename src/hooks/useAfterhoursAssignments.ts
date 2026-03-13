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

export interface AfterhoursFleet {
  user: AfterhoursUser;
  drivers: any[];
}

export interface AfterhoursFleetDay {
  date: string;       // e.g. '2026-03-14'
  dayName: string;    // e.g. 'Saturday'
  fleets: AfterhoursFleet[];
}

export const useAfterhoursAssignments = () => {
  const [afterhoursFleetsByDay, setAfterhoursFleetsByDay] = useState<AfterhoursFleetDay[]>([]);
  const [afterhoursFleets, setAfterhoursFleets] = useState<AfterhoursFleet[]>([]);
  const [allDriversWithTrucks, setAllDriversWithTrucks] = useState<any[]>([]);
  const [weekendDates, setWeekendDates] = useState<string[]>([]);
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
      const dates = [satStr, sunStr];
      setWeekendDates(dates);

      // Parallel: scheduled users for upcoming weekend, assignments, active drivers, trucks
      const [scheduleRes, assignmentsRes, driversRes, trucksRes] = await Promise.all([
        supabase.from('afterhours_schedule').select('*').in('scheduled_date', dates),
        supabase.from('afterhours_assignments').select('*').in('scheduled_date', dates),
        supabase.from('drivers').select('id, name, dispatcher_id, is_active').eq('is_active', true),
        supabase.from('trucks').select('id, truck_number, driver1_id, driver2_id, trailer_id'),
      ]);

      if (scheduleRes.error) throw scheduleRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (driversRes.error) throw driversRes.error;
      if (trucksRes.error) throw trucksRes.error;

      // Build map of user_id -> scheduled dates and days
      const userDaysMap = new Map<string, Set<string>>();
      const userDatesMap = new Map<string, Set<string>>();
      // Also build date -> user_ids
      const dateUsersMap = new Map<string, Set<string>>();
      (scheduleRes.data || []).filter(s => s.user_id).forEach(s => {
        const dayName = new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        if (!userDaysMap.has(s.user_id!)) userDaysMap.set(s.user_id!, new Set());
        userDaysMap.get(s.user_id!)!.add(dayName);
        if (!userDatesMap.has(s.user_id!)) userDatesMap.set(s.user_id!, new Set());
        userDatesMap.get(s.user_id!)!.add(s.scheduled_date);
        if (!dateUsersMap.has(s.scheduled_date)) dateUsersMap.set(s.scheduled_date, new Set());
        dateUsersMap.get(s.scheduled_date)!.add(s.user_id!);
      });

      const afterhoursUserIds = [...userDaysMap.keys()];

      // Fetch profiles and filter out maintenance-role users
      let afterhoursUsers: (AfterhoursUser & { scheduledDatesList: string[] })[] = [];
      if (afterhoursUserIds.length > 0) {
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
            scheduledDatesList: [...(userDatesMap.get(p.user_id) || [])],
          }));
      }

      // Fetch dispatcher profiles
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

      const assignments = assignmentsRes.data || [];
      const driverMap = new Map(enrichedDrivers.map(d => [d.id, d]));

      // Build per-day fleets
      const fleetsByDay: AfterhoursFleetDay[] = [];
      for (const dateStr of dates) {
        const dayName = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        const usersForDay = afterhoursUsers.filter(u => u.scheduledDatesList.includes(dateStr));
        const dayAssignments = assignments.filter((a: any) => a.scheduled_date === dateStr);

        const fleets: AfterhoursFleet[] = usersForDay.map(user => ({
          user,
          drivers: dayAssignments
            .filter((a: any) => a.afterhours_user_id === user.id)
            .map((a: any) => driverMap.get(a.driver_id))
            .filter(Boolean),
        }));

        if (fleets.length > 0) {
          fleetsByDay.push({ date: dateStr, dayName, fleets });
        }
      }

      setAfterhoursFleetsByDay(fleetsByDay);
      // Keep flat list for compat
      const allFleets = fleetsByDay.flatMap(d => d.fleets);
      // Dedupe by user id (keep first)
      const seen = new Set<string>();
      const uniqueFleets: AfterhoursFleet[] = [];
      for (const f of allFleets) {
        if (!seen.has(f.user.id)) {
          seen.add(f.user.id);
          uniqueFleets.push(f);
        }
      }
      setAfterhoursFleets(uniqueFleets);
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

  const assignDriver = async (afterhoursUserId: string, driverId: string, scheduledDate?: string) => {
    try {
      const { error } = await supabase
        .from('afterhours_assignments')
        .insert({ afterhours_user_id: afterhoursUserId, driver_id: driverId, scheduled_date: scheduledDate || null });
      if (error) throw error;
      toast({ title: "Success", description: "Driver assigned to afterhours dispatcher" });
      fetchData();
    } catch (error: any) {
      console.error('Error assigning driver:', error);
      toast({ title: "Error", description: error.message || "Failed to assign driver", variant: "destructive" });
    }
  };

  const assignDriversBulk = async (afterhoursUserId: string, driverIds: string[], scheduledDate?: string) => {
    try {
      const rows = driverIds.map(driver_id => ({
        afterhours_user_id: afterhoursUserId,
        driver_id,
        scheduled_date: scheduledDate || null,
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

  const removeDriver = async (afterhoursUserId: string, driverId: string, scheduledDate?: string) => {
    try {
      let query = supabase
        .from('afterhours_assignments')
        .delete()
        .eq('afterhours_user_id', afterhoursUserId)
        .eq('driver_id', driverId);
      if (scheduledDate) query = query.eq('scheduled_date', scheduledDate);
      const { error } = await query;
      if (error) throw error;
      toast({ title: "Success", description: "Driver removed from afterhours dispatcher" });
      fetchData();
    } catch (error: any) {
      console.error('Error removing driver:', error);
      toast({ title: "Error", description: "Failed to remove driver", variant: "destructive" });
    }
  };

  const removeDriversBulk = async (afterhoursUserId: string, driverIds: string[], scheduledDate?: string) => {
    try {
      let query = supabase
        .from('afterhours_assignments')
        .delete()
        .eq('afterhours_user_id', afterhoursUserId)
        .in('driver_id', driverIds);
      if (scheduledDate) query = query.eq('scheduled_date', scheduledDate);
      const { error } = await query;
      if (error) throw error;
      toast({ title: "Success", description: `${driverIds.length} driver(s) removed` });
      fetchData();
    } catch (error: any) {
      console.error('Error bulk removing drivers:', error);
      toast({ title: "Error", description: "Failed to remove drivers", variant: "destructive" });
    }
  };

  const autoAssignDrivers = async () => {
    try {
      setLoading(true);

      // Group drivers by office (via their weekday dispatcher's office)
      const driversByOffice = new Map<string, any[]>();
      for (const d of allDriversWithTrucks) {
        const office = d.dispatcher_office || 'Unknown';
        if (!driversByOffice.has(office)) driversByOffice.set(office, []);
        driversByOffice.get(office)!.push(d);
      }

      // Clear all existing assignments for these weekend dates
      const { error: deleteError } = await supabase
        .from('afterhours_assignments')
        .delete()
        .in('scheduled_date', weekendDates);
      if (deleteError) throw deleteError;

      // Also clear legacy assignments without date
      await supabase
        .from('afterhours_assignments')
        .delete()
        .is('scheduled_date', null);

      const allRows: { afterhours_user_id: string; driver_id: string; scheduled_date: string }[] = [];

      // For each day, run distribution independently
      for (const dayData of afterhoursFleetsByDay) {
        const { date, fleets: dayFleets } = dayData;

        // Group weekend dispatchers for this day by office
        const weekendByOffice = new Map<string, AfterhoursFleet[]>();
        for (const fleet of dayFleets) {
          const office = fleet.user.office || 'Unknown';
          if (!weekendByOffice.has(office)) weekendByOffice.set(office, []);
          weekendByOffice.get(office)!.push(fleet);
        }

        for (const [office, weekendDispatchers] of weekendByOffice) {
          const officeDrivers = driversByOffice.get(office) || [];
          if (officeDrivers.length === 0 || weekendDispatchers.length === 0) continue;

          const numWD = weekendDispatchers.length;

          // Group drivers by their weekday dispatcher_id
          const groupsByDispatcher = new Map<string, any[]>();
          for (const d of officeDrivers) {
            const key = d.dispatcher_id || '__none__';
            if (!groupsByDispatcher.has(key)) groupsByDispatcher.set(key, []);
            groupsByDispatcher.get(key)!.push(d);
          }

          // Deep clone groups for this day (so splicing doesn't affect next day)
          const groups = [...groupsByDispatcher.entries()]
            .map(([dispId, drivers]) => ({ dispId, drivers: [...drivers] }))
            .sort((a, b) => b.drivers.length - a.drivers.length);

          // Count how many weekday drivers each weekend dispatcher has
          const weekdayDriverCountMap = new Map<string, number>();
          for (const wd of weekendDispatchers) {
            const count = officeDrivers.filter(d => d.dispatcher_id === wd.user.id).length;
            weekdayDriverCountMap.set(wd.user.id, count);
          }

          // Sort weekend dispatchers by weekday driver count descending
          const sortedWD = [...weekendDispatchers].sort((a, b) =>
            (weekdayDriverCountMap.get(b.user.id) || 0) - (weekdayDriverCountMap.get(a.user.id) || 0)
          );

          const totalDrivers = officeDrivers.length;
          const baseShare = Math.floor(totalDrivers / numWD);
          const extra = totalDrivers % numWD;

          const capacity = new Map<string, number>();
          const assigned = new Map<string, string[]>();
          sortedWD.forEach((wd, i) => {
            capacity.set(wd.user.id, baseShare + (i < extra ? 1 : 0));
            assigned.set(wd.user.id, []);
          });

          // First pass: assign own weekday drivers
          for (const wd of sortedWD) {
            const ownGroup = groups.find(g => g.dispId === wd.user.id);
            if (ownGroup && ownGroup.drivers.length > 0) {
              const cap = capacity.get(wd.user.id)!;
              const take = ownGroup.drivers.splice(0, cap);
              assigned.get(wd.user.id)!.push(...take.map(d => d.id));
            }
          }

          // Second pass: greedy bin-packing of remaining
          const remaining = groups.filter(g => g.drivers.length > 0);
          for (const group of remaining) {
            while (group.drivers.length > 0) {
              let bestWD = sortedWD[0].user.id;
              let bestRemaining = -1;
              for (const wd of sortedWD) {
                const rem = capacity.get(wd.user.id)! - assigned.get(wd.user.id)!.length;
                if (rem > bestRemaining) {
                  bestRemaining = rem;
                  bestWD = wd.user.id;
                }
              }

              if (bestRemaining <= 0) {
                let minOver = Infinity;
                for (const wd of sortedWD) {
                  const over = assigned.get(wd.user.id)!.length - capacity.get(wd.user.id)!;
                  if (over < minOver) { minOver = over; bestWD = wd.user.id; }
                }
              }

              const take = group.drivers.splice(0, Math.max(bestRemaining, 1));
              assigned.get(bestWD)!.push(...take.map(d => d.id));
            }
          }

          // Add to rows with scheduled_date
          for (const [wdId, driverIds] of assigned) {
            for (const dId of driverIds) {
              allRows.push({ afterhours_user_id: wdId, driver_id: dId, scheduled_date: date });
            }
          }
        }
      }

      // Bulk insert
      if (allRows.length > 0) {
        for (let i = 0; i < allRows.length; i += 500) {
          const chunk = allRows.slice(i, i + 500);
          const { error } = await supabase.from('afterhours_assignments').insert(chunk);
          if (error) throw error;
        }
      }

      toast({ title: "Success", description: `Auto-assigned ${allRows.length} driver-day assignments across ${weekendDates.length} days` });
      fetchData();
    } catch (error: any) {
      console.error('Error auto-assigning drivers:', error);
      toast({ title: "Error", description: error.message || "Failed to auto-assign drivers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const unassignAll = async () => {
    try {
      setLoading(true);
      // Delete assignments for current weekend dates
      const { error: e1 } = await supabase
        .from('afterhours_assignments')
        .delete()
        .in('scheduled_date', weekendDates);
      if (e1) throw e1;
      // Also clear legacy null-date assignments
      await supabase
        .from('afterhours_assignments')
        .delete()
        .is('scheduled_date', null);
      toast({ title: "Success", description: "All weekend assignments cleared" });
      fetchData();
    } catch (error: any) {
      console.error('Error unassigning all:', error);
      toast({ title: "Error", description: error.message || "Failed to unassign all", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return {
    afterhoursFleets,
    afterhoursFleetsByDay,
    allDriversWithTrucks,
    weekendDates,
    loading,
    assignDriver,
    assignDriversBulk,
    removeDriver,
    removeDriversBulk,
    autoAssignDrivers,
    unassignAll,
    refetch: fetchData,
  };
};
