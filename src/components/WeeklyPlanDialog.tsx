import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { startOfWeek, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Loader2, Lock, Unlock } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";

const CHICAGO_TZ = "America/Chicago";

interface WeeklyPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
}

/**
 * Get Chicago time now
 */
function getChicagoNow(): Date {
  return toZonedTime(new Date(), CHICAGO_TZ);
}

/**
 * Get the Monday of the current week in Chicago time
 */
function getCurrentWeekMonday(): string {
  const chicagoNow = getChicagoNow();
  const monday = startOfWeek(chicagoNow, { weekStartsOn: 1 }); // 1 = Monday
  return format(monday, "yyyy-MM-dd");
}

/**
 * Check if editing is allowed based on Chicago time rules:
 * - Editable: Monday 6:45 AM - 11:00 AM Chicago time (unless admin-unlocked)
 * - Locked: After 11:00 AM Monday until next Monday 6:44 AM
 */
function getEditingStatus(isAdminUnlocked: boolean): { canEdit: boolean; reason: string } {
  // If admin has unlocked this plan, allow editing
  if (isAdminUnlocked) {
    return { canEdit: true, reason: "" };
  }

  const chicagoNow = getChicagoNow();
  const dayOfWeek = chicagoNow.getDay(); // 0 = Sunday, 1 = Monday
  const hours = chicagoNow.getHours();
  const minutes = chicagoNow.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const startEditMinutes = 6 * 60 + 45; // 6:45 AM = 405 minutes
  const endEditMinutes = 11 * 60; // 11:00 AM = 660 minutes

  if (dayOfWeek === 1) {
    // Monday
    if (totalMinutes >= startEditMinutes && totalMinutes < endEditMinutes) {
      return { canEdit: true, reason: "" };
    } else if (totalMinutes < startEditMinutes) {
      return { canEdit: false, reason: "Editing available at 6:45 AM" };
    } else {
      return { canEdit: false, reason: "Locked after 11:00 AM" };
    }
  }

  // Not Monday - locked
  return { canEdit: false, reason: "Editing only on Monday 6:45 AM - 11:00 AM" };
}

/**
 * Get icon color based on plan state and time
 */
export function getWeeklyPlanIconColor(hasPlan: boolean): "yellow" | "red" | "gray" {
  const chicagoNow = getChicagoNow();
  const dayOfWeek = chicagoNow.getDay();
  const hours = chicagoNow.getHours();
  const totalMinutes = hours * 60 + chicagoNow.getMinutes();
  
  // After 11:00 AM Monday (660 minutes) until end of week
  const isAfterDeadline = dayOfWeek === 1 && totalMinutes >= 11 * 60;
  const isPastMonday = dayOfWeek > 1 || dayOfWeek === 0; // Tue-Sun

  if (hasPlan) {
    return "gray"; // Has plan - all good
  }

  if (isAfterDeadline || isPastMonday) {
    return "red"; // No plan after deadline
  }

  return "yellow"; // No plan before deadline
}

export function WeeklyPlanDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
}: WeeklyPlanDialogProps) {
  const { toast } = useToast();
  const { hasRole } = useAuthContext();
  const [planText, setPlanText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [existingPlanId, setExistingPlanId] = useState<string | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const isSavingRef = useRef(false); // Track saving state for realtime guard

  const isAdmin = hasRole("admin");
  const weekStart = useMemo(() => getCurrentWeekMonday(), []);
  const editingStatus = useMemo(() => getEditingStatus(isAdminUnlocked), [isAdminUnlocked]);

  // Fetch existing plan when dialog opens
  useEffect(() => {
    if (open && driverId) {
      fetchPlan();
    }
  }, [open, driverId, weekStart]);

  // Set up realtime subscription
  useEffect(() => {
    if (!open || !driverId) return;

    const channel = supabase
      .channel(`weekly-plan-${driverId}-${weekStart}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "weekly_plans",
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          // Skip realtime updates while saving to prevent overwriting local state
          if (isSavingRef.current) {
            console.log("[WeeklyPlan] Ignoring realtime update during save");
            return;
          }
          
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const data = payload.new as any;
            if (data.week_start === weekStart) {
              setPlanText(data.plan_text || "");
              setExistingPlanId(data.id);
              setIsAdminUnlocked(data.is_admin_unlocked || false);
            }
          } else if (payload.eventType === "DELETE") {
            const data = payload.old as any;
            if (data.week_start === weekStart) {
              setPlanText("");
              setExistingPlanId(null);
              setIsAdminUnlocked(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, driverId, weekStart]);

  const fetchPlan = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("driver_id", driverId)
        .eq("week_start", weekStart)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPlanText(data.plan_text || "");
        setExistingPlanId(data.id);
        setIsAdminUnlocked((data as any).is_admin_unlocked || false);
      } else {
        setPlanText("");
        setExistingPlanId(null);
        setIsAdminUnlocked(false);
      }
    } catch (error) {
      console.error("Error fetching weekly plan:", error);
      toast({
        title: "Error",
        description: "Failed to load weekly plan",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingStatus.canEdit) {
      toast({
        title: "Cannot edit",
        description: editingStatus.reason,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    isSavingRef.current = true; // Guard against realtime overwrites
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (existingPlanId) {
        // Update existing plan
        const { data, error } = await supabase
          .from("weekly_plans")
          .update({
            plan_text: planText,
            updated_by: userId,
          })
          .eq("id", existingPlanId)
          .select()
          .single();

        if (error) throw error;
        
        // Update local state with returned data
        if (data) {
          setPlanText(data.plan_text || "");
        }
      } else {
        // Insert new plan
        const { data, error } = await supabase
          .from("weekly_plans")
          .insert({
            driver_id: driverId,
            week_start: weekStart,
            plan_text: planText,
            updated_by: userId,
          })
          .select()
          .single();

        if (error) throw error;
        
        // Update local state with returned data
        if (data) {
          setExistingPlanId(data.id);
          setPlanText(data.plan_text || "");
        }
      }

      toast({
        title: "Saved",
        description: "Weekly plan updated successfully",
      });
    } catch (error) {
      console.error("Error saving weekly plan:", error);
      toast({
        title: "Error",
        description: "Failed to save weekly plan",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      // Delay clearing the guard to allow realtime event to pass
      setTimeout(() => {
        isSavingRef.current = false;
      }, 500);
    }
  };

  const handleToggleLock = async () => {
    if (!isAdmin) return;

    setIsTogglingLock(true);
    isSavingRef.current = true;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      const newUnlockedState = !isAdminUnlocked;

      if (existingPlanId) {
        // Update existing plan
        const { error } = await supabase
          .from("weekly_plans")
          .update({
            is_admin_unlocked: newUnlockedState,
            unlocked_by: newUnlockedState ? userId : null,
            unlocked_at: newUnlockedState ? new Date().toISOString() : null,
          })
          .eq("id", existingPlanId);

        if (error) throw error;
      } else {
        // Create plan record just for the unlock state
        const { data, error } = await supabase
          .from("weekly_plans")
          .insert({
            driver_id: driverId,
            week_start: weekStart,
            plan_text: "",
            is_admin_unlocked: newUnlockedState,
            unlocked_by: newUnlockedState ? userId : null,
            unlocked_at: newUnlockedState ? new Date().toISOString() : null,
            updated_by: userId,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setExistingPlanId(data.id);
        }
      }

      setIsAdminUnlocked(newUnlockedState);
      toast({
        title: newUnlockedState ? "Unlocked" : "Locked",
        description: newUnlockedState 
          ? "Weekly plan unlocked for editing" 
          : "Weekly plan locked",
      });
    } catch (error) {
      console.error("Error toggling lock:", error);
      toast({
        title: "Error",
        description: "Failed to toggle lock state",
        variant: "destructive",
      });
    } finally {
      setIsTogglingLock(false);
      setTimeout(() => {
        isSavingRef.current = false;
      }, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Weekly Plan - {driverName}
            {isAdminUnlocked && (
              <span className="flex items-center gap-1 text-sm font-normal text-green-600">
                <Unlock className="h-4 w-4" />
                Admin unlocked
              </span>
            )}
            {!editingStatus.canEdit && !isAdminUnlocked && (
              <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                <Lock className="h-4 w-4" />
                {editingStatus.reason}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Week starting: {format(new Date(weekStart), "MMMM d, yyyy")}
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleLock}
                disabled={isTogglingLock}
              >
                {isTogglingLock ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : isAdminUnlocked ? (
                  <Lock className="h-4 w-4 mr-2" />
                ) : (
                  <Unlock className="h-4 w-4 mr-2" />
                )}
                {isAdminUnlocked ? "Lock" : "Unlock"}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Textarea
              value={planText}
              onChange={(e) => setPlanText(e.target.value)}
              placeholder="Enter weekly plan for this driver..."
              className="min-h-[300px] resize-none"
              disabled={!editingStatus.canEdit}
            />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {editingStatus.canEdit && (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
