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
import { format, isSaturday, isSunday, isWeekend, startOfDay, addDays } from "date-fns";

interface DispatchUser {
  id: string;
  email: string;
  full_name: string | null;
}

interface ScheduleEntry {
  id: string;
  user_id: string;
  scheduled_date: string;
  user?: DispatchUser;
}

interface AfterhoursScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AfterhoursScheduleDialog = ({ open, onOpenChange }: AfterhoursScheduleDialogProps) => {
  const [dispatchUsers, setDispatchUsers] = useState<DispatchUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
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
          .select('user_id, email, full_name')
          .in('user_id', userIds);

        if (profileError) throw profileError;

        setDispatchUsers(profileData?.map(p => ({
          id: p.user_id,
          email: p.email,
          full_name: p.full_name
        } as DispatchUser)) || []);
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
          .select('user_id, email, full_name')
          .in('user_id', userIds);

        const schedulesWithUsers = data.map(schedule => {
          const profile = profiles?.find(p => p.user_id === schedule.user_id);
          return {
            ...schedule,
            user: profile ? {
              id: profile.user_id,
              email: profile.email,
              full_name: profile.full_name
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

  const handleUserToggle = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSaveSchedule = async () => {
    if (!selectedDate || selectedUsers.length === 0) {
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
      const entries = selectedUsers.map(userId => ({
        user_id: userId,
        scheduled_date: dateStr
      }));

      const { error } = await supabase
        .from('afterhours_schedule')
        .upsert(entries, { onConflict: 'user_id,scheduled_date' });

      if (error) throw error;

      toast.success(`Scheduled ${selectedUsers.length} user(s) for ${format(selectedDate, 'EEEE, MMM d, yyyy')}`);
      setSelectedUsers([]);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Afterhours Schedule
          </DialogTitle>
          <DialogDescription>
            Schedule dispatch users to have their role changed to Afterhours on weekends.
            Role changes: 6am Chicago time (dispatch → afterhours), 5pm Chicago time (afterhours → dispatch)
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
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Select Dispatch Users for {format(selectedDate, 'EEEE, MMM d')}
                </label>
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <ScrollArea className="h-[200px] border rounded-md p-2">
                    {dispatchUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No dispatch users found
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {dispatchUsers.map(user => (
                          <label
                            key={user.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedUsers.includes(user.id)}
                              onCheckedChange={() => handleUserToggle(user.id)}
                            />
                            <span className="text-sm">
                              {user.full_name || user.email}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
              </div>
            )}

            <Button 
              onClick={handleSaveSchedule} 
              disabled={saving || !selectedDate || selectedUsers.length === 0}
              className="w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add to Schedule
            </Button>
          </div>

          {/* Right side - Existing schedules */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Upcoming Schedules</h3>
            <ScrollArea className="h-[400px] border rounded-md p-3">
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
                            <span>{schedule.user?.full_name || schedule.user?.email || 'Unknown'}</span>
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
