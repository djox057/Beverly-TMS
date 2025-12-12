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
      // Get users with dispatch role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'dispatch');

      if (roleError) throw roleError;

      if (roleData && roleData.length > 0) {
        const userIds = roleData.map(r => r.user_id);
        
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
      console.error('Error fetching dispatch users:', error);
      toast.error('Failed to load dispatch users');
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

  // Group users by office
  const usersByOffice = dispatchUsers.reduce((acc, user) => {
    const office = user.office || 'kragujevac'; // Default to KG if no office
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
      <DialogContent className="max-w-4xl max-h-[90vh]">
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

        <div className="grid grid-cols-2 gap-6">
          {/* Left side - Add new schedule */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Add New Schedule</h3>
            
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Select Weekend Date</label>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={isDateDisabled}
                className="rounded-md border"
              />
            </div>

            {selectedDate && (
              <div className="space-y-3">
                <label className="text-sm text-muted-foreground block">
                  Select Dispatch Users for {format(selectedDate, 'EEEE, MMM d')}
                </label>
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <ScrollArea className="h-[250px] border rounded-md p-2">
                    {(['kragujevac', 'cacak', 'beograd'] as OfficeKey[]).map(office => {
                      const officeUsers = usersByOffice[office] || [];
                      const config = OFFICE_CONFIG[office];
                      const selectedCount = selectedUsers[office].length;
                      
                      return (
                        <div key={office} className="mb-4">
                          <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                            <Badge variant={selectedCount === config.slots ? "default" : "outline"}>
                              {config.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {selectedCount}/{config.slots} selected
                            </span>
                          </div>
                          {officeUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground pl-2">No dispatchers in this office</p>
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
              </div>
            )}

            <Button 
              onClick={handleSaveSchedule} 
              disabled={saving || !selectedDate || getTotalSelectedCount() === 0}
              className="w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add to Schedule ({getTotalSelectedCount()} users)
            </Button>
          </div>

          {/* Right side - Existing schedules */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Upcoming Schedules</h3>
            <ScrollArea className="h-[450px] border rounded-md p-3">
              {Object.keys(schedulesByDate).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No upcoming schedules
                </p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(schedulesByDate).map(([date, schedules]) => (
                    <div key={date} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={isSaturday(new Date(date + 'T12:00:00')) ? "default" : "secondary"}>
                          {format(new Date(date + 'T12:00:00'), 'EEEE')}
                        </Badge>
                        <span className="text-sm font-medium">
                          {format(new Date(date + 'T12:00:00'), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <div className="pl-2 space-y-1">
                        {schedules.map(schedule => (
                          <div 
                            key={schedule.id} 
                            className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <span>{schedule.user?.full_name || schedule.user?.email || 'Unknown'}</span>
                              {schedule.user?.office && (
                                <Badge variant="outline" className="text-xs">
                                  {getOfficeLabel(schedule.user.office)}
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteSchedule(schedule.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
