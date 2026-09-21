import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { allocateAfterhoursDrivers, AllocDriver, AllocUser } from '@/lib/afterhoursAutoAssign';
import { fetchAllRows } from '@/lib/fetchAllRows';

// Canonical office bucket key for weekend distribution only. Profile offices
// ("Čačak", "KRAGUJEVAC", "BG 1st/4th floor") and admin cross-office override
// values ("cacak", "kragujevac", "beograd") must map to the SAME bucket,
// otherwise a cross-office user ends up alone in a bucket with no drivers.
const groupKey = (office: string | null | undefined): string => {
  const s = (office || '').toLowerCase().trim();
  if (!s) return 'unknown';
  if (s.includes('cacak') || s.includes('čačak')) return 'cacak';
  if (s.includes('beograd') || s.startsWith('bg')) return 'beograd';
  if (s.includes('kragujevac')) return 'kragujevac';
  return s;
};

interface AfterhoursUser {
  id: string;
  full_name: string | null;
  email: string;
  office: string | null;
  scheduledDays: string[]; // e.g. ['Saturday', 'Sunday']
  isMaintenance?: boolean;
  isEld?: boolean;

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

      // Build upcoming afterhours dates from afterhours_schedule (Chicago time).
      // This includes weekends AND any scheduled holidays in the next ~9 days.
      const chiNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const todayStr = fmt(chiNow);
      const endWindow = new Date(chiNow);
      endWindow.setDate(endWindow.getDate() + 9);
      const endStr = fmt(endWindow);

      const { data: upcomingSchedule, error: upcomingErr } = await supabase
        .from('afterhours_schedule')
        .select('scheduled_date')
        .gte('scheduled_date', todayStr)
        .lte('scheduled_date', endStr);
      if (upcomingErr) throw upcomingErr;

      let dates = [...new Set((upcomingSchedule || []).map((s: any) => s.scheduled_date as string))].sort();

      // Fallback: if nothing scheduled, default to the upcoming Sat/Sun.
      if (dates.length === 0) {
        const dow = chiNow.getDay();
        const daysUntilSat = (6 - dow + 7) % 7 || 7;
        const nextSat = new Date(chiNow);
        nextSat.setDate(chiNow.getDate() + (dow === 6 ? 0 : dow === 0 ? -1 : daysUntilSat));
        const nextSun = new Date(nextSat);
        nextSun.setDate(nextSat.getDate() + 1);
        dates = [fmt(nextSat), fmt(nextSun)];
      }
      setWeekendDates(dates);

      // Parallel: scheduled users for upcoming weekend, assignments, active drivers, trucks.
      // Assignments/drivers/trucks are paged: several hundred rows per date blows
      // past PostgREST's implicit 1000-row cap and would silently drop fleets.
      const [scheduleRes, assignmentRows, driverRows, truckRows] = await Promise.all([
        supabase.from('afterhours_schedule').select('*').in('scheduled_date', dates),
        fetchAllRows<any>((from, to) =>
          supabase.from('afterhours_assignments').select('*').in('scheduled_date', dates).range(from, to)),
        fetchAllRows<any>((from, to) =>
          supabase.from('drivers').select('id, name, dispatcher_id, company_id, is_active').eq('is_active', true).range(from, to)),
        fetchAllRows<any>((from, to) =>
          supabase.from('trucks').select('id, truck_number, driver1_id, driver2_id, trailer_id').range(from, to)),
      ]);

      if (scheduleRes.error) throw scheduleRes.error;
      const assignmentsRes = { data: assignmentRows };
      const driversRes = { data: driverRows };
      const trucksRes = { data: truckRows };

      // Build map of user_id -> scheduled dates and days
      const userDaysMap = new Map<string, Set<string>>();
      const userDatesMap = new Map<string, Set<string>>();
      // Also build date -> user_ids
      const dateUsersMap = new Map<string, Set<string>>();
      // Admin cross-office overrides: user_id -> date -> office they cover that day
      const overrideByUserDate = new Map<string, Map<string, string>>();
      (scheduleRes.data || []).filter(s => s.user_id).forEach(s => {
        const dayName = new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        if (!userDaysMap.has(s.user_id!)) userDaysMap.set(s.user_id!, new Set());
        userDaysMap.get(s.user_id!)!.add(dayName);
        if (!userDatesMap.has(s.user_id!)) userDatesMap.set(s.user_id!, new Set());
        userDatesMap.get(s.user_id!)!.add(s.scheduled_date);
        if (!dateUsersMap.has(s.scheduled_date)) dateUsersMap.set(s.scheduled_date, new Set());
        dateUsersMap.get(s.scheduled_date)!.add(s.user_id!);
        const ov = (s as any).override_office as string | null | undefined;
        if (ov) {
          if (!overrideByUserDate.has(s.user_id!)) overrideByUserDate.set(s.user_id!, new Map());
          overrideByUserDate.get(s.user_id!)!.set(s.scheduled_date, ov);
        }
      });

      const afterhoursUserIds = [...userDaysMap.keys()];

      // Fetch profiles. Maintenance (ELD) people are kept and simply flagged so
      // the UI can tag them; they are selectable like any other weekend user.
      let afterhoursUsers: (AfterhoursUser & { scheduledDatesList: string[] })[] = [];
      if (afterhoursUserIds.length > 0) {
        const [profilesRes, maintenanceRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('user_id, full_name, email, office, is_eld')
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
          .map(p => ({
            id: p.user_id,
            full_name: p.full_name,
            email: p.email,
            office: p.office,
            isMaintenance: maintenanceUserIds.has(p.user_id) && !!(p as any).is_eld,
            isEld: !!(p as any).is_eld,

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

        const fleets: AfterhoursFleet[] = usersForDay.map(user => {
          // Cross-office override: treat the user as belonging to the office
          // they cover that day (drives office grouping and allocation).
          const overrideOffice = overrideByUserDate.get(user.id)?.get(dateStr) || null;
          const effectiveUser = overrideOffice ? { ...user, office: overrideOffice } : user;
          return {
            user: effectiveUser,
            drivers: dayAssignments
              .filter((a: any) => a.afterhours_user_id === user.id)
              .map((a: any) => driverMap.get(a.driver_id))
              .filter(Boolean),
          };
        });

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

      const allocDrivers: AllocDriver[] = allDriversWithTrucks.map((d: any) => ({
        id: d.id,
        dispatcher_id: d.dispatcher_id ?? null,
        office: groupKey(d.dispatcher_office),
        company_id: d.company_id ?? null,
      }));

      const allRows: { afterhours_user_id: string; driver_id: string; scheduled_date: string }[] = [];

      // For each day, run distribution independently
      for (const dayData of afterhoursFleetsByDay) {
        const { date, fleets: dayFleets } = dayData;
        const allocUsers: AllocUser[] = dayFleets.map((f) => ({
          id: f.user.id,
          office: groupKey(f.user.office),
          // Maintenance users (like ELD) are on duty but never cover trucks.
          isEld: !!f.user.isEld || !!f.user.isMaintenance,
        }));

        const allocation = allocateAfterhoursDrivers(allocUsers, allocDrivers, { bucketByOffice: true });
        for (const [wdId, driverIds] of allocation) {
          for (const dId of driverIds) {
            allRows.push({ afterhours_user_id: wdId, driver_id: dId, scheduled_date: date });
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
