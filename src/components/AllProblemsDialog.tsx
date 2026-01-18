import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDriverProblems } from "@/hooks/useDriverProblems";
import { useDrivers } from "@/hooks/useDrivers";
import { useAuthContext } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface AllProblemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AllProblemsDialog({ open, onOpenChange }: AllProblemsDialogProps) {
  const { problems, isLoading, resolveProblem } = useDriverProblems();
  const { data: drivers = [] } = useDrivers();
  const { hasRole } = useAuthContext();
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);

  // Check if user should see actions (hide for dispatcher and afterhours)
  const canSeeActions = !hasRole('dispatch') && !hasRole('afterhours');

  // Build a map of driver_id -> driver info
  const driverMap = new Map<string, { name: string; truckNumber: string; dispatcherName: string }>();
  drivers.forEach((driver: any) => {
    driverMap.set(driver.id, {
      name: driver.name || `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || "Unknown",
      truckNumber: driver.truck_number || "N/A",
      dispatcherName: driver.dispatcher_name || "N/A",
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

  const handleResolveConfirm = () => {
    if (confirmResolveId) {
      resolveProblem.mutate(confirmResolveId);
      setConfirmResolveId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[80%] max-h-[80vh] overflow-hidden flex flex-col">
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
                    <TableHead className="w-[100px]">Truck #</TableHead>
                    <TableHead className="w-[150px]">Driver</TableHead>
                    <TableHead className="w-[150px]">Dispatcher</TableHead>
                    <TableHead className="min-w-[350px]">Problem</TableHead>
                    <TableHead className="w-[180px]">Submitted</TableHead>
                    {canSeeActions && <TableHead className="w-[100px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {problems.map((problem) => {
                    const driverInfo = driverMap.get(problem.driver_id);
                    const problemText = problem.reason;
                    const isLongText = problemText.length > 60;
                    
                    return (
                      <TableRow key={problem.id}>
                        <TableCell className="font-medium">
                          {driverInfo?.truckNumber || "N/A"}
                        </TableCell>
                        <TableCell>
                          {driverInfo?.name || "Unknown Driver"}
                        </TableCell>
                        <TableCell>
                          {driverInfo?.dispatcherName || "N/A"}
                        </TableCell>
                        <TableCell className="min-w-[350px]">
                          {isLongText ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-left cursor-pointer hover:underline max-w-[350px] truncate block">
                                  {problemText.substring(0, 60)}...
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-96 max-h-60 overflow-auto">
                                <p className="text-sm whitespace-pre-wrap">{problemText}</p>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <span>{problemText}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatChicagoTime(problem.created_at)}
                        </TableCell>
                        {canSeeActions && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmResolveId(problem.id)}
                              disabled={resolveProblem.isPending}
                            >
                              Resolve
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmResolveId} onOpenChange={(open) => !open && setConfirmResolveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Problem</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to resolve this problem? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolveConfirm}>
              Resolve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
