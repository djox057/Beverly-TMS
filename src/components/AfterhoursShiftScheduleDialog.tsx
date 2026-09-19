import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Trash2, Moon, Sunrise, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, startOfDay } from "date-fns";
import { useAuthContext } from "@/contexts/AuthContext";

type ShiftKey = "night" | "morning";

const SHIFT_CONFIG: Record<ShiftKey, { label: string; hours: string; icon: typeof Moon }> = {
  night: { label: "Night shift", hours: "10:00 PM – 6:00 AM (next day)", icon: Moon },
  morning: { label: "Morning shift", hours: "6:00 AM – 2:00 PM", icon: Sunrise },
};

const SHIFT_KEYS: ShiftKey[] = ["night", "morning"];

interface ShiftUser {
  id: string;
  email: string;
  full_name: string | null;
  isManager: boolean;
}

interface ShiftEntry {
  id: string;
  user_id: string;
  scheduled_date: string;
  shift: ShiftKey;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCHEDULE_MANAGER_EMAILS = ["tommyj@bfprime.net", "acccoc225@gmail.com"];

export const AfterhoursShiftScheduleDialog = ({ open, onOpenChange }: Props) => {
  const { hasRole, profile } = useAuthContext();
  const canManageSchedules =
    hasRole("admin") || hasRole("manager") || SCHEDULE_MANAGER_EMAILS.includes(profile?.email?.toLowerCase() || "");

  const [users, setUsers] = useState<ShiftUser[]>([]);
  const [entries, setEntries] = useState<ShiftEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedUsers, setSelectedUsers] = useState<Record<ShiftKey, string[]>>({ night: [], morning: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const matchesSearch = (u: ShiftUser) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return `${u.full_name || ""} ${u.email || ""}`.toLowerCase().includes(q);
  };

  useEffect(() => {
    if (!open) return;
    setSelectedUsers({ night: [], morning: [] });
    fetchUsers();
    fetchEntries();
  }, [open]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["afterhours", "manager"]);
      if (roleError) throw roleError;

      const ids = [...new Set((roleData || []).map((r) => r.user_id))];
      if (ids.length === 0) {
        setUsers([]);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", ids);
      if (profileError) throw profileError;

      const managerIds = new Set((roleData || []).filter((r) => r.role === "manager").map((r) => r.user_id));

      setUsers(
        (profileData || [])
          .map((p) => ({
            id: p.user_id,
            email: p.email,
            full_name: p.full_name,
            isManager: managerIds.has(p.user_id),
          }))
          .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
      );
    } catch (error) {
      console.error("Error loading afterhours users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const fetchEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("afterhours_shift_schedule")
        .select("id, user_id, scheduled_date, shift")
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      setEntries((data || []) as ShiftEntry[]);
    } catch (error) {
      console.error("Error loading shift schedule:", error);
    }
  };

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const isPastDate = selectedDate ? startOfDay(selectedDate) < startOfDay(new Date()) : false;

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const userLabel = (id: string) => {
    const u = userById.get(id);
    return u ? u.full_name || u.email : "Unknown user";
  };

  const scheduledFor = (shift: ShiftKey) => entries.filter((e) => e.scheduled_date === dateStr && e.shift === shift);

  const handleUserToggle = (userId: string, shift: ShiftKey) => {
    setSelectedUsers((prev) => {
      const current = prev[shift];
      return {
        ...prev,
        [shift]: current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
      };
    });
  };

  const getTotalSelectedCount = () => selectedUsers.night.length + selectedUsers.morning.length;

  const handleSaveSchedule = async () => {
    if (!dateStr || getTotalSelectedCount() === 0) {
      toast.error("Please select a date and at least one user");
      return;
    }
    setSaving(true);
    try {
      const rows = SHIFT_KEYS.flatMap((shift) =>
        selectedUsers[shift].map((userId) => ({ user_id: userId, scheduled_date: dateStr, shift })),
      );

      const saved: { user_id: string; shift: ShiftKey }[] = [];
      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        const { data, error } = await supabase
          .from("afterhours_shift_schedule")
          .upsert(chunk, { onConflict: "user_id,scheduled_date,shift", ignoreDuplicates: false })
          .select("user_id, shift");
        if (error) throw error;
        saved.push(...((data || []) as { user_id: string; shift: ShiftKey }[]));
      }

      const savedKeys = new Set(saved.map((r) => `${r.shift}_${r.user_id}`));
      const missing = rows.filter((r) => !savedKeys.has(`${r.shift}_${r.user_id}`));

      if (missing.length > 0) {
        toast.error(
          `Saved ${saved.length} of ${rows.length}. Not saved: ${missing
            .map((m) => userLabel(m.user_id))
            .join(", ")}`,
        );
      } else {
        toast.success(`Scheduled ${saved.length} shift assignment(s) for ${format(selectedDate!, "EEEE, MMM d, yyyy")}`);
      }
      setSelectedUsers({ night: [], morning: [] });
      fetchEntries();
    } catch (error: any) {
      console.error("Error saving shift schedule:", error);
      toast.error(error.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const toggleAllForShift = (shift: ShiftKey, availableIds: string[]) => {
    setSelectedUsers((prev) => {
      const allSelected = availableIds.length > 0 && availableIds.every((id) => prev[shift].includes(id));
      return { ...prev, [shift]: allSelected ? [] : availableIds };
    });
  };



  const handleDeleteSchedule = async (id: string) => {
    try {
      const { error } = await supabase.from("afterhours_shift_schedule").delete().eq("id", id);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Schedule removed");
    } catch (error) {
      console.error("Error removing shift entry:", error);
      toast.error("Failed to remove schedule");
    }
  };

  const shiftWindowLabel = (shift: ShiftKey) => {
    if (!selectedDate) return "";
    if (shift === "night") {
      return `${format(selectedDate, "MMM d")} 10:00 PM → ${format(addDays(selectedDate, 1), "MMM d")} 6:00 AM`;
    }
    return `${format(selectedDate, "MMM d")} 6:00 AM → 2:00 PM`;
  };

  const totalScheduledForDate = dateStr ? entries.filter((e) => e.scheduled_date === dateStr).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-y-auto">
        <DialogHeader className="space-y-1 sm:space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
            Afterhours Shift Schedule
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Pick a day, then choose who works the night shift (10 PM – 6 AM next day) and the morning shift (6 AM – 2
            PM). Multiple people can be scheduled per shift.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 flex-1 overflow-visible sm:overflow-hidden">
          {/* Left side - Calendar */}
          <div className="flex flex-col space-y-3 sm:space-y-4">
            <h3 className="font-medium text-xs sm:text-sm">Select Date</h3>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                setSelectedUsers({ night: [], morning: [] });
              }}
              className="rounded-md border mx-auto sm:mx-0"
            />
          </div>

          {/* Right side - Shifts for selected date */}
          <div className="flex flex-col space-y-3 sm:space-y-4 overflow-y-auto min-h-0">
            {selectedDate ? (
              <>
                <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
                  <h3 className="font-medium text-xs sm:text-sm">
                    <span className="hidden sm:inline">{format(selectedDate, "EEEE, MMM d, yyyy")}</span>
                    <span className="sm:hidden">{format(selectedDate, "EEE, MMM d")}</span>
                    {isPastDate && <span className="text-muted-foreground ml-1 sm:ml-2">(Past)</span>}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {format(selectedDate, "EEEE")}
                  </Badge>
                </div>

                {/* Already scheduled for this date - grouped by shift */}
                {totalScheduledForDate > 0 && (
                  <div
                    className="border rounded-md p-2 sm:p-3 bg-muted/30 overflow-y-auto overscroll-contain max-h-[40vh] sm:max-h-[35vh]"
                    style={{ WebkitOverflowScrolling: "touch" }}
                  >
                    {SHIFT_KEYS.map((shift) => {
                      const list = scheduledFor(shift);
                      if (list.length === 0) return null;
                      const config = SHIFT_CONFIG[shift];
                      const Icon = config.icon;
                      const scheduledIds = new Set(list.map((s) => s.user_id));

                      return (
                        <div key={shift} className="mb-3 sm:mb-4 last:mb-0">
                          <div className="flex items-center gap-2 mb-1 sm:mb-2">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Icon className="h-3 w-3" />
                              {config.label}
                            </Badge>
                            <span className="text-[10px] sm:text-xs text-muted-foreground">
                              {list.length} · {shiftWindowLabel(shift)}
                            </span>
                          </div>
                          <div className="space-y-1 pl-2">
                            {list.map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between bg-background rounded px-2 py-1 sm:py-1.5 text-xs sm:text-sm"
                              >
                                <span className="flex items-center gap-1 sm:gap-2 truncate">
                                  <span className="truncate">{userLabel(entry.user_id)}</span>
                                  {userById.get(entry.user_id)?.isManager && (
                                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                                      Manager
                                    </Badge>
                                  )}
                                </span>
                                {canManageSchedules && !isPastDate && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteSchedule(entry.id)}
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
                  </div>
                )}

                {isPastDate && totalScheduledForDate === 0 && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <p className="text-sm">No shifts recorded for this date</p>
                  </div>
                )}

                {/* Selection area */}
                {canManageSchedules && !isPastDate && (
                  <>
                    {loading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : (
                      <>
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Search users..."
                          className="h-8 pl-7 text-xs sm:text-sm"
                        />
                      </div>
                      <div
                        className="flex-1 border rounded-md p-2 overflow-y-auto max-h-[45vh] sm:max-h-[30vh]"
                        style={{ WebkitOverflowScrolling: "touch" }}
                      >
                        {SHIFT_KEYS.map((shift) => {
                          const config = SHIFT_CONFIG[shift];
                          const Icon = config.icon;
                          const scheduledIds = new Set(scheduledFor(shift).map((s) => s.user_id));
                          const availableUsers = users.filter((u) => !scheduledIds.has(u.id) && matchesSearch(u));
                          const totalCount = scheduledIds.size + selectedUsers[shift].length;

                          return (
                            <div key={shift} className="mb-3 sm:mb-4 last:mb-0 first:border-t-0 border-t pt-3 first:pt-0 mt-3 first:mt-0">
                              <div className="flex items-center gap-2 mb-1 sm:mb-2 sticky top-0 bg-background py-1 flex-wrap">
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Icon className="h-3 w-3" />
                                  {config.label}
                                </Badge>
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  {config.hours} · {totalCount} assigned
                                </span>
                                {availableUsers.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] sm:text-xs ml-auto"
                                    onClick={() =>
                                      toggleAllForShift(
                                        shift,
                                        availableUsers.map((u) => u.id),
                                      )
                                    }
                                  >
                                    {availableUsers.every((u) => selectedUsers[shift].includes(u.id))
                                      ? "Clear all"
                                      : `Select all (${availableUsers.length})`}
                                  </Button>
                                )}
                              </div>

                              {availableUsers.length === 0 ? (
                                <p className="text-[10px] sm:text-xs text-muted-foreground pl-2">
                                  Everyone is already scheduled for this shift
                                </p>
                              ) : (
                                <div className="space-y-1 pl-2">
                                  {availableUsers.map((user) => (
                                    <label
                                      key={`${shift}-${user.id}`}
                                      className="flex items-center gap-2 p-1 sm:p-1.5 rounded cursor-pointer hover:bg-muted"
                                    >
                                      <Checkbox
                                        checked={selectedUsers[shift].includes(user.id)}
                                        onCheckedChange={() => handleUserToggle(user.id, shift)}
                                        className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                                      />
                                      <span className="text-xs sm:text-sm flex-1 truncate">
                                        {user.full_name || user.email}
                                      </span>
                                      {user.isManager && (
                                        <Badge
                                          variant="outline"
                                          className="text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0 flex-shrink-0"
                                        >
                                          Manager
                                        </Badge>
                                      )}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                       </div>
                      </>
                    )}

                    <Button
                      onClick={handleSaveSchedule}
                      disabled={saving || getTotalSelectedCount() === 0}
                      className="w-full flex-shrink-0 text-sm"
                      size="sm"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Add to Schedule ({getTotalSelectedCount()})
                    </Button>
                  </>
                )}

                {!canManageSchedules && (
                  <p className="text-xs text-muted-foreground">You can view the schedule but not change it.</p>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-32 sm:h-full text-muted-foreground">
                <p className="text-xs sm:text-sm">Select a date to manage shifts</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
