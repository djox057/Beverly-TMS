import { useQuery } from "@tanstack/react-query";
import { isValidUUID } from "@/utils/validation";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wrench, TruckIcon, X, Pencil, Bell, Check, ShieldCheck, XCircle, Search, Languages } from "lucide-react";
import { SetDriverStatusDialog } from "@/components/SetDriverStatusDialog";
import { CompletedDriversDialog } from "@/components/CompletedDriversDialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format as formatDate, startOfDay } from "date-fns";
import { useState, useMemo } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useDrivers } from "@/hooks/useDrivers";
import { EditDriverDialog } from "@/components/EditDriverDialog";

interface YardAction {
  id: string;
  driver_id: string;
  action_type: "maintenance" | "return_truck" | "safety" | "recovery";
  comment: string;
  comment_eng: string | null;
  created_at: string;
  arrival_datetime: string | null;
  created_by: string | null;
  is_checked: boolean;
  is_team: boolean;
  driver: {
    name: string;
    first_name: string;
    last_name: string;
  } | null;
  truck: {
    truck_number: string;
  } | null;
  creator: {
    full_name: string | null;
  } | null;
}

interface TwoWeekNoticeDriver {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  two_week_block_date: string;
  is_checked_for_termination: boolean;
  truck: {
    truck_number: string;
  } | null;
}

export default function YardArrivals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useAuthContext();
  const canEditDriver = hasRole('admin') || hasRole('manager');
  const canRemoveYardArrival = hasRole('admin') || hasRole('manager');
  
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [actionToCancel, setActionToCancel] = useState<{ id: string; driverId: string; driverName: string; isTeam: boolean } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [actionToEdit, setActionToEdit] = useState<YardAction | null>(null);
  const [editForm, setEditForm] = useState({
    arrival_datetime: "",
    comment: "",
  });
  const [removeTwoWeekDialogOpen, setRemoveTwoWeekDialogOpen] = useState(false);
  const [driverToRemoveTwoWeek, setDriverToRemoveTwoWeek] = useState<{ id: string; name: string } | null>(null);
  
  // Edit driver dialog state
  const [isEditDriverDialogOpen, setIsEditDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  
  // Set Driver Status dialog state
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogData, setStatusDialogData] = useState<{
    truckId: string;
    truckNumber: string;
    driverId: string;
    existingDates: string[];
    hasRecoveryStatus: boolean;
    hasRecoveryDriverAssigned: boolean;
  } | null>(null);
  
  // Fetch all drivers for edit dialog
  const { data: allDrivers } = useDrivers();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  const { data: yardActions, isLoading } = useQuery({
    queryKey: ["yard-arrivals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_yard_actions")
        .select(`
          id,
          driver_id,
          action_type,
          comment,
          comment_eng,
          created_at,
          arrival_datetime,
          created_by,
          is_checked,
          is_team,
          truck_number,
          drivers!driver_yard_actions_driver_id_fkey (
            name,
            first_name,
            last_name
          )
        `)
        .order("arrival_datetime", { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Get unique creator IDs
      const allCreatorIds = [...new Set((data || []).map(a => a.created_by).filter(Boolean))] as string[];
      const creatorIds = allCreatorIds.filter(isValidUUID);
      if (creatorIds.length < allCreatorIds.length) {
        console.warn(`[YardArrivals] Filtered ${allCreatorIds.length - creatorIds.length} invalid UUIDs from created_by`);
      }
      
      // Fetch all creators at once
      const { data: creatorsData } = creatorIds.length > 0 
        ? await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", creatorIds)
        : { data: [] };
      
      const creatorsMap = new Map(
        (creatorsData || []).map(c => [c.user_id, c.full_name])
      );

      // Map actions with truck info from saved truck_number
      const actionsWithTrucks = (data || []).map((action) => {
        return {
          ...action,
          driver: action.drivers,
          truck: action.truck_number ? { truck_number: action.truck_number } : null,
          is_team: action.is_team || false,
          creator: action.created_by ? { full_name: creatorsMap.get(action.created_by) || null } : null,
        };
      });

      // Sort by arrival_datetime or created_at, ascending
      const sorted = actionsWithTrucks.sort((a, b) => {
        const dateA = new Date(a.arrival_datetime || a.created_at).getTime();
        const dateB = new Date(b.arrival_datetime || b.created_at).getTime();
        return dateA - dateB;
      });

      return sorted as YardAction[];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: twoWeekNoticeDrivers, isLoading: isLoadingTwoWeekNotice } = useQuery({
    queryKey: ["two-week-notice-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select(`
          id,
          name,
          first_name,
          last_name,
          two_week_block_date,
          is_checked_for_termination
        `)
        .not("two_week_block_date", "is", null)
        .order("two_week_block_date", { ascending: true });

      if (error) throw error;

      // Fetch truck information for each driver, fallback to assignment history
      const driversWithTrucks = await Promise.all(
        (data || []).map(async (driver) => {
          const { data: truckData } = await supabase
            .from("trucks")
            .select("truck_number")
            .eq("driver1_id", driver.id)
            .maybeSingle();

          if (truckData?.truck_number) {
            return { ...driver, truck: truckData };
          }

          // Fallback: check as driver2
          const { data: truckData2 } = await supabase
            .from("trucks")
            .select("truck_number")
            .eq("driver2_id", driver.id)
            .maybeSingle();

          if (truckData2?.truck_number) {
            return { ...driver, truck: truckData2 };
          }

          // Fallback: get last truck from assignment history
          const { data: historyData } = await supabase
            .from("assignment_history")
            .select("truck_id, trucks!assignment_history_truck_id_fkey(truck_number)")
            .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id},old_driver1_id.eq.${driver.id},old_driver2_id.eq.${driver.id}`)
            .not("truck_id", "is", null)
            .not("change_type", "eq", "dispatcher_assignment")
            .order("changed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const historyTruckNumber = (historyData?.trucks as any)?.truck_number || null;

          return {
            ...driver,
            truck: historyTruckNumber ? { truck_number: historyTruckNumber } : null,
          };
        })
      );

      return driversWithTrucks as TwoWeekNoticeDriver[];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Filter function for search
  const filterBySearch = (action: YardAction) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const truckNumber = action.truck?.truck_number?.toLowerCase() || "";
    const driverName = action.driver?.name?.toLowerCase() || 
      `${action.driver?.first_name || ""} ${action.driver?.last_name || ""}`.toLowerCase();
    return truckNumber.includes(query) || driverName.includes(query);
  };

  const filterTwoWeekBySearch = (driver: TwoWeekNoticeDriver) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const truckNumber = driver.truck?.truck_number?.toLowerCase() || "";
    const driverName = driver.name?.toLowerCase() || 
      `${driver.first_name || ""} ${driver.last_name || ""}`.toLowerCase();
    return truckNumber.includes(query) || driverName.includes(query);
  };

  const maintenanceActions = useMemo(() => 
    (yardActions?.filter((a) => a.action_type === "maintenance") || []).filter(filterBySearch),
    [yardActions, searchQuery]
  );
  const returnTruckActions = useMemo(() => 
    (yardActions?.filter((a) => a.action_type === "return_truck") || []).filter(filterBySearch),
    [yardActions, searchQuery]
  );
  const recoveryActions = useMemo(() => 
    (yardActions?.filter((a) => a.action_type === "recovery") || []).filter(filterBySearch),
    [yardActions, searchQuery]
  );
  const safetyActions = useMemo(() => 
    (yardActions?.filter((a) => a.action_type === "safety") || []).filter(filterBySearch),
    [yardActions, searchQuery]
  );

  // Group actions by date
  const groupByDate = (actions: YardAction[]) => {
    const groups = new Map<string, YardAction[]>();
    
    actions.forEach((action) => {
      // Extract date string directly without timezone conversion
      const dateString = action.arrival_datetime || action.created_at;
      const dateKey = dateString.split('T')[0]; // Get YYYY-MM-DD part
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(action);
    });
    
    // Sort by date ascending
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  };

  // Group two week notice drivers by date
  const groupTwoWeekNoticeByDate = (drivers: TwoWeekNoticeDriver[]) => {
    const groups = new Map<string, TwoWeekNoticeDriver[]>();
    
    drivers.forEach((driver) => {
      const dateKey = driver.two_week_block_date;
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(driver);
    });
    
    // Sort by date ascending
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  };

  const groupedMaintenance = groupByDate(maintenanceActions);
  const groupedReturnTruck = groupByDate(returnTruckActions);
  const groupedRecovery = groupByDate(recoveryActions);
  const groupedSafety = groupByDate(safetyActions);
  const filteredTwoWeekNoticeDrivers = useMemo(() => 
    (twoWeekNoticeDrivers || []).filter(filterTwoWeekBySearch),
    [twoWeekNoticeDrivers, searchQuery]
  );
  const groupedTwoWeekNotice = groupTwoWeekNoticeByDate(filteredTwoWeekNoticeDrivers);

  const handleCancelAction = async () => {
    if (!actionToCancel) return;

    try {
      // Delete the yard action
      await supabase.from("driver_yard_actions").delete().eq("id", actionToCancel.id);

      // Remove going_yard status from driver(s)
      if (actionToCancel.isTeam) {
        // For teams, find driver2 from the truck and reset both
        const { data: truckData } = await supabase
          .from("trucks")
          .select("driver1_id, driver2_id")
          .eq("driver1_id", actionToCancel.driverId)
          .maybeSingle();
        
        const driverIds = [actionToCancel.driverId];
        if (truckData?.driver2_id) {
          driverIds.push(truckData.driver2_id);
        }
        await supabase.from("drivers").update({ going_yard: false }).in("id", driverIds);
      } else {
        await supabase.from("drivers").update({ going_yard: false }).eq("id", actionToCancel.driverId);
      }

      toast({
        title: "Yard arrival canceled",
      });
      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (error) {
      console.error("Error canceling yard action:", error);
      toast({
        title: "Error",
        description: "Failed to cancel yard arrival",
        variant: "destructive",
      });
    } finally {
      setCancelDialogOpen(false);
      setActionToCancel(null);
    }
  };

  const handleEditAction = async () => {
    if (!actionToEdit) return;

    try {
      const commentChanged = editForm.comment !== actionToEdit.comment;
      await supabase
        .from("driver_yard_actions")
        .update({
          arrival_datetime: editForm.arrival_datetime,
          comment: editForm.comment,
          ...(commentChanged ? { comment_eng: null } : {}),
        })
        .eq("id", actionToEdit.id);

      if (commentChanged && editForm.comment.trim()) {
        supabase.functions
          .invoke("translate-yard-note", {
            body: { id: actionToEdit.id, text: editForm.comment.trim() },
          })
          .then(() => queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] }))
          .catch((e) => console.error("translate-yard-note failed:", e));
      }

      toast({
        title: "Yard arrival updated",
      });
      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
    } catch (error) {
      console.error("Error updating yard action:", error);
      toast({
        title: "Error",
        description: "Failed to update yard arrival",
        variant: "destructive",
      });
    } finally {
      setEditDialogOpen(false);
      setActionToEdit(null);
    }
  };

  const handleRemoveTwoWeek = async () => {
    if (!driverToRemoveTwoWeek) return;

    try {
      await supabase
        .from("drivers")
        .update({ two_week_block_date: null })
        .eq("id", driverToRemoveTwoWeek.id);

      toast({
        title: "2 week notice removed",
      });
      queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
    } catch (error) {
      console.error("Error removing 2 week notice:", error);
      toast({
        title: "Error",
        description: "Failed to remove 2 week notice",
        variant: "destructive",
      });
    } finally {
      setRemoveTwoWeekDialogOpen(false);
      setDriverToRemoveTwoWeek(null);
    }
  };

  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const handleCleanupChecked = async () => {
    setIsCleaningUp(true);
    try {
      const todayStr = formatDate(startOfDay(new Date()), "yyyy-MM-dd") + "T23:59:59";

      const { data: toDelete, error: fetchError } = await supabase
        .from("driver_yard_actions")
        .select("id, driver_id, is_team")
        .in("action_type", ["maintenance", "safety"])
        .eq("is_checked", true)
        .lte("arrival_datetime", todayStr);

      if (fetchError) throw fetchError;
      if (!toDelete || toDelete.length === 0) {
        toast({ title: "No checked maintenance/safety arrivals to clean up" });
        setCleanupDialogOpen(false);
        setIsCleaningUp(false);
        return;
      }

      const ids = toDelete.map(a => a.id);
      const driverIds = [...new Set(toDelete.map(a => a.driver_id))];

      const { error: deleteError } = await supabase
        .from("driver_yard_actions")
        .delete()
        .in("id", ids);

      if (deleteError) throw deleteError;

      if (driverIds.length > 0) {
        await supabase.from("drivers").update({ going_yard: false }).in("id", driverIds);
      }

      toast({ title: `Cleaned up ${toDelete.length} checked arrival(s)` });
      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    } catch (error) {
      console.error("Error cleaning up yard actions:", error);
      toast({ title: "Error", description: "Failed to clean up", variant: "destructive" });
    } finally {
      setCleanupDialogOpen(false);
      setIsCleaningUp(false);
    }
  };

  const handleCheckYardAction = async (actionId: string, currentChecked: boolean) => {
    try {
      await supabase
        .from("driver_yard_actions")
        .update({ is_checked: !currentChecked })
        .eq("id", actionId);

      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
    } catch (error) {
      console.error("Error toggling check:", error);
      toast({
        title: "Error",
        description: "Failed to update check status",
        variant: "destructive",
      });
    }
  };

  const handleCheckTwoWeekNotice = async (driverId: string, currentChecked: boolean) => {
    try {
      await supabase
        .from("drivers")
        .update({ is_checked_for_termination: !currentChecked })
        .eq("id", driverId);

      queryClient.invalidateQueries({ queryKey: ["two-week-notice-drivers"] });
    } catch (error) {
      console.error("Error toggling check:", error);
      toast({
        title: "Error",
        description: "Failed to update check status",
        variant: "destructive",
      });
    }
  };

  const openEditDriverDialog = (driverId: string) => {
    const driver = allDrivers?.find(d => d.id === driverId);
    if (driver) {
      setEditingDriver(driver);
      setIsEditDriverDialogOpen(true);
    }
  };

  // Open Set Driver Status dialog for a recovery action
  const handleOpenStatusDialog = async (action: YardAction) => {
    try {
      // Fetch truck using fallback strategy
      let truck = null;

      // 1. Try by current driver assignment
      const { data: t1 } = await supabase
        .from("trucks")
        .select("id, truck_number, needs_recovery, driver1_id, left_by_driver_id")
        .eq("driver1_id", action.driver_id)
        .maybeSingle();
      truck = t1;

      // 2. Fallback: try by left_by_driver_id (driver was unassigned but truck remembers them)
      if (!truck) {
        const { data: t2 } = await supabase
          .from("trucks")
          .select("id, truck_number, needs_recovery, driver1_id, left_by_driver_id")
          .eq("left_by_driver_id", action.driver_id)
          .eq("needs_recovery", true)
          .maybeSingle();
        truck = t2;
      }

      // 3. Fallback: try by truck_number from the yard action
      if (!truck && action.truck?.truck_number) {
        const { data: t3 } = await supabase
          .from("trucks")
          .select("id, truck_number, needs_recovery, driver1_id, left_by_driver_id")
          .eq("truck_number", action.truck.truck_number.trim())
          .maybeSingle();
        truck = t3;
      }

      if (!truck) {
        toast({
          title: "Error",
          description: "Could not find truck for this driver",
          variant: "destructive",
        });
        return;
      }

      // Fetch existing game over notes for this driver
      const { data: gameOverNotes } = await supabase
        .from("lost_day_notes")
        .select("date, note")
        .eq("driver_id", action.driver_id)
        .ilike("note", "%game over%");

      // Check if a recovery driver is already assigned by checking if driver1_id differs from original
      // When needs_recovery is true and driver1_id is a recovery driver, left_by_driver_id has the original driver
      const hasRecoveryDriverAssigned = truck?.needs_recovery && truck?.left_by_driver_id && !!truck?.driver1_id && truck?.driver1_id !== truck?.left_by_driver_id;

      setStatusDialogData({
        truckId: truck?.id || "",
        truckNumber: action.truck?.truck_number || truck?.truck_number || "",
        driverId: action.driver_id,
        existingDates: gameOverNotes?.map(n => n.date) || [],
        hasRecoveryStatus: truck?.needs_recovery || false,
        hasRecoveryDriverAssigned: !!hasRecoveryDriverAssigned,
      });
      setStatusDialogOpen(true);
    } catch (error) {
      console.error("Error fetching truck/notes data:", error);
      toast({
        title: "Error",
        description: "Failed to load status data",
        variant: "destructive",
      });
    }
  };

  // Handler for initial status confirm (creates notes, sets needs_recovery)
  const handleStatusInitialConfirm = async (startDate: Date, type: "yard" | "at_road", note: string) => {
    if (!statusDialogData) return;
    
    const dateStr = startDate.toISOString().split("T")[0];
    const noteText = type === "yard" ? `game over - yard: ${note}` : `game over - at road: ${note}`;
    
    // Create or update lost_day_note (upsert to handle existing notes)
    await supabase.from("lost_day_notes").upsert({
      driver_id: statusDialogData.driverId,
      date: dateStr,
      note: noteText,
      note_type: "game_over",
    }, {
      onConflict: "driver_id,date",
    });
    
    // Set truck.needs_recovery = true and set left_by_driver_id to current driver
    if (statusDialogData.truckId) {
      await supabase.from("trucks").update({ 
        needs_recovery: true,
        left_by_driver_id: statusDialogData.driverId,
      }).eq("id", statusDialogData.truckId);
    }
    
    queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
    queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    
    // Update dialog state to show awaiting recovery step
    setStatusDialogData(prev => prev ? { ...prev, hasRecoveryStatus: true, existingDates: [...prev.existingDates, dateStr] } : null);
  };

  // Handler for full confirm with recovery driver
  const handleStatusConfirm = async (startDate: Date, type: "yard" | "at_road", note: string, recoveryDriverId?: string) => {
    if (!statusDialogData) return;
    
    const dateStr = startDate.toISOString().split("T")[0];
    const noteText = type === "yard" ? `game over - yard: ${note}` : `game over - at road: ${note}`;
    
    // Create or update lost_day_note (upsert to handle existing notes)
    await supabase.from("lost_day_notes").upsert({
      driver_id: statusDialogData.driverId,
      date: dateStr,
      note: noteText,
      note_type: "game_over",
    }, {
      onConflict: "driver_id,date",
    });
    
    // Update truck
    if (statusDialogData.truckId) {
      const updateData: { needs_recovery: boolean; left_by_driver_id: string; driver1_id?: string } = { 
        needs_recovery: true,
        left_by_driver_id: statusDialogData.driverId,
      };
      if (recoveryDriverId) {
        // Assign recovery driver as the new driver1_id
        updateData.driver1_id = recoveryDriverId;
        
        // Update recovery driver's company to match original driver's company
        const { data: originalDriver } = await supabase
          .from('drivers')
          .select('company_id')
          .eq('id', statusDialogData.driverId)
          .single();

        if (originalDriver?.company_id) {
          await supabase
            .from('drivers')
            .update({ company_id: originalDriver.company_id })
            .eq('id', recoveryDriverId);
        }
      }
      await supabase.from("trucks").update(updateData).eq("id", statusDialogData.truckId);
    }
    
    toast({ title: "Driver status set" });
    queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
    queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  // Handler to assign recovery driver only
  const handleAssignRecoveryDriver = async (recoveryDriverId: string) => {
    if (!statusDialogData?.truckId) return;
    
    // Update recovery driver's company to match original driver's company
    if (statusDialogData.driverId) {
      const { data: originalDriver } = await supabase
        .from('drivers')
        .select('company_id')
        .eq('id', statusDialogData.driverId)
        .single();

      if (originalDriver?.company_id) {
        await supabase
          .from('drivers')
          .update({ company_id: originalDriver.company_id })
          .eq('id', recoveryDriverId);
      }
    }
    
    // Assign recovery driver as driver1_id
    await supabase.from("trucks").update({ driver1_id: recoveryDriverId }).eq("id", statusDialogData.truckId);
    
    toast({ title: "Recovery driver assigned" });
    queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
    queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    queryClient.invalidateQueries({ queryKey: ["drivers"] });
  };

  // Handler to remove all status
  const handleRemoveAllStatus = async () => {
    if (!statusDialogData) return;
    
    // Delete game over notes
    await supabase
      .from("lost_day_notes")
      .delete()
      .eq("driver_id", statusDialogData.driverId)
      .ilike("note", "%game over%");
    
    // Reset truck recovery status
    if (statusDialogData.truckId) {
      await supabase.from("trucks").update({ needs_recovery: false, left_by_driver_id: null }).eq("id", statusDialogData.truckId);
    }
    
    toast({ title: "Status removed" });
    queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
    queryClient.invalidateQueries({ queryKey: ["recovery-trucks"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    // Format as MM/DD/YYYY without time
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  if (isLoading || isLoadingTwoWeekNotice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold whitespace-nowrap">Yard Arrivals</h1>
        <div className="flex-1 flex justify-center max-w-xl">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by truck# or driver name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-lg w-full"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canRemoveYardArrival && (
            <Button variant="outline" size="sm" onClick={() => setCleanupDialogOpen(true)}>
              <XCircle className="h-4 w-4 mr-1" />
              Clean Up Checked
            </Button>
          )}
          <CompletedDriversDialog />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        {/* Maintenance Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Maintenance ({maintenanceActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {maintenanceActions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No maintenance arrivals</p>
            ) : (
              <div className="space-y-6">
                {groupedMaintenance.map(([dateKey, actions]) => {
                  // Parse date without timezone conversion
                  const [year, month, day] = dateKey.split('-').map(Number);
                  const date = new Date(year, month - 1, day);
                  return (
                  <div key={dateKey} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                      {formatDate(date, "EEEE, MMMM d, yyyy")}
                    </h3>
                    <div className="space-y-3">
                      {actions.map((action) => (
                          <div key={action.id} className={`border rounded-lg p-3 space-y-2 ${action.is_checked ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}>
                            <div className="flex items-center justify-between">
                              <p className="font-semibold">
                                #{action.truck?.truck_number || "N/A"}{" "}
                                {action.is_team ? "Team" : (
                                  canEditDriver ? (
                                    <span 
                                      className="text-primary hover:underline cursor-pointer"
                                      onClick={() => openEditDriverDialog(action.driver_id)}
                                    >
                                      {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                                    </span>
                                  ) : (
                                    action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`
                                  )
                                )}
                              </p>
                              <div className="flex gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setActionToEdit(action);
                                    setEditForm({
                                      arrival_datetime: action.arrival_datetime || action.created_at,
                                      comment: action.comment,
                                    });
                                    setEditDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleCheckYardAction(action.id, action.is_checked)}
                                  title={action.is_checked ? "Uncheck" : "Check"}
                                >
                                  <Check className={`h-3 w-3 ${action.is_checked ? 'text-green-600' : 'text-muted-foreground'}`} />
                                </Button>
                                {canRemoveYardArrival && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => {
                                      setActionToCancel({
                                        id: action.id,
                                        driverId: action.driver_id,
                                        driverName: action.is_team ? "Team" : (action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`),
                                        isTeam: action.is_team,
                                      });
                                      setCancelDialogOpen(true);
                                    }}
                                  >
                                    <X className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Date: {formatDateTime(action.arrival_datetime || action.created_at)}
                              {action.creator?.full_name && ` • Created by: ${action.creator.full_name}`}
                            </div>
                            <div>
                              <p className="text-sm font-medium mb-1">Reason:</p>
                              <div className="border rounded-md p-2 bg-background/50">
                                <p className="text-sm break-words whitespace-pre-wrap">{action.comment}</p>
                              </div>
                            </div>
                          </div>
                       ))}
                     </div>
                   </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Return Truck Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TruckIcon className="h-5 w-5" />
              Returning Truck ({returnTruckActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {returnTruckActions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No truck returns</p>
            ) : (
              <div className="space-y-6">
                {groupedReturnTruck.map(([dateKey, actions]) => {
                  // Parse date without timezone conversion
                  const [year, month, day] = dateKey.split('-').map(Number);
                  const date = new Date(year, month - 1, day);
                  return (
                  <div key={dateKey} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                      {formatDate(date, "EEEE, MMMM d, yyyy")}
                    </h3>
                    <div className="space-y-3">
                      {actions.map((action) => (
                        <div key={action.id} className={`border rounded-lg p-3 space-y-2 ${action.is_checked ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}>
                          <div className="flex items-center justify-between">
                            <p className="font-semibold">
                              #{action.truck?.truck_number || "N/A"}{" "}
                              {action.is_team ? "Team" : (
                                canEditDriver ? (
                                  <span 
                                    className="text-primary hover:underline cursor-pointer"
                                    onClick={() => openEditDriverDialog(action.driver_id)}
                                  >
                                    {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                                  </span>
                                ) : (
                                  action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`
                                )
                              )}
                            </p>
                            <div className="flex gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  setActionToEdit(action);
                                  setEditForm({
                                    arrival_datetime: action.arrival_datetime || action.created_at,
                                    comment: action.comment,
                                  });
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCheckYardAction(action.id, action.is_checked)}
                                title={action.is_checked ? "Uncheck" : "Check"}
                              >
                                <Check className={`h-3 w-3 ${action.is_checked ? 'text-green-600' : 'text-muted-foreground'}`} />
                              </Button>
                              {canRemoveYardArrival && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setActionToCancel({
                                      id: action.id,
                                      driverId: action.driver_id,
                                      driverName: action.is_team ? "Team" : (action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`),
                                      isTeam: action.is_team,
                                    });
                                    setCancelDialogOpen(true);
                                  }}
                                >
                                  <X className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Date: {formatDateTime(action.arrival_datetime || action.created_at)}
                            {action.creator?.full_name && ` • Created by: ${action.creator.full_name}`}
                          </div>
                          <div>
                            <p className="text-sm font-medium mb-1">Reason:</p>
                            <div className="border rounded-md p-2 bg-background/50">
                              <p className="text-sm break-words whitespace-pre-wrap">{action.comment}</p>
                            </div>
                          </div>
                        </div>
                       ))}
                     </div>
                   </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recoveries Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TruckIcon className="h-5 w-5" />
              Recoveries ({recoveryActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recoveryActions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recoveries</p>
            ) : (
              <div className="space-y-6">
                {groupedRecovery.map(([dateKey, actions]) => {
                  // Parse date without timezone conversion
                  const [year, month, day] = dateKey.split('-').map(Number);
                  const date = new Date(year, month - 1, day);
                  return (
                  <div key={dateKey} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                      {formatDate(date, "EEEE, MMMM d, yyyy")}
                    </h3>
                    <div className="space-y-3">
                      {actions.map((action) => (
                        <div key={action.id} className={`border rounded-lg p-3 space-y-2 ${action.is_checked ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}>
                          <div className="flex items-center justify-between">
                            <p className="font-semibold">
                              #{action.truck?.truck_number || "N/A"}{" "}
                              {action.is_team ? "Team" : (
                                canEditDriver ? (
                                  <span 
                                    className="text-primary hover:underline cursor-pointer"
                                    onClick={() => openEditDriverDialog(action.driver_id)}
                                  >
                                    {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                                  </span>
                                ) : (
                                  action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`
                                )
                              )}
                            </p>
                            <div className="flex gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  setActionToEdit(action);
                                  setEditForm({
                                    arrival_datetime: action.arrival_datetime || action.created_at,
                                    comment: action.comment,
                                  });
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCheckYardAction(action.id, action.is_checked)}
                                title={action.is_checked ? "Uncheck" : "Check"}
                              >
                                <Check className={`h-3 w-3 ${action.is_checked ? 'text-green-600' : 'text-muted-foreground'}`} />
                              </Button>
                              {canRemoveYardArrival && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setActionToCancel({
                                      id: action.id,
                                      driverId: action.driver_id,
                                      driverName: action.is_team ? "Team" : (action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`),
                                      isTeam: action.is_team,
                                    });
                                    setCancelDialogOpen(true);
                                  }}
                                >
                                  <X className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Date: {formatDateTime(action.arrival_datetime || action.created_at)}
                            {action.creator?.full_name && ` • Created by: ${action.creator.full_name}`}
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Reason:</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleOpenStatusDialog(action)}
                              title="Set Game Over / Recovery Status"
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="border rounded-md p-2 bg-background/50">
                            <p className="text-sm break-words whitespace-pre-wrap">{action.comment}</p>
                          </div>
                        </div>
                       ))}
                     </div>
                   </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Safety Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Safety ({safetyActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {safetyActions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No safety arrivals</p>
            ) : (
              <div className="space-y-6">
                {groupedSafety.map(([dateKey, actions]) => {
                  const [year, month, day] = dateKey.split('-').map(Number);
                  const date = new Date(year, month - 1, day);
                  return (
                  <div key={dateKey} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                      {formatDate(date, "EEEE, MMMM d, yyyy")}
                    </h3>
                    <div className="space-y-3">
                      {actions.map((action) => (
                        <div key={action.id} className={`border rounded-lg p-3 space-y-2 ${action.is_checked ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}>
                          <div className="flex items-center justify-between">
                            <p className="font-semibold">
                              #{action.truck?.truck_number || "N/A"}{" "}
                              {action.is_team ? "Team" : (
                                canEditDriver ? (
                                  <span 
                                    className="text-primary hover:underline cursor-pointer"
                                    onClick={() => openEditDriverDialog(action.driver_id)}
                                  >
                                    {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                                  </span>
                                ) : (
                                  action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`
                                )
                              )}
                            </p>
                            <div className="flex gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  setActionToEdit(action);
                                  setEditForm({
                                    arrival_datetime: action.arrival_datetime || action.created_at,
                                    comment: action.comment,
                                  });
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCheckYardAction(action.id, action.is_checked)}
                                title={action.is_checked ? "Uncheck" : "Check"}
                              >
                                <Check className={`h-3 w-3 ${action.is_checked ? 'text-green-600' : 'text-muted-foreground'}`} />
                              </Button>
                              {canRemoveYardArrival && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setActionToCancel({
                                      id: action.id,
                                      driverId: action.driver_id,
                                      driverName: action.is_team ? "Team" : (action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`),
                                      isTeam: action.is_team,
                                    });
                                    setCancelDialogOpen(true);
                                  }}
                                >
                                  <X className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Date: {formatDateTime(action.arrival_datetime || action.created_at)}
                            {action.creator?.full_name && ` • Created by: ${action.creator.full_name}`}
                          </div>
                          <div>
                            <p className="text-sm font-medium mb-1">Reason:</p>
                            <div className="border rounded-md p-2 bg-background/50">
                              <p className="text-sm break-words whitespace-pre-wrap">{action.comment}</p>
                            </div>
                          </div>
                        </div>
                       ))}
                     </div>
                   </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two Week Notice Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              2 Week Notice ({twoWeekNoticeDrivers?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!twoWeekNoticeDrivers || twoWeekNoticeDrivers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No drivers on 2-week notice</p>
            ) : (
              <div className="space-y-6">
                {groupedTwoWeekNotice.map(([dateKey, drivers]) => {
                  const [year, month, day] = dateKey.split('-').map(Number);
                  const date = new Date(year, month - 1, day);
                  return (
                  <div key={dateKey} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                      {formatDate(date, "EEEE, MMMM d, yyyy")}
                    </h3>
                    <div className="space-y-3">
                      {drivers.map((driver) => (
                        <div key={driver.id} className={`border rounded-lg p-4 space-y-2 ${driver.is_checked_for_termination ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1">
                              <p className="font-semibold">
                                #{driver.truck?.truck_number || "N/A"}{" "}
                                {canEditDriver ? (
                                  <span 
                                    className="text-primary hover:underline cursor-pointer"
                                    onClick={() => openEditDriverDialog(driver.id)}
                                  >
                                    {driver.name || `${driver.first_name} ${driver.last_name}`}
                                  </span>
                                ) : (
                                  driver.name || `${driver.first_name} ${driver.last_name}`
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Last day: {formatDate(date, "MMMM d, yyyy")}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCheckTwoWeekNotice(driver.id, driver.is_checked_for_termination)}
                                title={driver.is_checked_for_termination ? "Uncheck" : "Check"}
                              >
                                <Check className={`h-4 w-4 ${driver.is_checked_for_termination ? 'text-green-600' : 'text-muted-foreground'}`} />
                              </Button>
                              {canRemoveYardArrival && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setDriverToRemoveTwoWeek({
                                      id: driver.id,
                                      name: driver.name || `${driver.first_name} ${driver.last_name}`,
                                    });
                                    setRemoveTwoWeekDialogOpen(true);
                                  }}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Yard Arrival</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the yard arrival for {actionToCancel?.driverName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setActionToCancel(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelAction} className="bg-destructive hover:bg-destructive/90">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Yard Arrival</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Update the arrival time and reason for {actionToEdit?.driver?.name || `${actionToEdit?.driver?.first_name} ${actionToEdit?.driver?.last_name}`}
          </p>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="arrival-datetime">Arrival Date & Time</Label>
              <Input
                id="arrival-datetime"
                type="datetime-local"
                value={editForm.arrival_datetime?.slice(0, 16) || ""}
                onChange={(e) => setEditForm({ ...editForm, arrival_datetime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="comment">Reason</Label>
              <Textarea
                id="comment"
                value={editForm.comment}
                onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditAction}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Two Week Notice Confirmation Dialog */}
      <AlertDialog open={removeTwoWeekDialogOpen} onOpenChange={setRemoveTwoWeekDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove 2 Week Notice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the 2 week notice for {driverToRemoveTwoWeek?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDriverToRemoveTwoWeek(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveTwoWeek} className="bg-destructive hover:bg-destructive/90">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Driver Dialog */}
      <EditDriverDialog
        open={isEditDriverDialogOpen}
        onOpenChange={setIsEditDriverDialogOpen}
        driver={editingDriver}
      />

      {/* Set Driver Status Dialog */}
      {statusDialogData && (
        <SetDriverStatusDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          truckNumber={statusDialogData.truckNumber}
          truckId={statusDialogData.truckId}
          existingDates={statusDialogData.existingDates}
          hasRecoveryStatus={statusDialogData.hasRecoveryStatus}
          hasRecoveryDriverAssigned={statusDialogData.hasRecoveryDriverAssigned}
          onConfirm={handleStatusConfirm}
          onInitialConfirm={handleStatusInitialConfirm}
          onAssignRecoveryDriver={handleAssignRecoveryDriver}
          onRemoveAll={handleRemoveAllStatus}
        />
      )}
      {/* Cleanup Checked Confirmation Dialog */}
      <AlertDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clean Up Checked Arrivals</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all checked Maintenance and Safety yard arrivals dated today or earlier, and reset drivers' yard status. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaningUp}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCleanupChecked} disabled={isCleaningUp} className="bg-destructive hover:bg-destructive/90">
              {isCleaningUp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
