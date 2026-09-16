import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Moon, Sunrise, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { useAuthContext } from "@/contexts/AuthContext";

type ShiftKey = "night" | "morning";

const SHIFTS: { key: ShiftKey; label: string; hours: string; icon: typeof Moon }[] = [
  { key: "night", label: "Night shift", hours: "10:00 PM – 6:00 AM (next day)", icon: Moon },
  { key: "morning", label: "Morning shift", hours: "6:00 AM – 2:00 PM", icon: Sunrise },
];

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
  const canManage =
    hasRole("admin") || hasRole("manager") || SCHEDULE_MANAGER_EMAILS.includes(profile?.email?.toLowerCase() || "");

  const [users, setUsers] = useState<ShiftUser[]>([]);
  const [entries, setEntries] = useState<ShiftEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<ShiftKey | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
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

  const assignedFor = (shift: ShiftKey) =>
    entries.filter((e) => e.scheduled_date === dateStr && e.shift === shift);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const userLabel = (id: string) => {
    const u = userById.get(id);
    return u ? u.full_name || u.email : "Unknown user";
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.full_name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  const toggleUser = async (userId: string, shift: ShiftKey) => {
    if (!dateStr || !canManage) return;
    const existing = entries.find((e) => e.scheduled_date === dateStr && e.shift === shift && e.user_id === userId);
    setSaving(shift);
    try {
      if (existing) {
        const { error } = await supabase.from("afterhours_shift_schedule").delete().eq("id", existing.id);
        if (error) throw error;
        setEntries((prev) => prev.filter((e) => e.id !== existing.id));
      } else {
        const { data, error } = await supabase
          .from("afterhours_shift_schedule")
          .insert({ user_id: userId, scheduled_date: dateStr, shift })
          .select("id, user_id, scheduled_date, shift")
          .single();
        if (error) throw error;
        setEntries((prev) => [...prev, data as ShiftEntry]);
      }
    } catch (error: any) {
      console.error("Error updating shift:", error);
      toast.error(error.message || "Failed to update shift");
    } finally {
      setSaving(null);
    }
  };

  const removeEntry = async (id: string) => {
    try {
      const { error } = await supabase.from("afterhours_shift_schedule").delete().eq("id", id);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Removed from shift");
    } catch (error) {
      console.error("Error removing shift entry:", error);
      toast.error("Failed to remove");
    }
  };

  const upcomingDates = useMemo(() => {
    const dates = [...new Set(entries.map((e) => e.scheduled_date))].sort().reverse();
    return dates;
  }, [entries]);

  const shiftWindowLabel = (shift: ShiftKey) => {
    if (!selectedDate) return "";
    if (shift === "night") {
      return `${format(selectedDate, "MMM d")} 10:00 PM → ${format(addDays(selectedDate, 1), "MMM d")} 6:00 AM`;
    }
    return `${format(selectedDate, "MMM d")} 6:00 AM → 2:00 PM`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Afterhours Shift Assignment</DialogTitle>
          <DialogDescription>
            Pick a day, then choose who works the night shift (10 PM – 6 AM) and the morning shift (6 AM – 2 PM).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div>
            <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} className="rounded-md border" />
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
              </div>
            ) : !selectedDate ? (
              <p className="text-sm text-muted-foreground">Select a day to assign shifts.</p>
            ) : (
              <>
                <Input
                  placeholder="Search users…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9"
                />
                {SHIFTS.map(({ key, label, hours, icon: Icon }) => {
                  const assigned = assignedFor(key);
                  const assignedIds = new Set(assigned.map((a) => a.user_id));
                  return (
                    <div key={key} className="rounded-md border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">
                              {hours} · {shiftWindowLabel(key)}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary">{assigned.length} assigned</Badge>
                      </div>

                      {assigned.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {assigned.map((a) => (
                            <Badge key={a.id} variant="outline" className="gap-1">
                              {userLabel(a.user_id)}
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => removeEntry(a.id)}
                                  className="ml-1 text-muted-foreground hover:text-destructive"
                                  aria-label="Remove"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <ScrollArea className="h-40 pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                        <div className="space-y-1">
                          {filteredUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No matching users.</p>
                          ) : (
                            filteredUsers.map((u) => (
                              <label
                                key={u.id}
                                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={assignedIds.has(u.id)}
                                  disabled={!canManage || saving === key}
                                  onCheckedChange={() => toggleUser(u.id, key)}
                                />
                                <span className="truncate">{u.full_name || u.email}</span>
                                {u.isManager && (
                                  <Badge variant="secondary" className="ml-auto text-[10px]">
                                    Manager
                                  </Badge>
                                )}
                              </label>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Scheduled days</p>
          {upcomingDates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts scheduled yet.</p>
          ) : (
            <ScrollArea className="max-h-64 pr-2">
              <div className="space-y-2">
                {upcomingDates.map((d) => (
                  <div key={d} className="rounded-md border p-2">
                    <p className="text-sm font-medium">{format(new Date(d + "T12:00:00"), "EEEE, MMM d, yyyy")}</p>
                    {SHIFTS.map(({ key, label }) => {
                      const list = entries.filter((e) => e.scheduled_date === d && e.shift === key);
                      return (
                        <div key={key} className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-24">{label}:</span>
                          {list.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            list.map((e) => (
                              <Badge key={e.id} variant="outline" className="gap-1">
                                {userLabel(e.user_id)}
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => removeEntry(e.id)}
                                    className="ml-1 text-muted-foreground hover:text-destructive"
                                    aria-label="Remove"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </Badge>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {!canManage && (
          <p className="text-xs text-muted-foreground">You can view the schedule but not change it.</p>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
