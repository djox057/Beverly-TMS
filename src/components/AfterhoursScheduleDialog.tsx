import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isSaturday, isWeekend, startOfDay } from "date-fns";
import { useAuthContext } from "@/contexts/AuthContext";

interface ScheduleUser {
  id: string;
  email: string;
  full_name: string | null;
  office: 'kragujevac' | 'cacak' | 'beograd' | null;
  isMaintenance?: boolean;
}

interface ScheduleEntry {
  id: string;
  user_id: string;
  scheduled_date: string;
  user?: {
    id: string;
    email: string;
    full_name: string | null;
    office?: 'kragujevac' | 'cacak' | 'beograd' | null;
    isMaintenance?: boolean;
  };
}

interface AfterhoursScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Office configuration: slots per office
const OFFICE_CONFIG = {
  kragujevac: { label: 'Kragujevac (KG)', slots: 4 },
  cacak: { label: 'Čačak (CA)', slots: 3 },
  beograd: { label: 'Beograd (BG)', slots: 3 },
} as const;

const MAINTENANCE_CONFIG = { label: 'Maintenance', slots: 10 };

type OfficeKey = keyof typeof OFFICE_CONFIG;
type SelectionKey = OfficeKey | 'maintenance';

export const AfterhoursScheduleDialog = ({ open, onOpenChange }: AfterhoursScheduleDialogProps) => {
  const { hasRole } = useAuthContext();
  const isAdmin = hasRole('admin');
  const [scheduleUsers, setScheduleUsers] = useState<ScheduleUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Record<SelectionKey, string[]>>({
    kragujevac: [],
    cacak: [],
    beograd: [],
    maintenance: [],
  });
  const [expandedFilledOffices, setExpandedFilledOffices] = useState<Record<SelectionKey, boolean>>({
    kragujevac: false,
    cacak: false,
    beograd: false,
    maintenance: false,
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [existingSchedules, setExistingSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchScheduleUsers();
      fetchExistingSchedules();
    }
  }, [open]);

  const fetchScheduleUsers = async () => {
    setLoading(true);
    try {
      // Get users with dispatch, supervisor, manager, or maintenance role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['dispatch', 'supervisor', 'manager', 'maintenance']);

      if (roleError) throw roleError;

      if (roleData && roleData.length > 0) {
        const userIds = [...new Set(roleData.map(r => r.user_id))];
        const maintenanceUserIds = new Set(roleData.filter(r => r.role === 'maintenance').map(r => r.user_id));
        
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, email, full_name, office')
          .in('user_id', userIds);

        if (profileError) throw profileError;

        setScheduleUsers(profileData?.map(p => ({
          id: p.user_id,
          email: p.email,
          full_name: p.full_name,
          office: p.office as ScheduleUser['office'],
          isMaintenance: maintenanceUserIds.has(p.user_id)
        })) || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingSchedules = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('afterhours_schedule')
        .select('*')
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;

      // Fetch user profiles and roles for the schedules
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(s => s.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, email, full_name, office')
          .in('user_id', userIds);

        // Check maintenance roles
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('user_id', userIds)
          .eq('role', 'maintenance');
        
        const maintenanceUserIds = new Set(roleData?.map(r => r.user_id) || []);

        const schedulesWithUsers = data.map(schedule => {
          const profile = profiles?.find(p => p.user_id === schedule.user_id);
          return {
            ...schedule,
            user: profile ? {
              id: profile.user_id,
              email: profile.email,
              full_name: profile.full_name,
              office: profile.office as ScheduleUser['office'],
              isMaintenance: maintenanceUserIds.has(profile.user_id)
            } : undefined
          };
        });

        setExistingSchedules(schedulesWithUsers);
      } else {
        setExistingSchedules([]);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const handleUserToggle = (userId: string, category: SelectionKey) => {
    setSelectedUsers(prev => {
      const currentUsers = prev[category];
      const isSelected = currentUsers.includes(userId);
      const maxSlots = category === 'maintenance' ? MAINTENANCE_CONFIG.slots : OFFICE_CONFIG[category as OfficeKey].slots;
      
      if (isSelected) {
        return {
          ...prev,
          [category]: currentUsers.filter(id => id !== userId)
        };
      } else {
        if (currentUsers.length >= maxSlots) {
          const label = category === 'maintenance' ? MAINTENANCE_CONFIG.label : OFFICE_CONFIG[category as OfficeKey].label;
          toast.error(`Maximum ${maxSlots} users for ${label}`);
          return prev;
        }
        return {
          ...prev,
          [category]: [...currentUsers, userId]
        };
      }
    });
  };

  const getTotalSelectedCount = () => {
    return Object.values(selectedUsers).reduce((sum, users) => sum + users.length, 0);
  };

  const handleSaveSchedule = async () => {
    const allSelectedUsers = Object.values(selectedUsers).flat();
    
    if (!selectedDate || allSelectedUsers.length === 0) {
      toast.error('Please select a date and at least one user');
      return;
    }

    if (!isWeekend(selectedDate)) {
      toast.error('Please select a Saturday or Sunday');
      return;
    }

    setSaving(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Insert schedule entries for each selected user
      const entries = allSelectedUsers.map(userId => ({
        user_id: userId,
        scheduled_date: dateStr
      }));

      const { error } = await supabase
        .from('afterhours_schedule')
        .upsert(entries, { onConflict: 'user_id,scheduled_date' });

      if (error) throw error;

      toast.success(`Scheduled ${allSelectedUsers.length} user(s) for ${format(selectedDate, 'EEEE, MMM d, yyyy')}`);
      setSelectedUsers({ kragujevac: [], cacak: [], beograd: [], maintenance: [] });
      setSelectedDate(undefined);
      fetchExistingSchedules();
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      toast.error(error.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      const { error } = await supabase
        .from('afterhours_schedule')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      toast.success('Schedule removed');
      fetchExistingSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast.error('Failed to remove schedule');
    }
  };

  // Separate maintenance users from office users
  const maintenanceUsers = scheduleUsers.filter(u => u.isMaintenance);
  const officeUsers = scheduleUsers.filter(u => !u.isMaintenance);

  // Group non-maintenance users by office (case-insensitive matching)
  const usersByOffice = officeUsers.reduce((acc, user) => {
    const officeRaw = user.office?.toLowerCase() || '';
    let office: OfficeKey = 'kragujevac'; // Default
    if (officeRaw.includes('cacak') || officeRaw.includes('čačak')) {
      office = 'cacak';
    } else if (officeRaw.includes('beograd')) {
      office = 'beograd';
    } else if (officeRaw.includes('kragujevac')) {
      office = 'kragujevac';
    }
    if (!acc[office]) acc[office] = [];
    acc[office].push(user);
    return acc;
  }, {} as Record<OfficeKey, ScheduleUser[]>);

  // Group schedules by date
  const schedulesByDate = existingSchedules.reduce((acc, schedule) => {
    const date = schedule.scheduled_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(schedule);
    return acc;
  }, {} as Record<string, ScheduleEntry[]>);

  // Holidays that can be scheduled (month is 0-indexed)
  const HOLIDAYS = [
    { month: 0, day: 1, name: "New Year" },           // 1/1
    { month: 4, day: 25, name: "Memorial Day" },      // 5/25
    { month: 6, day: 4, name: "Independence Day" },   // 7/4
    { month: 8, day: 7, name: "Labor Day" },          // 9/7
    { month: 10, day: 26, name: "Thanksgiving" },     // 11/26
    { month: 11, day: 25, name: "Christmas" },        // 12/25
  ];

  // Check if a date is a holiday
  const isHoliday = (date: Date) => {
    const month = date.getMonth();
    const day = date.getDate();
    return HOLIDAYS.some(h => h.month === month && h.day === day);
  };

  // Get holiday name for a date
  const getHolidayName = (date: Date) => {
    const month = date.getMonth();
    const day = date.getDate();
    const holiday = HOLIDAYS.find(h => h.month === month && h.day === day);
    return holiday?.name || null;
  };

  // Allow selecting weekends (Saturday/Sunday) and holidays
  const isDateDisabled = (date: Date) => {
    const today = startOfDay(new Date());
    if (date < today) return true;
    return !isWeekend(date) && !isHoliday(date);
  };

  const getOfficeLabel = (office: string | null | undefined) => {
    if (office === 'kragujevac') return 'KG';
    if (office === 'cacak') return 'CA';
    if (office === 'beograd') return 'BG';
    return '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Afterhours Schedule
          </DialogTitle>
          <DialogDescription>
            Schedule users by office: 4x KG, 3x CA, 3x BG + Maintenance for weekends and holidays.
            Role changes: 6am → afterhours, 5pm → dispatch (Chicago time)
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[auto_1fr] gap-6 flex-1 overflow-hidden">
          {/* Left side - Calendar */}
          <div className="flex flex-col space-y-4">
            <h3 className="font-medium text-sm">Select Date (Weekends & Holidays)</h3>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={isDateDisabled}
              className="rounded-md border"
            />
          </div>

          {/* Right side - Schedule for selected date */}
          <div className="flex flex-col space-y-4 overflow-hidden">
            {selectedDate ? (
              <>
                <div className="flex items-center justify-between flex-shrink-0">
                  <h3 className="font-medium text-sm">
                    Schedule for {format(selectedDate, 'EEEE, MMM d, yyyy')}
                  </h3>
                  <Badge variant={isSaturday(selectedDate) ? "default" : "secondary"}>
                    {format(selectedDate, 'EEEE')}
                  </Badge>
                </div>

                {/* Already scheduled for this date - grouped by office */}
                {(() => {
                  const dateStr = format(selectedDate, 'yyyy-MM-dd');
                  const existingForDate = schedulesByDate[dateStr] || [];
                  
                  // Define minimum thresholds for showing add section
                  const MIN_THRESHOLDS: Record<SelectionKey, number> = {
                    kragujevac: 3,
                    cacak: 2,
                    beograd: 2,
                    maintenance: 1,
                  };
                  
                  // Separate maintenance users from office users
                  const maintenanceSchedules = existingForDate.filter(s => s.user?.isMaintenance);
                  const officeSchedulesOnly = existingForDate.filter(s => !s.user?.isMaintenance);
                  
                  // Group non-maintenance scheduled users by office
                  const scheduledByOffice = officeSchedulesOnly.reduce((acc, schedule) => {
                    const officeRaw = schedule.user?.office?.toLowerCase() || '';
                    let office: OfficeKey = 'kragujevac';
                    if (officeRaw.includes('cacak') || officeRaw.includes('čačak')) {
                      office = 'cacak';
                    } else if (officeRaw.includes('beograd')) {
                      office = 'beograd';
                    } else if (officeRaw.includes('kragujevac')) {
                      office = 'kragujevac';
                    }
                    if (!acc[office]) acc[office] = [];
                    acc[office].push(schedule);
                    return acc;
                  }, {} as Record<OfficeKey, ScheduleEntry[]>);
                  
                  // Check which offices need more dispatchers
                  const officesBelowThreshold = (['kragujevac', 'cacak', 'beograd'] as OfficeKey[]).filter(
                    office => (scheduledByOffice[office]?.length || 0) < MIN_THRESHOLDS[office]
                  );
                  const maintenanceBelowThreshold = maintenanceSchedules.length < MIN_THRESHOLDS.maintenance;
                  const needsMoreDispatchers = officesBelowThreshold.length > 0 || maintenanceBelowThreshold;

                  return (
                    <>
                      {/* Show existing scheduled users */}
                      {existingForDate.length > 0 && (
                        <ScrollArea className="flex-1 border rounded-md p-3 bg-muted/30">
                          {(['kragujevac', 'cacak', 'beograd'] as OfficeKey[]).map(office => {
                            const officeSchedules = scheduledByOffice[office] || [];
                            if (officeSchedules.length === 0) return null;
                            
                            const config = OFFICE_CONFIG[office];
                            return (
                              <div key={office} className="mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline">{config.label}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {officeSchedules.length}/{config.slots}
                                  </span>
                                </div>
                                <div className="space-y-1 pl-2">
                                  {officeSchedules.map(schedule => (
                                    <div 
                                      key={schedule.id} 
                                      className="flex items-center justify-between bg-background rounded px-2 py-1.5 text-sm"
                                    >
                                      <span>{schedule.user?.full_name || schedule.user?.email || 'Unknown'}</span>
                                      {isAdmin && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 text-destructive hover:text-destructive"
                                          onClick={() => handleDeleteSchedule(schedule.id)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          
                          {/* Maintenance section at bottom */}
                          {maintenanceSchedules.length > 0 && (
                            <div className="mb-4 border-t pt-4 mt-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">{MAINTENANCE_CONFIG.label}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {maintenanceSchedules.length}
                                </span>
                              </div>
                              <div className="space-y-1 pl-2">
                                {maintenanceSchedules.map(schedule => (
                                  <div 
                                    key={schedule.id} 
                                    className="flex items-center justify-between bg-background rounded px-2 py-1.5 text-sm"
                                  >
                                    <span>{schedule.user?.full_name || schedule.user?.email || 'Unknown'}</span>
                                    {isAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-destructive hover:text-destructive"
                                        onClick={() => handleDeleteSchedule(schedule.id)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </ScrollArea>
                      )}
                      
                      {/* Show add section for offices/maintenance below minimum threshold - Admin only */}
                      {isAdmin && (existingForDate.length === 0 || needsMoreDispatchers) && (
                        <>
                          {loading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                          ) : (
                            <ScrollArea className="flex-1 border rounded-md p-2">
                              {(['kragujevac', 'cacak', 'beograd'] as OfficeKey[]).map(office => {
                                const officeUsersForOffice = usersByOffice[office] || [];
                                const config = OFFICE_CONFIG[office];
                                const existingCount = scheduledByOffice[office]?.length || 0;
                                const selectedCount = selectedUsers[office].length;
                                const totalCount = existingCount + selectedCount;
                                
                                // Skip if already at or above threshold
                                if (existingCount >= MIN_THRESHOLDS[office]) return null;
                                
                                // Filter out already scheduled users
                                const alreadyScheduledIds = new Set((scheduledByOffice[office] || []).map(s => s.user_id));
                                const availableUsers = officeUsersForOffice.filter(u => !alreadyScheduledIds.has(u.id));
                                
                                const isFilled = totalCount >= config.slots;
                                
                                // Collapse office section if slots are filled (unless expanded)
                                if (isFilled && !expandedFilledOffices[office]) {
                                  return (
                                    <div key={office} className="mb-2">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedFilledOffices(prev => ({ ...prev, [office]: true }))}
                                        className="flex items-center gap-2 py-1 hover:opacity-80 cursor-pointer"
                                      >
                                        <Badge variant="default" className="bg-green-600">
                                          {config.label} ✓
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {totalCount}/{config.slots} complete - click to view
                                        </span>
                                      </button>
                                    </div>
                                  );
                                }
                                
                                // Show expanded filled office with collapse option
                                if (isFilled && expandedFilledOffices[office]) {
                                  const selectedOfficeUsers = availableUsers.filter(u => selectedUsers[office].includes(u.id));
                                  return (
                                    <div key={office} className="mb-4">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedFilledOffices(prev => ({ ...prev, [office]: false }))}
                                        className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 hover:opacity-80 cursor-pointer"
                                      >
                                        <Badge variant="default" className="bg-green-600">
                                          {config.label} ✓
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {totalCount}/{config.slots} complete - click to hide
                                        </span>
                                      </button>
                                      <div className="space-y-1 pl-2">
                                        {selectedOfficeUsers.map(user => (
                                          <label
                                            key={user.id}
                                            className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                                          >
                                            <Checkbox
                                              checked={true}
                                              onCheckedChange={() => handleUserToggle(user.id, office)}
                                            />
                                            <span className="text-sm">
                                              {user.full_name || user.email}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }
                                
                                return (
                                  <div key={office} className="mb-4">
                                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                                      <Badge variant="outline">
                                        {config.label}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {totalCount}/{config.slots} (need {MIN_THRESHOLDS[office] - existingCount} more)
                                      </span>
                                    </div>
                                    {availableUsers.length === 0 ? (
                                      <p className="text-xs text-muted-foreground pl-2">No available users in this office</p>
                                    ) : (
                                      <div className="space-y-1 pl-2">
                                        {availableUsers.map(user => (
                                          <label
                                            key={user.id}
                                            className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                                          >
                                            <Checkbox
                                              checked={selectedUsers[office].includes(user.id)}
                                              onCheckedChange={() => handleUserToggle(user.id, office)}
                                            />
                                            <span className="text-sm">
                                              {user.full_name || user.email}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              
                              {/* Maintenance section at bottom - only if below threshold */}
                              {maintenanceBelowThreshold && maintenanceUsers.length > 0 && (
                                <div className="mb-4 border-t pt-4 mt-4">
                                  {(() => {
                                    const existingMaintenanceCount = maintenanceSchedules.length;
                                    const alreadyScheduledIds = new Set(maintenanceSchedules.map(s => s.user_id));
                                    const availableMaintenanceUsers = maintenanceUsers.filter(u => !alreadyScheduledIds.has(u.id));
                                    const selectedCount = selectedUsers.maintenance.length;
                                    const totalCount = existingMaintenanceCount + selectedCount;
                                    const isFilled = totalCount >= MAINTENANCE_CONFIG.slots;
                                    
                                    if (isFilled && !expandedFilledOffices.maintenance) {
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => setExpandedFilledOffices(prev => ({ ...prev, maintenance: true }))}
                                          className="flex items-center gap-2 py-1 hover:opacity-80 cursor-pointer"
                                        >
                                          <Badge variant="default" className="bg-green-600">
                                            {MAINTENANCE_CONFIG.label} ✓
                                          </Badge>
                                          <span className="text-xs text-muted-foreground">
                                            {totalCount}/{MAINTENANCE_CONFIG.slots} complete - click to view
                                          </span>
                                        </button>
                                      );
                                    }
                                    
                                    if (isFilled && expandedFilledOffices.maintenance) {
                                      const selectedMaintenanceUsers = availableMaintenanceUsers.filter(u => selectedUsers.maintenance.includes(u.id));
                                      return (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => setExpandedFilledOffices(prev => ({ ...prev, maintenance: false }))}
                                            className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 hover:opacity-80 cursor-pointer"
                                          >
                                            <Badge variant="default" className="bg-green-600">
                                              {MAINTENANCE_CONFIG.label} ✓
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                              {totalCount}/{MAINTENANCE_CONFIG.slots} complete - click to hide
                                            </span>
                                          </button>
                                          <div className="space-y-1 pl-2">
                                            {selectedMaintenanceUsers.map(user => (
                                              <label
                                                key={user.id}
                                                className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                                              >
                                                <Checkbox
                                                  checked={true}
                                                  onCheckedChange={() => handleUserToggle(user.id, 'maintenance')}
                                                />
                                                <span className="text-sm">
                                                  {user.full_name || user.email}
                                                </span>
                                              </label>
                                            ))}
                                          </div>
                                        </>
                                      );
                                    }
                                    
                                    return (
                                      <>
                                        <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                                          <Badge variant="outline">
                                            {MAINTENANCE_CONFIG.label}
                                          </Badge>
                                          <span className="text-xs text-muted-foreground">
                                            {totalCount}/{MAINTENANCE_CONFIG.slots} (need {MIN_THRESHOLDS.maintenance - existingMaintenanceCount} more)
                                          </span>
                                        </div>
                                        <div className="space-y-1 pl-2">
                                          {availableMaintenanceUsers.map(user => (
                                            <label
                                              key={user.id}
                                              className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                                            >
                                              <Checkbox
                                                checked={selectedUsers.maintenance.includes(user.id)}
                                                onCheckedChange={() => handleUserToggle(user.id, 'maintenance')}
                                              />
                                              <span className="text-sm">
                                                {user.full_name || user.email}
                                              </span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </ScrollArea>
                          )}

                          <Button 
                            onClick={handleSaveSchedule} 
                            disabled={saving || getTotalSelectedCount() === 0}
                            className="w-full flex-shrink-0"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Add to Schedule ({getTotalSelectedCount()} users)
                          </Button>
                        </>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Select a weekend date to manage schedule</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
