import { useQuery } from "@tanstack/react-query";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wrench, TruckIcon, X, Pencil, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format as formatDate } from "date-fns";
import { useState } from "react";

interface YardAction {
  id: string;
  driver_id: string;
  action_type: "maintenance" | "return_truck";
  comment: string;
  created_at: string;
  arrival_datetime: string | null;
  created_by: string | null;
  driver: {
    name: string;
    first_name: string;
    last_name: string;
  } | null;
  truck: {
    truck_number: string;
  } | null;
}

interface TwoWeekNoticeDriver {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  two_week_block_date: string;
  truck: {
    truck_number: string;
  } | null;
}

export default function YardArrivals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [actionToCancel, setActionToCancel] = useState<{ id: string; driverId: string; driverName: string } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [actionToEdit, setActionToEdit] = useState<YardAction | null>(null);
  const [editForm, setEditForm] = useState({
    arrival_datetime: "",
    comment: "",
  });

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
          created_at,
          arrival_datetime,
          created_by,
          drivers!driver_yard_actions_driver_id_fkey (
            name,
            first_name,
            last_name
          )
        `)
        .order("arrival_datetime", { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Fetch truck information for each driver
      const actionsWithTrucks = await Promise.all(
        (data || []).map(async (action) => {
          const { data: truckData } = await supabase
            .from("trucks")
            .select("truck_number")
            .eq("driver1_id", action.driver_id)
            .maybeSingle();

          return {
            ...action,
            driver: action.drivers,
            truck: truckData,
          };
        })
      );

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
          two_week_block_date
        `)
        .not("two_week_block_date", "is", null)
        .order("two_week_block_date", { ascending: true });

      if (error) throw error;

      // Fetch truck information for each driver
      const driversWithTrucks = await Promise.all(
        (data || []).map(async (driver) => {
          const { data: truckData } = await supabase
            .from("trucks")
            .select("truck_number")
            .eq("driver1_id", driver.id)
            .maybeSingle();

          return {
            ...driver,
            truck: truckData,
          };
        })
      );

      return driversWithTrucks as TwoWeekNoticeDriver[];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const maintenanceActions = yardActions?.filter((a) => a.action_type === "maintenance") || [];
  const returnTruckActions = yardActions?.filter((a) => a.action_type === "return_truck") || [];

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
  const groupedTwoWeekNotice = groupTwoWeekNoticeByDate(twoWeekNoticeDrivers || []);

  const handleCancelAction = async () => {
    if (!actionToCancel) return;

    try {
      // Delete the yard action
      await supabase.from("driver_yard_actions").delete().eq("id", actionToCancel.id);

      // Remove going_yard status from driver
      await supabase.from("drivers").update({ going_yard: false }).eq("id", actionToCancel.driverId);

      toast({
        title: "Yard arrival canceled",
      });
      queryClient.invalidateQueries({ queryKey: ["yard-arrivals"] });
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
      await supabase
        .from("driver_yard_actions")
        .update({
          arrival_datetime: editForm.arrival_datetime,
          comment: editForm.comment,
        })
        .eq("id", actionToEdit.id);

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

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    // Format as MM/DD/YYYY HH:mm without timezone conversion
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  if (isLoading || isLoadingTwoWeekNotice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Yard Arrivals</h1>

      <div className="grid gap-6 md:grid-cols-3">
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
                          <div key={action.id} className="border rounded-lg p-4 space-y-2">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 space-y-1">
                                <p className="font-semibold">
                                  #{action.truck?.truck_number || "N/A"} {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Time of arrival: {formatDateTime(action.arrival_datetime || action.created_at)}
                                </p>
                                <div className="pt-1">
                                  <p className="text-sm"><span className="font-medium">Reason:</span> {action.comment}</p>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setActionToEdit(action);
                                    setEditForm({
                                      arrival_datetime: action.arrival_datetime || action.created_at,
                                      comment: action.comment,
                                    });
                                    setEditDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setActionToCancel({
                                      id: action.id,
                                      driverId: action.driver_id,
                                      driverName: action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`,
                                    });
                                    setCancelDialogOpen(true);
                                  }}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
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
                        <div key={action.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1">
                              <p className="font-semibold">
                                #{action.truck?.truck_number || "N/A"} {action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Time of arrival: {formatDateTime(action.arrival_datetime || action.created_at)}
                              </p>
                              <div className="pt-1">
                                <p className="text-sm"><span className="font-medium">Reason:</span> {action.comment}</p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setActionToEdit(action);
                                  setEditForm({
                                    arrival_datetime: action.arrival_datetime || action.created_at,
                                    comment: action.comment,
                                  });
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setActionToCancel({
                                    id: action.id,
                                    driverId: action.driver_id,
                                    driverName: action.driver?.name || `${action.driver?.first_name} ${action.driver?.last_name}`,
                                  });
                                  setCancelDialogOpen(true);
                                }}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
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
                        <div key={driver.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1">
                              <p className="font-semibold">
                                #{driver.truck?.truck_number || "N/A"} {driver.name || `${driver.first_name} ${driver.last_name}`}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Last day: {formatDate(date, "MMMM d, yyyy")}
                              </p>
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
            <DialogDescription>
              Update the arrival time and reason for {actionToEdit?.driver?.name || `${actionToEdit?.driver?.first_name} ${actionToEdit?.driver?.last_name}`}
            </DialogDescription>
          </DialogHeader>
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
    </div>
  );
}
