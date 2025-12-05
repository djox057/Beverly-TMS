import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Loader2 } from "lucide-react";
import { format as formatDate } from "date-fns";

interface CompletedDriver {
  id: string;
  driver_name: string;
  truck_number: string | null;
  trailer_number: string | null;
  changed_at: string;
}

export function CompletedDriversDialog() {
  const [open, setOpen] = useState(false);

  const { data: completedDrivers, isLoading } = useQuery({
    queryKey: ["completed-drivers-history"],
    queryFn: async () => {
      // Get drivers who were terminated (is_active = false and termination_date is set)
      const { data: terminatedDrivers, error: driversError } = await supabase
        .from("drivers")
        .select(`
          id,
          name,
          first_name,
          last_name,
          termination_date
        `)
        .eq("is_active", false)
        .not("termination_date", "is", null)
        .order("termination_date", { ascending: false });

      if (driversError) throw driversError;

      // For each terminated driver, get their last assignment from assignment_history
      const driversWithAssignments = await Promise.all(
        (terminatedDrivers || []).map(async (driver) => {
          // Get the last assignment where this driver was assigned
          const { data: lastAssignment } = await supabase
            .from("assignment_history")
            .select(`
              truck_id,
              trailer_id,
              changed_at,
              trucks:truck_id (truck_number),
              trailers:trailer_id (trailer_number)
            `)
            .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`)
            .order("changed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const driverName = driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim();

          return {
            id: driver.id,
            driver_name: driverName,
            truck_number: (lastAssignment?.trucks as any)?.truck_number || null,
            trailer_number: (lastAssignment?.trailers as any)?.trailer_number || null,
            changed_at: driver.termination_date!,
          } as CompletedDriver;
        })
      );

      return driversWithAssignments;
    },
    enabled: open,
  });

  // Group by date descending
  const groupByDate = (drivers: CompletedDriver[]) => {
    const groups = new Map<string, CompletedDriver[]>();

    drivers.forEach((driver) => {
      const dateKey = driver.changed_at.split("T")[0];
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(driver);
    });

    // Sort by date descending (newest first)
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  };

  const groupedDrivers = completedDrivers ? groupByDate(completedDrivers) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <History className="h-4 w-4" />
          Completed Drivers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Completed Drivers History</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : groupedDrivers.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No completed drivers found
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6 pr-4">
              {groupedDrivers.map(([dateKey, drivers]) => {
                const [year, month, day] = dateKey.split("-").map(Number);
                const date = new Date(year, month - 1, day);
                return (
                  <div key={dateKey} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                      {formatDate(date, "EEEE, MMMM d, yyyy")}
                    </h3>
                    <div className="space-y-2">
                      {drivers.map((driver) => (
                        <div
                          key={driver.id}
                          className="border rounded-lg p-3 bg-muted/30"
                        >
                          <p className="font-medium">{driver.driver_name}</p>
                          <div className="text-sm text-muted-foreground mt-1 flex gap-4">
                            <span>
                              Truck: {driver.truck_number || "N/A"}
                            </span>
                            <span>
                              Trailer: {driver.trailer_number || "N/A"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
