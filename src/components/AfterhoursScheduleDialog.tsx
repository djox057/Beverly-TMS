import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Trash2, Lightbulb, Info, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isSaturday, isWeekend, startOfDay, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { useAuthContext } from "@/contexts/AuthContext";

interface ScheduleUser {
  id: string;
  email: string;
  full_name: string | null;
  office: "kragujevac" | "cacak" | "beograd" | null;
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
    office?: "kragujevac" | "cacak" | "beograd" | null;
    isMaintenance?: boolean;
  };
}

interface AfterhoursScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Office configuration: slots per office
const OFFICE_CONFIG = {
  kragujevac: { label: "Kragujevac (KG)", slots: 3 },
  cacak: { label: "ČAČAK (CA)", slots: 2 },
  beograd: { label: "Beograd (BG)", slots: 2 },
} as const;

const MAINTENANCE_CONFIG = { label: "Maintenance", slots: 10 };

type OfficeKey = keyof typeof OFFICE_CONFIG;
type SelectionKey = OfficeKey | "maintenance";

// Special users who can manage weekend schedules regardless of role
const SCHEDULE_MANAGER_EMAILS = ["tommyj@bfprime.net", "acccoc225@gmail.com"];

export const AfterhoursScheduleDialog = ({ open, onOpenChange }: AfterhoursScheduleDialogProps) => {
  const { hasRole, profile } = useAuthContext();
  const isAdmin = hasRole("admin");
  const canManageSchedules = isAdmin || SCHEDULE_MANAGER_EMAILS.includes(profile?.email?.toLowerCase() || "");
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
  // Force show office in selection area (for adding more users via + button)
  const [forceShowOffice, setForceShowOffice] = useState<SelectionKey | null>(null);
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
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["dispatch", "supervisor", "manager", "maintenance"]);

      if (roleError) throw roleError;

      if (roleData && roleData.length > 0) {
        const userIds = [...new Set(roleData.map((r) => r.user_id))];
        const maintenanceUserIds = new Set(roleData.filter((r) => r.role === "maintenance").map((r) => r.user_id));

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("user_id, email, full_name, office")
          .in("user_id", userIds);

        if (profileError) throw profileError;

        setScheduleUsers(
          profileData?.map((p) => ({
            id: p.user_id,
            email: p.email,
            full_name: p.full_name,
            office: p.office as ScheduleUser["office"],
            isMaintenance: maintenanceUserIds.has(p.user_id),
          })) || [],
        );
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from("afterhours_schedule")
        .select("*")
        .order("scheduled_date", { ascending: false });

      if (error) throw error;

      // Fetch user profiles and roles for the schedules
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((s) => s.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, email, full_name, office")
          .in("user_id", userIds);

        // Check maintenance roles
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("user_id", userIds)
          .eq("role", "maintenance");

        const maintenanceUserIds = new Set(roleData?.map((r) => r.user_id) || []);

        const schedulesWithUsers = data.map((schedule) => {
          const profile = profiles?.find((p) => p.user_id === schedule.user_id);
          return {
            ...schedule,
            user: profile
              ? {
                  id: profile.user_id,
                  email: profile.email,
                  full_name: profile.full_name,
                  office: profile.office as ScheduleUser["office"],
                  isMaintenance: maintenanceUserIds.has(profile.user_id),
                }
              : undefined,
          };
        });

        setExistingSchedules(schedulesWithUsers);
      } else {
        setExistingSchedules([]);
      }
    } catch (error) {
      console.error("Error fetching schedules:", error);
    }
  };

  const handleUserToggle = (userId: string, category: SelectionKey, bypassLimit = false) => {
    setSelectedUsers((prev) => {
      const currentUsers = prev[category];
      const isSelected = currentUsers.includes(userId);
      const maxSlots =
        category === "maintenance" ? MAINTENANCE_CONFIG.slots : OFFICE_CONFIG[category as OfficeKey].slots;

      if (isSelected) {
        return {
          ...prev,
          [category]: currentUsers.filter((id) => id !== userId),
        };
      } else {
        if (!bypassLimit && currentUsers.length >= maxSlots) {
          const label =
            category === "maintenance" ? MAINTENANCE_CONFIG.label : OFFICE_CONFIG[category as OfficeKey].label;
          toast.error(`Maximum ${maxSlots} users for ${label}`);
          return prev;
        }
        return {
          ...prev,
          [category]: [...currentUsers, userId],
        };
      }
    });
  };

  // Direct add user to schedule (bypasses selection, saves immediately)
  const handleDirectAddUser = async (userId: string, category: SelectionKey) => {
    if (!selectedDate) return;

    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      const { error } = await supabase
        .from("afterhours_schedule")
        .upsert({ user_id: userId, scheduled_date: dateStr }, { onConflict: "user_id,scheduled_date" });

      if (error) throw error;

      toast.success("User added to schedule");
      fetchExistingSchedules();
    } catch (error: any) {
      console.error("Error adding user:", error);
      toast.error(error.message || "Failed to add user");
    } finally {
      setSaving(false);
    }
  };

  const getTotalSelectedCount = () => {
    return Object.values(selectedUsers).reduce((sum, users) => sum + users.length, 0);
  };

  const handleSaveSchedule = async () => {
    const allSelectedUsers = Object.values(selectedUsers).flat();

    if (!selectedDate || allSelectedUsers.length === 0) {
      toast.error("Please select a date and at least one user");
      return;
    }

    // Check if it's a weekend or holiday (using the dynamic isHoliday function)
    const isValidScheduleDate = isWeekend(selectedDate) || isHoliday(selectedDate);

    if (!isValidScheduleDate) {
      toast.error("Please select a weekend or holiday");
      return;
    }

    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // Insert schedule entries for each selected user
      const entries = allSelectedUsers.map((userId) => ({
        user_id: userId,
        scheduled_date: dateStr,
      }));

      const { error } = await supabase
        .from("afterhours_schedule")
        .upsert(entries, { onConflict: "user_id,scheduled_date" });

      if (error) throw error;

      toast.success(`Scheduled ${allSelectedUsers.length} user(s) for ${format(selectedDate, "EEEE, MMM d, yyyy")}`);
      setSelectedUsers({ kragujevac: [], cacak: [], beograd: [], maintenance: [] });
      setSelectedDate(undefined);
      setForceShowOffice(null);
      fetchExistingSchedules();
    } catch (error: any) {
      console.error("Error saving schedule:", error);
      toast.error(error.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      const { error } = await supabase.from("afterhours_schedule").delete().eq("id", scheduleId);

      if (error) throw error;

      toast.success("Schedule removed");
      fetchExistingSchedules();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      toast.error("Failed to remove schedule");
    }
  };

  // Separate maintenance users from office users
  const maintenanceUsers = scheduleUsers.filter((u) => u.isMaintenance);
  const officeUsers = scheduleUsers.filter((u) => !u.isMaintenance);

  // Group non-maintenance users by office (case-insensitive matching)
  const usersByOffice = officeUsers.reduce(
    (acc, user) => {
      const officeRaw = user.office?.toLowerCase() || "";
      let office: OfficeKey = "kragujevac"; // Default
      if (officeRaw.includes("cacak") || officeRaw.includes("čačak")) {
        office = "cacak";
      } else if (officeRaw.includes("beograd")) {
        office = "beograd";
      } else if (officeRaw.includes("kragujevac")) {
        office = "kragujevac";
      }
      if (!acc[office]) acc[office] = [];
      acc[office].push(user);
      return acc;
    },
    {} as Record<OfficeKey, ScheduleUser[]>,
  );

  // Group schedules by date
  const schedulesByDate = existingSchedules.reduce(
    (acc, schedule) => {
      const date = schedule.scheduled_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(schedule);
      return acc;
    },
    {} as Record<string, ScheduleEntry[]>,
  );

  // Calculate who has worked this month (for suggestions) - only count weekend days
  const getMonthlyWorkCounts = (targetDate: Date) => {
    const monthStart = startOfMonth(targetDate);
    const monthEnd = endOfMonth(targetDate);

    const workCounts: Record<string, { count: number; user: ScheduleUser }> = {};

    // Initialize all non-maintenance users with 0 count
    officeUsers.forEach((user) => {
      workCounts[user.id] = { count: 0, user };
    });

    // Count weekend (Sat/Sun) schedules within the month, excluding holidays
    existingSchedules.forEach((schedule) => {
      const scheduleDate = new Date(schedule.scheduled_date + "T12:00:00"); // Use noon to avoid timezone issues
      if (isWithinInterval(scheduleDate, { start: monthStart, end: monthEnd })) {
        // Only count weekend days (Sat/Sun), exclude holidays
        if (isWeekend(scheduleDate) && !isHoliday(scheduleDate)) {
          if (workCounts[schedule.user_id]) {
            workCounts[schedule.user_id].count++;
          }
        }
      }
    });

    return workCounts;
  };

  // Get suggestions for who should work (users who haven't worked this month)
  const getSuggestions = (targetDate: Date, office: OfficeKey, alreadyScheduledIds: Set<string>) => {
    const workCounts = getMonthlyWorkCounts(targetDate);
    const officeUsersForOffice = usersByOffice[office] || [];

    // Filter to users in this office who aren't already scheduled for the selected date
    const availableOfficeUsers = officeUsersForOffice.filter((u) => !alreadyScheduledIds.has(u.id));

    // Sort by work count (ascending) - those who worked less come first
    const sorted = availableOfficeUsers.sort((a, b) => {
      const countA = workCounts[a.id]?.count || 0;
      const countB = workCounts[b.id]?.count || 0;
      return countA - countB;
    });

    // Get users who haven't worked this month
    const notWorkedThisMonth = sorted.filter((u) => (workCounts[u.id]?.count || 0) === 0);

    return {
      notWorkedThisMonth,
      workCounts,
      sorted,
    };
  };

  // Helper function to calculate dynamic holidays for a given year
  const getHolidaysForYear = (year: number) => {
    const holidays: { date: Date; name: string }[] = [];

    // Fixed holidays
    holidays.push({ date: new Date(year, 0, 1), name: "New Year's Day" }); // Jan 1
    holidays.push({ date: new Date(year, 6, 4), name: "Independence Day" }); // Jul 4
    holidays.push({ date: new Date(year, 11, 25), name: "Christmas" }); // Dec 25

    // Memorial Day - last Monday of May
    const lastDayMay = new Date(year, 5, 0); // Last day of May
    const memorialDay = new Date(year, 4, lastDayMay.getDate() - ((lastDayMay.getDay() + 6) % 7));
    holidays.push({ date: memorialDay, name: "Memorial Day" });

    // Labor Day - first Monday of September
    const firstSept = new Date(year, 8, 1);
    const laborDay = new Date(year, 8, 1 + ((8 - firstSept.getDay()) % 7));
    holidays.push({ date: laborDay, name: "Labor Day" });

    // Thanksgiving - 4th Thursday of November
    const firstNov = new Date(year, 10, 1);
    const firstThursday = new Date(year, 10, 1 + ((11 - firstNov.getDay()) % 7));
    const thanksgiving = new Date(year, 10, firstThursday.getDate() + 21);
    holidays.push({ date: thanksgiving, name: "Thanksgiving" });

    return holidays;
  };

  // Get holidays for current and next year to cover edge cases
  const currentYear = new Date().getFullYear();
  const HOLIDAYS = [...getHolidaysForYear(currentYear), ...getHolidaysForYear(currentYear + 1)];

  // Check if a date is a holiday
  const isHoliday = (date: Date) => {
    return HOLIDAYS.some(
      (h) =>
        h.date.getFullYear() === date.getFullYear() &&
        h.date.getMonth() === date.getMonth() &&
        h.date.getDate() === date.getDate(),
    );
  };

  // Get holiday name for a date
  const getHolidayName = (date: Date) => {
    const holiday = HOLIDAYS.find(
      (h) =>
        h.date.getFullYear() === date.getFullYear() &&
        h.date.getMonth() === date.getMonth() &&
        h.date.getDate() === date.getDate(),
    );
    return holiday?.name || null;
  };

  // Allow selecting weekends (Saturday/Sunday) and holidays - including past dates for viewing
  const isDateDisabled = (date: Date) => {
    return !isWeekend(date) && !isHoliday(date);
  };

  // Check if selected date is in the past
  const isPastDate = selectedDate ? startOfDay(selectedDate) < startOfDay(new Date()) : false;

  const getOfficeLabel = (office: string | null | undefined) => {
    if (office === "kragujevac") return "KG";
    if (office === "cacak") return "CA";
    if (office === "beograd") return "BG";
    return "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-y-auto">
        <DialogHeader className="space-y-1 sm:space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
            Weekend Schedule
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Schedule users by office: 3x KG, 2x CA, 2x BG + Maintenance for weekends and holidays. Role changes: 6am →
            afterhours, 5pm → dispatch (Chicago time)
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 flex-1 overflow-hidden">
          {/* Left side - Calendar */}
          <div className="flex flex-col space-y-3 sm:space-y-4">
            <h3 className="font-medium text-xs sm:text-sm">Select Date (Weekends & Holidays)</h3>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                setForceShowOffice(null); // Reset force show when date changes
              }}
              disabled={isDateDisabled}
              className="rounded-md border mx-auto sm:mx-0"
            />

            {/* People who worked more than 1 day this month */}
            {selectedDate &&
              (() => {
                const workCounts = getMonthlyWorkCounts(selectedDate);
                const usersWithMultipleDays = Object.values(workCounts)
                  .filter((entry) => entry.count > 1)
                  .sort((a, b) => b.count - a.count);

                if (usersWithMultipleDays.length === 0) return null;

                // Calculate extra days per person (excluding holidays)
                const monthStartStr = format(startOfMonth(selectedDate), "yyyy-MM-dd");
                const monthEndStr = format(endOfMonth(selectedDate), "yyyy-MM-dd");

                const getExtraDaysForUser = (userId: string) => {
                  // Get all weekend (Sat/Sun) non-holiday dates this user worked in the month
                  const userSchedules = existingSchedules
                    .filter((s) => {
                      if (s.user_id !== userId) return false;
                      if (s.scheduled_date < monthStartStr || s.scheduled_date > monthEndStr) return false;
                      const scheduleDate = new Date(s.scheduled_date + "T12:00:00"); // Use noon to avoid timezone issues
                      // Only count weekend days (Sat/Sun), exclude holidays
                      if (!isWeekend(scheduleDate)) return false;
                      if (isHoliday(scheduleDate)) return false;
                      return true;
                    })
                    .map((s) => s.scheduled_date)
                    .sort();

                  // First day is not extra, subsequent days are extra
                  return userSchedules.slice(1);
                };

                // Build list of users with extra days
                const usersWithExtraDays = usersWithMultipleDays
                  .map(({ user, count }) => ({
                    user,
                    count,
                    extraDays: getExtraDaysForUser(user.id),
                  }))
                  .filter((entry) => entry.extraDays.length > 0);

                return (
                  <div className="border rounded-md p-2 sm:p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                        Extra days in {format(selectedDate, "MMMM")}
                      </h4>
                      {usersWithExtraDays.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5">
                              <Info className="h-3 w-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 max-h-96 overflow-y-auto" align="end">
                            <div className="space-y-3">
                              <h4 className="font-medium text-sm">Extra Days in {format(selectedDate, "MMMM")}</h4>
                              <p className="text-xs text-muted-foreground">
                                Holidays are excluded from extra day calculations.
                              </p>
                              <div className="space-y-3">
                                {usersWithExtraDays.map(({ user, extraDays }) => (
                                  <div key={user.id} className="border-b pb-2 last:border-0">
                                    <div className="font-medium text-sm">{user.full_name || user.email}</div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {extraDays.map((date) => (
                                        <Badge
                                          key={date}
                                          variant="outline"
                                          className="text-xs text-orange-500 border-orange-500"
                                        >
                                          {format(new Date(date + "T12:00:00"), "MMM d")}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <div className="space-y-1 max-h-24 sm:max-h-32 overflow-y-auto">
                      {usersWithMultipleDays.map(({ user, count }) => {
                        // Display count - 1 (first day is regular, rest are extra)
                        const extraDaysCount = count - 1;
                        return (
                          <div key={user.id} className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="truncate">{user.full_name || user.email}</span>
                            <Badge variant="secondary" className="text-[10px] sm:text-xs ml-2">
                              {extraDaysCount}x
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
          </div>

          {/* Right side - Schedule for selected date */}
          <div className="flex flex-col space-y-3 sm:space-y-4 overflow-hidden min-h-0">
            {selectedDate ? (
              <>
                <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
                  <h3 className="font-medium text-xs sm:text-sm">
                    <span className="hidden sm:inline">{format(selectedDate, "EEEE, MMM d, yyyy")}</span>
                    <span className="sm:hidden">{format(selectedDate, "EEE, MMM d")}</span>
                    {isPastDate && <span className="text-muted-foreground ml-1 sm:ml-2">(Past)</span>}
                  </h3>
                  <Badge variant={isSaturday(selectedDate) ? "default" : "secondary"} className="text-xs">
                    {format(selectedDate, "EEEE")}
                  </Badge>
                </div>

                {/* Already scheduled for this date - grouped by office */}
                {(() => {
                  const dateStr = format(selectedDate, "yyyy-MM-dd");
                  const existingForDate = schedulesByDate[dateStr] || [];

                  // Define minimum thresholds for showing add section
                  const MIN_THRESHOLDS: Record<SelectionKey, number> = {
                    kragujevac: 3,
                    cacak: 2,
                    beograd: 2,
                    maintenance: 1,
                  };

                  // Separate maintenance users from office users
                  const maintenanceSchedules = existingForDate.filter((s) => s.user?.isMaintenance);
                  const officeSchedulesOnly = existingForDate.filter((s) => !s.user?.isMaintenance);

                  // Group non-maintenance scheduled users by office
                  const scheduledByOffice = officeSchedulesOnly.reduce(
                    (acc, schedule) => {
                      const officeRaw = schedule.user?.office?.toLowerCase() || "";
                      let office: OfficeKey | null = null;
                      if (officeRaw.includes("cacak") || officeRaw.includes("čačak")) {
                        office = "cacak";
                      } else if (officeRaw.includes("beograd")) {
                        office = "beograd";
                      } else if (officeRaw.includes("kragujevac")) {
                        office = "kragujevac";
                      }
                      // Only group if we found a valid office, otherwise skip
                      if (office) {
                        if (!acc[office]) acc[office] = [];
                        acc[office].push(schedule);
                      }
                      return acc;
                    },
                    {} as Record<OfficeKey, ScheduleEntry[]>,
                  );

                  // Check which offices need more dispatchers
                  const officesBelowThreshold = (["kragujevac", "cacak", "beograd"] as OfficeKey[]).filter(
                    (office) => (scheduledByOffice[office]?.length || 0) < MIN_THRESHOLDS[office],
                  );
                  const maintenanceBelowThreshold = maintenanceSchedules.length < MIN_THRESHOLDS.maintenance;
                  const needsMoreDispatchers = officesBelowThreshold.length > 0 || maintenanceBelowThreshold;

                  return (
                    <>
                      {/* Show existing scheduled users */}
                      {existingForDate.length > 0 && (
                        <ScrollArea className="border rounded-md p-2 sm:p-3 bg-muted/30 max-h-[60vh]">
                          {(["kragujevac", "cacak", "beograd"] as OfficeKey[]).map((office) => {
                            const officeSchedules = scheduledByOffice[office] || [];
                            if (officeSchedules.length === 0) return null;

                            const config = OFFICE_CONFIG[office];
                            const alreadyScheduledIds = new Set(officeSchedules.map((s) => s.user_id));
                            const officeUsersForOffice = usersByOffice[office] || [];
                            const availableUsersToAdd = officeUsersForOffice.filter(
                              (u) => !alreadyScheduledIds.has(u.id),
                            );

                            return (
                              <div key={office} className="mb-3 sm:mb-4">
                                <div className="flex items-center gap-2 mb-1 sm:mb-2">
                                  <Badge variant="outline" className="text-xs">{config.label}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {officeSchedules.length}/{config.slots}
                                  </span>
                                  {canManageSchedules && !isPastDate && availableUsersToAdd.length > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={() => setForceShowOffice((prev) => (prev === office ? null : office))}
                                    >
                                      <Plus
                                        className={`h-3 w-3 transition-transform duration-200 ${forceShowOffice === office ? "rotate-45" : ""}`}
                                      />
                                    </Button>
                                  )}
                                </div>
                                <div className="space-y-1 pl-2">
                                  {officeSchedules.map((schedule) => {
                                    // Check if this user worked any day BEFORE this date in the same month
                                    // Use string comparison to avoid timezone issues
                                    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
                                    const monthStartStr = format(startOfMonth(selectedDate), "yyyy-MM-dd");
                                    const daysWorkedBefore = existingSchedules.filter(
                                      (s) => {
                                        if (s.user_id !== schedule.user_id) return false;
                                        if (s.scheduled_date < monthStartStr || s.scheduled_date >= selectedDateStr) return false;
                                        const scheduleDate = new Date(s.scheduled_date + "T12:00:00");
                                        // Only count weekend days (Sat/Sun), exclude holidays
                                        return isWeekend(scheduleDate) && !isHoliday(scheduleDate);
                                      },
                                    ).length;
                                    const isExtra = daysWorkedBefore >= 1;

                                    return (
                                      <div
                                        key={schedule.id}
                                        className="flex items-center justify-between bg-background rounded px-2 py-1 sm:py-1.5 text-xs sm:text-sm"
                                      >
                                        <span className="flex items-center gap-1 sm:gap-2 truncate">
                                          <span className="truncate">{schedule.user?.full_name || schedule.user?.email || "Unknown"}</span>
                                          {isExtra && (
                                            <Badge
                                              variant="outline"
                                              className="text-[10px] sm:text-xs text-orange-500 border-orange-500 flex-shrink-0"
                                            >
                                              extra
                                            </Badge>
                                          )}
                                        </span>
                                        {canManageSchedules && !isPastDate && (
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
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Maintenance section at bottom */}
                          {maintenanceSchedules.length > 0 &&
                            (() => {
                              const alreadyScheduledMaintenanceIds = new Set(
                                maintenanceSchedules.map((s) => s.user_id),
                              );
                              const availableMaintenanceToAdd = maintenanceUsers.filter(
                                (u) => !alreadyScheduledMaintenanceIds.has(u.id),
                              );

                              return (
                                <div className="mb-3 sm:mb-4 border-t pt-3 sm:pt-4 mt-3 sm:mt-4">
                                  <div className="flex items-center gap-2 mb-1 sm:mb-2">
                                    <Badge variant="outline" className="text-xs">{MAINTENANCE_CONFIG.label}</Badge>
                                    <span className="text-[10px] sm:text-xs text-muted-foreground">{maintenanceSchedules.length}</span>
                                    {canManageSchedules && !isPastDate && availableMaintenanceToAdd.length > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={() =>
                                          setForceShowOffice((prev) => (prev === "maintenance" ? null : "maintenance"))
                                        }
                                      >
                                        <Plus
                                          className={`h-3 w-3 transition-transform duration-200 ${forceShowOffice === "maintenance" ? "rotate-45" : ""}`}
                                        />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="space-y-1 pl-2">
                                    {maintenanceSchedules.map((schedule) => {
                                      // Check if this user worked any day BEFORE this date in the same month
                                      // Use string comparison to avoid timezone issues
                                      const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
                                      const monthStartStr = format(startOfMonth(selectedDate), "yyyy-MM-dd");
                                      const daysWorkedBefore = existingSchedules.filter(
                                        (s) => {
                                          if (s.user_id !== schedule.user_id) return false;
                                          if (s.scheduled_date < monthStartStr || s.scheduled_date >= selectedDateStr) return false;
                                          const scheduleDate = new Date(s.scheduled_date + "T12:00:00");
                                          return isWeekend(scheduleDate) && !isHoliday(scheduleDate);
                                        },
                                      ).length;
                                      const isExtra = daysWorkedBefore >= 1;

                                      return (
                                        <div
                                          key={schedule.id}
                                          className="flex items-center justify-between bg-background rounded px-2 py-1 sm:py-1.5 text-xs sm:text-sm"
                                        >
                                          <span className="flex items-center gap-1 sm:gap-2 truncate">
                                            <span className="truncate">{schedule.user?.full_name || schedule.user?.email || "Unknown"}</span>
                                            {isExtra && (
                                              <Badge
                                                variant="outline"
                                                className="text-[10px] sm:text-xs text-orange-500 border-orange-500 flex-shrink-0"
                                              >
                                                extra
                                              </Badge>
                                            )}
                                          </span>
                                          {canManageSchedules && !isPastDate && (
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
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                        </ScrollArea>
                      )}

                      {/* Show message for past dates with no schedules */}
                      {isPastDate && existingForDate.length === 0 && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                          <p className="text-sm">No schedule recorded for this date</p>
                        </div>
                      )}

                      {/* Show add section for offices/maintenance below minimum threshold - Admin only, future dates only */}
                      {canManageSchedules &&
                        !isPastDate &&
                        (existingForDate.length === 0 || needsMoreDispatchers || forceShowOffice) && (
                            <>
                              {loading ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                </div>
                              ) : (
                                <>
                                  <ScrollArea className="flex-1 border rounded-md p-2 max-h-48 sm:max-h-none">
                                  {(["kragujevac", "cacak", "beograd"] as OfficeKey[]).map((office) => {
                                    const officeUsersForOffice = usersByOffice[office] || [];
                                    const config = OFFICE_CONFIG[office];
                                    const existingCount = scheduledByOffice[office]?.length || 0;
                                    const selectedCount = selectedUsers[office].length;
                                    const totalCount = existingCount + selectedCount;

                                    // Skip if already at or above threshold (unless forceShowOffice matches)
                                    if (existingCount >= MIN_THRESHOLDS[office] && forceShowOffice !== office)
                                      return null;

                                    // Filter out already scheduled users
                                    const alreadyScheduledIds = new Set(
                                      (scheduledByOffice[office] || []).map((s) => s.user_id),
                                    );
                                    const availableUsers = officeUsersForOffice.filter(
                                      (u) => !alreadyScheduledIds.has(u.id),
                                    );

                                    // Get suggestions for this office
                                    const { notWorkedThisMonth, workCounts } = selectedDate
                                      ? getSuggestions(selectedDate, office, alreadyScheduledIds)
                                      : { notWorkedThisMonth: [], workCounts: {} };
                                    const notWorkedIds = new Set(notWorkedThisMonth.map((u) => u.id));

                                    // Sort users: those who haven't worked first, then by name
                                    const sortedUsers = [...availableUsers].sort((a, b) => {
                                      const aNotWorked = notWorkedIds.has(a.id);
                                      const bNotWorked = notWorkedIds.has(b.id);
                                      if (aNotWorked && !bNotWorked) return -1;
                                      if (!aNotWorked && bNotWorked) return 1;
                                      return (a.full_name || a.email).localeCompare(b.full_name || b.email);
                                    });

                                    const isFilled = totalCount >= config.slots;

                                    // Collapse office section if slots are filled (unless expanded or forceShowOffice)
                                    if (isFilled && !expandedFilledOffices[office] && forceShowOffice !== office) {
                                      return (
                                        <div key={office} className="mb-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedFilledOffices((prev) => ({ ...prev, [office]: true }))
                                            }
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

                                    // Show expanded filled office with collapse option (skip if forceShowOffice)
                                    if (isFilled && expandedFilledOffices[office] && forceShowOffice !== office) {
                                      const selectedOfficeUsers = availableUsers.filter((u) =>
                                        selectedUsers[office].includes(u.id),
                                      );
                                      return (
                                        <div key={office} className="mb-4">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedFilledOffices((prev) => ({ ...prev, [office]: false }))
                                            }
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
                                            {selectedOfficeUsers.map((user) => (
                                              <label
                                                key={user.id}
                                                className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                                              >
                                                <Checkbox
                                                  checked={true}
                                                  onCheckedChange={() => handleUserToggle(user.id, office)}
                                                />
                                                <span className="text-sm">{user.full_name || user.email}</span>
                                              </label>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div key={office} className="mb-3 sm:mb-4">
                                        <div className="flex items-center gap-2 mb-1 sm:mb-2 sticky top-0 bg-background py-1 flex-wrap">
                                          <Badge variant="outline" className="text-xs">{config.label}</Badge>
                                          <span className="text-[10px] sm:text-xs text-muted-foreground">
                                            {totalCount}/{config.slots} (need {MIN_THRESHOLDS[office] - existingCount}{" "}
                                            more)
                                          </span>
                                          {notWorkedThisMonth.length > 0 && (
                                            <span className="text-[10px] sm:text-xs text-amber-500 flex items-center gap-1">
                                              <Lightbulb className="h-3 w-3" />
                                              {notWorkedThisMonth.length} haven't worked
                                            </span>
                                          )}
                                        </div>
                                        {sortedUsers.length === 0 ? (
                                          <p className="text-[10px] sm:text-xs text-muted-foreground pl-2">
                                            No available users in this office
                                          </p>
                                        ) : (
                                          <div className="space-y-1 pl-2">
                                            {sortedUsers.map((user) => {
                                              const hasNotWorked = notWorkedIds.has(user.id);
                                              const monthlyCount = workCounts[user.id]?.count || 0;
                                              return (
                                                <label
                                                  key={user.id}
                                                  className={`flex items-center gap-2 p-1 sm:p-1.5 rounded cursor-pointer ${
                                                    hasNotWorked
                                                      ? "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30"
                                                      : "hover:bg-muted"
                                                  }`}
                                                >
                                                  <Checkbox
                                                    checked={selectedUsers[office].includes(user.id)}
                                                    onCheckedChange={() =>
                                                      handleUserToggle(user.id, office, forceShowOffice === office)
                                                    }
                                                    className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                                                  />
                                                  <span className="text-xs sm:text-sm flex-1 truncate">{user.full_name || user.email}</span>
                                                  {hasNotWorked ? (
                                                    <Badge
                                                      variant="outline"
                                                      className="text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0 border-amber-500/50 text-amber-500 flex-shrink-0"
                                                    >
                                                      Suggested
                                                    </Badge>
                                                  ) : (
                                                    monthlyCount > 0 && (
                                                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                                        {monthlyCount}x
                                                      </span>
                                                    )
                                                  )}
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Maintenance section at bottom - only if below threshold or forceShowOffice is maintenance */}
                                  {(maintenanceBelowThreshold || forceShowOffice === "maintenance") &&
                                    maintenanceUsers.length > 0 && (
                                      <div className="mb-3 sm:mb-4 border-t pt-3 sm:pt-4 mt-3 sm:mt-4">
                                        {(() => {
                                          const existingMaintenanceCount = maintenanceSchedules.length;
                                          const alreadyScheduledIds = new Set(
                                            maintenanceSchedules.map((s) => s.user_id),
                                          );
                                          const availableMaintenanceUsers = maintenanceUsers.filter(
                                            (u) => !alreadyScheduledIds.has(u.id),
                                          );
                                          const selectedCount = selectedUsers.maintenance.length;
                                          const totalCount = existingMaintenanceCount + selectedCount;
                                          const isFilled = totalCount >= MAINTENANCE_CONFIG.slots;

                                          if (isFilled && !expandedFilledOffices.maintenance) {
                                            return (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setExpandedFilledOffices((prev) => ({ ...prev, maintenance: true }))
                                                }
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
                                            const selectedMaintenanceUsers = availableMaintenanceUsers.filter((u) =>
                                              selectedUsers.maintenance.includes(u.id),
                                            );
                                            return (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setExpandedFilledOffices((prev) => ({
                                                      ...prev,
                                                      maintenance: false,
                                                    }))
                                                  }
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
                                                  {selectedMaintenanceUsers.map((user) => (
                                                    <label
                                                      key={user.id}
                                                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                                                    >
                                                      <Checkbox
                                                        checked={true}
                                                        onCheckedChange={() =>
                                                          handleUserToggle(
                                                            user.id,
                                                            "maintenance",
                                                            forceShowOffice === "maintenance",
                                                          )
                                                        }
                                                      />
                                                      <span className="text-sm">{user.full_name || user.email}</span>
                                                    </label>
                                                  ))}
                                                </div>
                                              </>
                                            );
                                          }

                                          return (
                                            <>
                                              <div className="flex items-center gap-2 mb-1 sm:mb-2 sticky top-0 bg-background py-1">
                                                <Badge variant="outline" className="text-xs">{MAINTENANCE_CONFIG.label}</Badge>
                                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                                  {totalCount}/{MAINTENANCE_CONFIG.slots} (need{" "}
                                                  {MIN_THRESHOLDS.maintenance - existingMaintenanceCount} more)
                                                </span>
                                              </div>
                                              <div className="space-y-1 pl-2">
                                                {availableMaintenanceUsers.map((user) => (
                                                    <label
                                                      key={user.id}
                                                      className="flex items-center gap-2 p-1 sm:p-1.5 rounded hover:bg-muted cursor-pointer"
                                                    >
                                                      <Checkbox
                                                        checked={selectedUsers.maintenance.includes(user.id)}
                                                        onCheckedChange={() =>
                                                          handleUserToggle(
                                                            user.id,
                                                            "maintenance",
                                                            forceShowOffice === "maintenance",
                                                          )
                                                        }
                                                        className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                                                      />
                                                      <span className="text-xs sm:text-sm truncate">{user.full_name || user.email}</span>
                                                    </label>
                                                  ))}
                                              </div>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    )}
                                </ScrollArea>
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
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="flex items-center justify-center h-32 sm:h-full text-muted-foreground">
                <p className="text-xs sm:text-sm">Select a weekend date to manage schedule</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
