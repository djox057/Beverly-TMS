import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Plus, Minus, Users, ArrowRightLeft } from "lucide-react";
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
  const [dispatcherToSwitch, setDispatcherToSwitch] = useState<{
    dispatcherId: string;
    currentSupervisorId: string;
  } | null>(null);
  const [switchTargetSupervisor, setSwitchTargetSupervisor] = useState("");

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

  const handleSwitchSupervisor = async () => {
    if (dispatcherToSwitch && switchTargetSupervisor) {
      await assignDispatcherToSupervisor(dispatcherToSwitch.dispatcherId, switchTargetSupervisor);
      setDispatcherToSwitch(null);
      setSwitchTargetSupervisor("");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <Card key={i}>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 sm:h-5 sm:w-5" />
                  <Skeleton className="h-5 sm:h-6 w-32 sm:w-48" />
                  <Skeleton className="h-4 sm:h-5 w-14 sm:w-20" />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="grid gap-2">
                {[1, 2, 3].map(j => (
                  <div key={j} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Skeleton className="h-3 w-3 sm:h-4 sm:w-4" />
                      <div className="space-y-1 sm:space-y-2">
                        <Skeleton className="h-4 w-24 sm:w-32" />
                        <Skeleton className="h-3 w-16 sm:w-24" />
                      </div>
                    </div>
                    <div className="flex gap-1 sm:gap-2">
                      <Skeleton className="h-7 w-8 sm:h-8 sm:w-20" />
                      <Skeleton className="h-7 w-8 sm:h-8 sm:w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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
      {/* Header with assign button */}
      {canManage && (
        <div className="flex justify-end mb-4">
          <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="sm:size-default">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Assign Dispatcher to Supervisor</span>
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
        </div>
      )}

      {/* Supervisor Cards - same style as dispatcher cards */}
      {supervisors.map(supervisor => (
        <Card key={supervisor.id} className="mb-4">
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                <span className="text-sm sm:text-base">{supervisor.full_name || supervisor.email}</span>
                {supervisor.ext && (
                  <span className="text-xs sm:text-sm font-normal text-muted-foreground">
                    ext {supervisor.ext}
                  </span>
                )}
                <Badge variant="secondary" className="text-xs">
                  {supervisor.assignments.length} dispatchers
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            {supervisor.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No dispatchers assigned to this supervisor
              </p>
            ) : (
              <div className="grid gap-2">
                {supervisor.assignments.map(assignment => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-2 sm:p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm sm:text-base font-medium">
                          {assignment.dispatcher_name}
                        </div>
                        {assignment.dispatcher_ext && (
                          <div className="text-xs sm:text-sm text-primary">
                            ext {assignment.dispatcher_ext}
                          </div>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 sm:gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 sm:h-8 px-2 sm:px-3"
                          onClick={() => setDispatcherToSwitch({
                            dispatcherId: assignment.dispatcher_id,
                            currentSupervisorId: supervisor.id
                          })}
                        >
                          <ArrowRightLeft className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Switch</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 sm:h-8 px-2 sm:px-3"
                          onClick={() => setDispatcherToRemove(assignment.dispatcher_id)}
                        >
                          <Minus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Remove</span>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

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

      {/* Switch Supervisor Dialog */}
      <Dialog open={dispatcherToSwitch !== null} onOpenChange={open => !open && setDispatcherToSwitch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch Supervisor</DialogTitle>
            <DialogDescription>Select a new supervisor for this dispatcher</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Combobox
              options={supervisors
                .filter(s => s.id !== dispatcherToSwitch?.currentSupervisorId)
                .map(s => ({
                  value: s.id,
                  label: `${s.full_name || s.email}${s.ext ? ` (ext ${s.ext})` : ""}`
                }))}
              value={switchTargetSupervisor}
              onValueChange={setSwitchTargetSupervisor}
              placeholder="Search supervisors..."
              emptyText="No supervisor found."
            />
            <Button
              onClick={handleSwitchSupervisor}
              className="w-full"
              disabled={!switchTargetSupervisor}
            >
              Switch Supervisor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
