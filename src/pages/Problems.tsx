import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDriverProblems } from "@/hooks/useDriverProblems";
import { useDrivers } from "@/hooks/useDrivers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, Check, X, Search } from "lucide-react";
import { format } from "date-fns";

export default function Problems() {
  const { problems, isLoading, resolveProblem, updateProblem } = useDriverProblems();
  const { data: drivers = [] } = useDrivers();
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editProblemValue, setEditProblemValue] = useState("");
  const [editStatusValue, setEditStatusValue] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

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

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return format(date, "EEEE, MM/dd/yyyy");
  };

  const isResolved = (problem: typeof problems[0]) => {
    return problem.resolved_at !== null;
  };

  // Split problems into unresolved and resolved
  const { unresolvedProblems, resolvedGrouped } = useMemo(() => {
    const searchLower = searchFilter.toLowerCase().trim();
    
    // Filter problems by search
    const filtered = problems.filter((problem) => {
      if (!searchLower) return true;
      const driverName = driverMap.get(problem.driver_id) || "";
      const truckNumber = problem.truck_number || "";
      return (
        driverName.toLowerCase().includes(searchLower) ||
        truckNumber.toLowerCase().includes(searchLower)
      );
    });

    const unresolved = filtered
      .filter((p) => !p.resolved_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const resolved = filtered.filter((p) => p.resolved_at);

    // Group resolved by date
    const groups = new Map<string, typeof problems>();
    resolved.forEach((problem) => {
      const dateKey = getDateKey(problem.resolved_at) || "unknown";
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(problem);
    });

    const sortedGroups = Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, probs]) => ({
        date,
        problems: probs.sort((a, b) => 
          new Date(b.resolved_at!).getTime() - new Date(a.resolved_at!).getTime()
        ),
      }));

    return { unresolvedProblems: unresolved, resolvedGrouped: sortedGroups };
  }, [problems, searchFilter, driverMap]);

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

  const renderProblemRow = (problem: typeof problems[0], showResolveButton: boolean) => {
    const driverName = driverMap.get(problem.driver_id) || "Unknown Driver";
    const reportedByName = problem.created_by ? profileMap.get(problem.created_by) || "Unknown" : "Unknown";
    const problemText = problem.reason;
    const isEditingProblem = editingProblemId === problem.id;
    const isEditingStatus = editingStatusId === problem.id;
    const problemResolved = isResolved(problem);

    return (
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
          {showResolveButton && !problemResolved && (
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
    );
  };

  const renderTableHeader = () => (
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
  );

  return (
    <div className="py-6 px-4 space-y-6 w-full min-w-[1400px]">
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Home time</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Truck # or Driver..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Tabs defaultValue="problems" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="problems">
                  Home time ({unresolvedProblems.length})
                </TabsTrigger>
                <TabsTrigger value="history">
                  History ({resolvedGrouped.reduce((acc, g) => acc + g.problems.length, 0)})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="problems">
                {unresolvedProblems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No unresolved problems.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      {renderTableHeader()}
                      <TableBody>
                        {unresolvedProblems.map((problem) => renderProblemRow(problem, true))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history">
                {resolvedGrouped.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No resolved problems in history.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      {renderTableHeader()}
                      <TableBody>
                        {resolvedGrouped.map((group) => (
                          <React.Fragment key={group.date}>
                            {group.problems.map((problem, index) => {
                              const isLastInGroup = index === group.problems.length - 1;
                              return (
                                <React.Fragment key={problem.id}>
                                  {renderProblemRow(problem, false)}
                                  {isLastInGroup && (
                                    <TableRow key={`date-${group.date}`} className="bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/30">
                                      <TableCell colSpan={8} className="font-semibold text-center py-2 text-yellow-800 dark:text-yellow-200">
                                        {formatDateHeader(group.date)}
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
