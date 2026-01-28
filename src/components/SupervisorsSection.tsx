import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Plus, Minus, Users } from "lucide-react";
import { useSupervisorAssignments } from "@/hooks/useSupervisorAssignments";

interface SupervisorsSectionProps {
  allDispatchers: any[];
  hasRole: (role: string) => boolean;
}

export const SupervisorsSection: React.FC<SupervisorsSectionProps> = ({
  allDispatchers,
  hasRole,
}) => {
  const {
    supervisors,
    loading,
    assignDispatcherToSupervisor,
    removeDispatcherFromSupervisor,
    getUnassignedDispatchers,
  } = useSupervisorAssignments(allDispatchers);

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedDispatcher, setSelectedDispatcher] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [dispatcherToRemove, setDispatcherToRemove] = useState<string | null>(null);

  const canManage = hasRole("manager") || hasRole("admin");
  const unassignedDispatchers = getUnassignedDispatchers();

  const handleAssign = async () => {
    if (selectedDispatcher && selectedSupervisor) {
      await assignDispatcherToSupervisor(selectedDispatcher, selectedSupervisor);
      setSelectedDispatcher("");
      setSelectedSupervisor("");
      setIsAssignDialogOpen(false);
    }
  };

  const confirmRemove = async () => {
    if (dispatcherToRemove) {
      await removeDispatcherFromSupervisor(dispatcherToRemove);
      setDispatcherToRemove(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            <Skeleton className="h-5 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (supervisors.length === 0) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            Supervisors
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <p className="text-sm text-muted-foreground">
            No users with the "supervisor" role found. Assign the supervisor role to users in Admin to see them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm sm:text-base">
              <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
              Supervisors
              <Badge variant="secondary" className="text-xs">
                {supervisors.length}
              </Badge>
            </div>
            {canManage && (
              <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="sm:size-default">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Assign Dispatcher</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Dispatcher to Supervisor</DialogTitle>
                    <DialogDescription>
                      Select a dispatcher and supervisor to create an assignment.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Select Dispatcher</Label>
                      <Combobox
                        options={unassignedDispatchers.map(d => ({
                          value: d.id,
                          label: `${d.full_name || d.email}${d.ext ? ` (ext ${d.ext})` : ""}`
                        }))}
                        value={selectedDispatcher}
                        onValueChange={setSelectedDispatcher}
                        placeholder="Search dispatchers..."
                        emptyText="No unassigned dispatchers found."
                        searchPlaceholder="Search by name..."
                      />
                    </div>
                    <div>
                      <Label>Select Supervisor</Label>
                      <Combobox
                        options={supervisors.map(s => ({
                          value: s.id,
                          label: `${s.full_name || s.email}${s.ext ? ` (ext ${s.ext})` : ""}`
                        }))}
                        value={selectedSupervisor}
                        onValueChange={setSelectedSupervisor}
                        placeholder="Search supervisors..."
                        emptyText="No supervisor found."
                        searchPlaceholder="Search by name..."
                      />
                    </div>
                    <Button
                      onClick={handleAssign}
                      className="w-full"
                      disabled={!selectedDispatcher || !selectedSupervisor}
                    >
                      Assign Dispatcher
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {supervisors.map(supervisor => (
              <Card key={supervisor.id} className="border-amber-200 dark:border-amber-800/50">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <span className="truncate">{supervisor.full_name || supervisor.email}</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {supervisor.assignments.length} dispatchers
                    </Badge>
                  </CardTitle>
                  {supervisor.ext && (
                    <p className="text-xs text-muted-foreground">ext {supervisor.ext}</p>
                  )}
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {supervisor.assignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No dispatchers assigned
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {supervisor.assignments.map(assignment => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between p-2 border rounded-md bg-muted/30"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {assignment.dispatcher_name}
                              </p>
                              {assignment.dispatcher_ext && (
                                <p className="text-[10px] text-muted-foreground">
                                  ext {assignment.dispatcher_ext}
                                </p>
                              )}
                            </div>
                          </div>
                          {canManage && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onClick={() => setDispatcherToRemove(assignment.dispatcher_id)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={dispatcherToRemove !== null} onOpenChange={open => !open && setDispatcherToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Dispatcher from Supervisor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this dispatcher from their supervisor?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
