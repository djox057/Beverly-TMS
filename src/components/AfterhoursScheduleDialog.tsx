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

interface DispatchUser {
  id: string;
  email: string;
  full_name: string | null;
  office: 'kragujevac' | 'cacak' | 'beograd' | null;
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
  };
}

interface AfterhoursScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Office configuration: slots per office
const OFFICE_CONFIG = {
  kragujevac: { label: 'Kragujevac (KG)', slots: 3 },
  cacak: { label: 'Čačak (CA)', slots: 2 },
  beograd: { label: 'Beograd (BG)', slots: 2 },
} as const;

type OfficeKey = keyof typeof OFFICE_CONFIG;

export const AfterhoursScheduleDialog = ({ open, onOpenChange }: AfterhoursScheduleDialogProps) => {
  const [dispatchUsers, setDispatchUsers] = useState<DispatchUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Record<OfficeKey, string[]>>({
    kragujevac: [],
    cacak: [],
    beograd: [],
  });
  const [expandedFilledOffices, setExpandedFilledOffices] = useState<Record<OfficeKey, boolean>>({
    kragujevac: false,
    cacak: false,
    beograd: false,
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [existingSchedules, setExistingSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchDispatchUsers();
      fetchExistingSchedules();
    }
  }, [open]);

  const fetchDispatchUsers = async () => {
    setLoading(true);
    try {
      // Get users with dispatch, supervisor, or manager role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['dispatch', 'supervisor', 'manager']);

      if (roleError) throw roleError;

      if (roleData && roleData.length > 0) {
        const userIds = [...new Set(roleData.map(r => r.user_id))];
        
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, email, full_name, office')
          .in('user_id', userIds);

        if (profileError) throw profileError;

        setDispatchUsers(profileData?.map(p => ({
          id: p.user_id,
          email: p.email,
          full_name: p.full_name,
          office: p.office as DispatchUser['office']
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

      // Fetch user profiles for the schedules
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(s => s.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, email, full_name, office')
          .in('user_id', userIds);

        const schedulesWithUsers = data.map(schedule => {
          const profile = profiles?.find(p => p.user_id === schedule.user_id);
          return {
            ...schedule,
            user: profile ? {
              id: profile.user_id,
              email: profile.email,
              full_name: profile.full_name,
              office: profile.office as DispatchUser['office']
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

  const handleUserToggle = (userId: string, office: OfficeKey) => {
    setSelectedUsers(prev => {
      const currentOfficeUsers = prev[office];
      const isSelected = currentOfficeUsers.includes(userId);
      const maxSlots = OFFICE_CONFIG[office].slots;
      
      if (isSelected) {
        return {
          ...prev,
          [office]: currentOfficeUsers.filter(id => id !== userId)
        };
      } else {
        if (currentOfficeUsers.length >= maxSlots) {
          toast.error(`Maximum ${maxSlots} users for ${OFFICE_CONFIG[office].label}`);
          return prev;
        }
        return {
          ...prev,
          [office]: [...currentOfficeUsers, userId]
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
      setSelectedUsers({ kragujevac: [], cacak: [], beograd: [] });
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

  // Group users by office (case-insensitive matching)
  const usersByOffice = dispatchUsers.reduce((acc, user) => {
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
  }, {} as Record<OfficeKey, DispatchUser[]>);

  // Group schedules by date
  const schedulesByDate = existingSchedules.reduce((acc, schedule) => {
    const date = schedule.scheduled_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(schedule);
    return acc;
  }, {} as Record<string, ScheduleEntry[]>);

  // Only allow selecting weekends (Saturday/Sunday)
  const isDateDisabled = (date: Date) => {
    const today = startOfDay(new Date());
    return date < today || !isWeekend(date);
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
            Schedule dispatch users by office: 3x KG, 2x CA, 2x BG. 
            Role changes: 6am → afterhours, 5pm → dispatch (Chicago time)
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[auto_1fr] gap-6 flex-1 overflow-hidden">
          {/* Left side - Calendar */}
          <div className="flex flex-col space-y-4">
            <h3 className="font-medium text-sm">Select Weekend Date</h3>
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
                  
                  if (existingForDate.length > 0) {
                    // Group scheduled users by office
                    const scheduledByOffice = existingForDate.reduce((acc, schedule) => {
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

                    return (
                      <ScrollArea className="flex-1 border rounded-md p-3 bg-muted/30">
                        {(['kragujevac', 'cacak', 'beograd'] as OfficeKey[]).map(office => {
                          const officeSchedules = scheduledByOffice[office] || [];
                          if (officeSchedules.length === 0) return null;
                          
                          const config = OFFICE_CONFIG[office];
                          return (
                            <div key={office} className="mb-4 last:mb-0">
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
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteSchedule(schedule.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </ScrollArea>
                    );
                  }
                  
                  // Show dispatcher selection only when no one is scheduled yet
                  return (
                    <>
                      {loading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : (
                        <ScrollArea className="flex-1 border rounded-md p-2">
                          {(['kragujevac', 'cacak', 'beograd'] as OfficeKey[]).map(office => {
                            const officeUsers = usersByOffice[office] || [];
                            const config = OFFICE_CONFIG[office];
                            const selectedCount = selectedUsers[office].length;
                            const isFilled = selectedCount >= config.slots;
                            
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
                                      {selectedCount}/{config.slots} complete - click to view
                                    </span>
                                  </button>
                                </div>
                              );
                            }
                            
                            // Show expanded filled office with collapse option
                            if (isFilled && expandedFilledOffices[office]) {
                              const selectedOfficeUsers = officeUsers.filter(u => selectedUsers[office].includes(u.id));
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
                                      {selectedCount}/{config.slots} complete - click to hide
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
                                    {selectedCount}/{config.slots} selected
                                  </span>
                                </div>
                                {officeUsers.length === 0 ? (
                                  <p className="text-xs text-muted-foreground pl-2">No users in this office</p>
                                ) : (
                                  <div className="space-y-1 pl-2">
                                    {officeUsers.map(user => (
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
