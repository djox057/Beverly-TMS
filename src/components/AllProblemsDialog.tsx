import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDriverProblems } from "@/hooks/useDriverProblems";
import { useDrivers } from "@/hooks/useDrivers";
import { Loader2 } from "lucide-react";

interface AllProblemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AllProblemsDialog({ open, onOpenChange }: AllProblemsDialogProps) {
  const { problems, isLoading, resolveProblem } = useDriverProblems();
  const { data: drivers = [] } = useDrivers();

  // Build a map of driver_id -> driver info
  const driverMap = new Map<string, { name: string; truckNumber: string }>();
  drivers.forEach((driver: any) => {
    driverMap.set(driver.id, {
      name: driver.name || `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || "Unknown",
      truckNumber: driver.truck_number || "N/A",
    });
  });

  const formatChicagoTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>All Driver Problems</DialogTitle>
          <DialogDescription>
            {problems.length} active problem{problems.length !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : problems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active problems reported.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Truck #</TableHead>
                  <TableHead className="w-[150px]">Driver</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead className="w-[180px]">Submitted</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((problem) => {
                  const driverInfo = driverMap.get(problem.driver_id);
                  return (
                    <TableRow key={problem.id}>
                      <TableCell className="font-medium">
                        {driverInfo?.truckNumber || "N/A"}
                      </TableCell>
                      <TableCell>
                        {driverInfo?.name || "Unknown Driver"}
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="truncate" title={problem.reason}>
                          {problem.reason}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatChicagoTime(problem.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveProblem.mutate(problem.id)}
                          disabled={resolveProblem.isPending}
                        >
                          Resolve
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
