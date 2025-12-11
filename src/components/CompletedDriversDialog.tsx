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
import { History, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format as formatDate } from "date-fns";

interface CompletedDriver {
  id: string;
  driver_name: string;
  truck_number: string | null;
  trailer_number: string | null;
  changed_at: string;
}

const ITEMS_PER_PAGE = 10;

export function CompletedDriversDialog() {
  const [open, setOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

          let truckNumber = (lastAssignment?.trucks as any)?.truck_number || null;
          let trailerNumber = (lastAssignment?.trailers as any)?.trailer_number || null;

          // If no truck/trailer found in last assignment, search for any historical truck/trailer
          if (!truckNumber || !trailerNumber) {
            const { data: allAssignments } = await supabase
              .from("assignment_history")
              .select(`
                truck_id,
                trailer_id,
                trucks:truck_id (truck_number),
                trailers:trailer_id (trailer_number)
              `)
              .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`)
              .order("changed_at", { ascending: false });

            if (allAssignments) {
              // Find the most recent non-null truck and trailer
              if (!truckNumber) {
                const assignmentWithTruck = allAssignments.find(
                  (a) => (a.trucks as any)?.truck_number
                );
                if (assignmentWithTruck) {
                  truckNumber = (assignmentWithTruck.trucks as any)?.truck_number;
                }
              }
              if (!trailerNumber) {
                const assignmentWithTrailer = allAssignments.find(
                  (a) => (a.trailers as any)?.trailer_number
                );
                if (assignmentWithTrailer) {
                  trailerNumber = (assignmentWithTrailer.trailers as any)?.trailer_number;
                }
              }
            }
          }

          const driverName = driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim();

          return {
            id: driver.id,
            driver_name: driverName,
            truck_number: truckNumber,
            trailer_number: trailerNumber,
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

  const totalDrivers = completedDrivers?.length || 0;
  const totalPages = Math.ceil(totalDrivers / ITEMS_PER_PAGE);
  
  // Paginate the flat list first, then group
  const paginatedDrivers = completedDrivers?.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  ) || [];
  
  const groupedDrivers = groupByDate(paginatedDrivers);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (isOpen) setCurrentPage(1);
    }}>
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
        ) : totalDrivers === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No completed drivers found
          </p>
        ) : (
          <>
            <ScrollArea className="max-h-[50vh]">
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
            
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({totalDrivers} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}