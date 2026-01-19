import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDriverProblems } from "@/hooks/useDriverProblems";
import { useDrivers } from "@/hooks/useDrivers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { format } from "date-fns";

export default function Problems() {
  const { problems, isLoading, resolveProblem, updateProblem } = useDriverProblems();
  const { data: drivers = [] } = useDrivers();
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editProblemValue, setEditProblemValue] = useState("");
  const [editStatusValue, setEditStatusValue] = useState("");

  // Fetch profiles for "Reported by" column
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-problems"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  // Build maps
  const driverMap = new Map<string, string>();
  drivers.forEach((driver: any) => {
    driverMap.set(driver.id, driver.name || `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || "Unknown");
  });

  const profileMap = new Map<string, string>();
  profiles.forEach((profile: any) => {
    profileMap.set(profile.user_id, profile.full_name || profile.email || "Unknown");
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

  const formatShortDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "numeric",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getDateKey = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return format(date, "yyyy-MM-dd");
  };

  const getTodayKey = () => {
    return format(new Date(), "yyyy-MM-dd");
  };

  const formatDateHeader = (dateStr: string) => {
    // Add 1 day to fix the off-by-one issue
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return format(date, "EEEE, MM/dd/yyyy");
  };

  const isResolved = (problem: typeof problems[0]) => {
    return problem.resolved_at !== null;
  };

  // Group problems by resolution date (or today for unresolved)
  const groupedProblems = useMemo(() => {
    const today = getTodayKey();
    const groups = new Map<string, typeof problems>();

    // Sort problems - resolved by resolved_at date, unresolved go to "today"
    problems.forEach((problem) => {
      let dateKey: string;
      if (problem.resolved_at) {
        dateKey = getDateKey(problem.resolved_at) || today;
      } else {
        // Unresolved problems appear under today's date
        dateKey = today;
      }

      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(problem);
    });

    // Convert to array and sort by date descending
    const sortedGroups = Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, probs]) => ({
        date,
        problems: probs.sort((a, b) => {
          // Unresolved first, then by created_at desc
          if (!a.resolved_at && b.resolved_at) return -1;
          if (a.resolved_at && !b.resolved_at) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
      }));

    return sortedGroups;
  }, [problems]);

  const handleResolveConfirm = () => {
    if (confirmResolveId) {
      resolveProblem.mutate(confirmResolveId);
      setConfirmResolveId(null);
    }
  };

  const handleStartEditProblem = (problemId: string, currentReason: string) => {
    setEditingProblemId(problemId);
    setEditProblemValue(currentReason);
  };

  const handleSaveProblem = (problemId: string) => {
    updateProblem.mutate({ problemId, reason: editProblemValue });
    setEditingProblemId(null);
    setEditProblemValue("");
  };

  const handleCancelEditProblem = () => {
    setEditingProblemId(null);
    setEditProblemValue("");
  };

  const handleStartEditStatus = (problemId: string, currentStatus: string) => {
    setEditingStatusId(problemId);
    setEditStatusValue(currentStatus || "open");
  };

  const handleSaveStatus = (problemId: string) => {
    updateProblem.mutate({ problemId, status: editStatusValue });
    setEditingStatusId(null);
    setEditStatusValue("");
  };

  const handleCancelEditStatus = () => {
    setEditingStatusId(null);
    setEditStatusValue("");
  };

  return (
    <div className="py-6 px-4 space-y-6 w-full min-w-[1400px]">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Driver Problems</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : problems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No problems reported.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px] min-w-[80px]">Truck #</TableHead>
                    <TableHead className="w-[120px] min-w-[120px]">Driver</TableHead>
                    <TableHead className="w-[120px] min-w-[120px]">Dispatcher</TableHead>
                    <TableHead className="w-[480px] min-w-[480px]">Problem</TableHead>
                    <TableHead className="w-[480px] min-w-[480px]">Status</TableHead>
                    <TableHead className="w-[140px] min-w-[140px]">Submitted</TableHead>
                    <TableHead className="w-[140px] min-w-[140px]">Reported By</TableHead>
                    <TableHead className="w-[100px] min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedProblems.map((group) => (
                    <>
                      {group.problems.map((problem, index) => {
                        const driverName = driverMap.get(problem.driver_id) || "Unknown Driver";
                        const reportedByName = problem.created_by ? profileMap.get(problem.created_by) || "Unknown" : "Unknown";
                        const problemText = problem.reason;
                        const isEditingProblem = editingProblemId === problem.id;
                        const isEditingStatus = editingStatusId === problem.id;
                        const problemResolved = isResolved(problem);
                        const isLastInGroup = index === group.problems.length - 1;

                        return (
                          <>
                            <TableRow 
                              key={problem.id}
                              className={problemResolved ? "bg-green-100 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/30" : ""}
                            >
                              <TableCell className="font-medium">
                                {problem.truck_number || "N/A"}
                              </TableCell>
                              <TableCell>{driverName}</TableCell>
                              <TableCell>{problem.dispatcher_name || "N/A"}</TableCell>
                              <TableCell className="w-[480px] min-w-[480px]">
                                {isEditingProblem ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={editProblemValue}
                                      onChange={(e) => setEditProblemValue(e.target.value)}
                                      className="flex-1"
                                    />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleSaveProblem(problem.id)}
                                      disabled={updateProblem.isPending}
                                    >
                                      <Check className="h-4 w-4 text-green-500" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={handleCancelEditProblem}
                                    >
                                      <X className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2 group">
                                    {problemText.length > 80 ? (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="text-left cursor-pointer hover:underline whitespace-pre-wrap break-words line-clamp-2">
                                            {problemText}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[500px] max-h-60 overflow-auto z-50 bg-popover">
                                          <p className="text-sm whitespace-pre-wrap">{problemText}</p>
                                        </PopoverContent>
                                      </Popover>
                                    ) : (
                                      <span className="whitespace-pre-wrap break-words line-clamp-2">{problemText}</span>
                                    )}
                                    {!problemResolved && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 shrink-0"
                                        onClick={() => handleStartEditProblem(problem.id, problemText)}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="w-[480px] min-w-[480px]">
                                {isEditingStatus ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      value={editStatusValue}
                                      onChange={(e) => setEditStatusValue(e.target.value)}
                                      className="flex-1 h-8"
                                      placeholder="Status..."
                                    />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 shrink-0"
                                      onClick={() => handleSaveStatus(problem.id)}
                                      disabled={updateProblem.isPending}
                                    >
                                      <Check className="h-3 w-3 text-green-500" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 shrink-0"
                                      onClick={handleCancelEditStatus}
                                    >
                                      <X className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-1 group">
                                    {(problem.status || "open").length > 60 ? (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="text-left cursor-pointer hover:underline whitespace-pre-wrap break-words line-clamp-2 capitalize">
                                            {problem.status || "open"}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[500px] max-h-60 overflow-auto z-50 bg-popover">
                                          <p className="text-sm whitespace-pre-wrap capitalize">{problem.status || "open"}</p>
                                        </PopoverContent>
                                      </Popover>
                                    ) : (
                                      <span className="whitespace-pre-wrap break-words line-clamp-2 capitalize">
                                        {problem.status || "open"}
                                      </span>
                                    )}
                                    {!problemResolved && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 shrink-0"
                                        onClick={() => handleStartEditStatus(problem.id, problem.status || "open")}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {formatShortDateTime(problem.created_at)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {reportedByName}
                              </TableCell>
                              <TableCell>
                                {!problemResolved && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setConfirmResolveId(problem.id)}
                                    disabled={resolveProblem.isPending}
                                  >
                                    Resolve
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                            {/* Yellow date separator row after last problem in group */}
                            {isLastInGroup && (
                              <TableRow key={`date-${group.date}`} className="bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/30">
                                <TableCell colSpan={8} className="font-semibold text-center py-2 text-yellow-800 dark:text-yellow-200">
                                  {formatDateHeader(group.date)}
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
