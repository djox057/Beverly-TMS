import { useState, useMemo } from "react";
import { isValidUUID } from "@/utils/validation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Trash2, Search, CreditCard, ChevronLeft, ChevronRight, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface EfsRequest {
  id: string;
  driver_name: string;
  truck_number: string | null;
  amount: number;
  purpose: string;
  city: string | null;
  state: string | null;
  requested_at: string;
  requested_by: string | null;
  quantity: number | null;
  receipt_path: string | null;
  company_name: string | null;
  source: 'efs' | 'cash_advance'; // Track which table the record came from
}

const PAGE_SIZE = 100;

// Get distinct purposes for the dropdown
const EFS_PURPOSES = [
  "All",
  "Cash Advance",
  "Fuel",
  "Lumper",
  "Scale",
  "Toll",
  "Repair",
  "Tow",
  "Other",
];

export default function EfsRequests() {
  const { hasRole, profile } = useAuthContext();
  const queryClient = useQueryClient();
  const isAdmin = hasRole("admin") || hasRole("manager");
  const isDispatchOnly = hasRole("dispatch") && !isAdmin && !hasRole("supervisor") && !hasRole("accounting") && !hasRole("safety") && !hasRole("chicago_management");

  const [searchQuery, setSearchQuery] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("All");
  const [requestedByFilter, setRequestedByFilter] = useState("All");
  const [requestedByOpen, setRequestedByOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ id: string; source: 'efs' | 'cash_advance' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch all EFS requests and cash advances
  const { data: efsRequests = [], isLoading } = useQuery({
    queryKey: ["efs-all-requests-combined"],
    queryFn: async () => {
      // Fetch EFS other requests
      const { data: efsData, error: efsError } = await supabase
        .from("efs_other_requests")
        .select("*")
        .order("requested_at", { ascending: false });

      if (efsError) throw efsError;

      // Fetch cash advances with driver name and requester profile
      const { data: cashData, error: cashError } = await supabase
        .from("driver_cash_advances")
        .select("id, amount, requested_at, requested_by, truck_number, driver_id, drivers(name)")
        .order("requested_at", { ascending: false });

      if (cashError) throw cashError;

      // Fetch profiles to map user_id to full_name
      const allRequesterIds = [...new Set((cashData || []).map(c => c.requested_by).filter(Boolean))] as string[];
      const requesterIds = allRequesterIds.filter(isValidUUID);
      if (requesterIds.length < allRequesterIds.length) {
        console.warn(`[EfsRequests] Filtered ${allRequesterIds.length - requesterIds.length} invalid UUIDs from requested_by`);
      }
      let profilesMap: Record<string, string> = {};
      
      if (requesterIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", requesterIds);
        
        profilesMap = (profilesData || []).reduce((acc, p) => {
          if (p.user_id && p.full_name) acc[p.user_id] = p.full_name;
          return acc;
        }, {} as Record<string, string>);
      }

      // Transform EFS requests
      const efsFormatted: EfsRequest[] = (efsData || []).map((item) => ({
        id: item.id,
        driver_name: item.driver_name,
        truck_number: item.truck_number,
        amount: item.amount,
        purpose: item.purpose,
        city: item.city,
        state: item.state,
        requested_at: item.requested_at,
        requested_by: item.requested_by,
        quantity: item.quantity,
        receipt_path: item.receipt_path,
        company_name: item.company_name,
        source: 'efs' as const,
      }));

      // Transform cash advances to match EfsRequest format
      const cashFormatted: EfsRequest[] = (cashData || []).map((item) => ({
        id: item.id,
        driver_name: (item.drivers as { name: string } | null)?.name || "Unknown",
        truck_number: item.truck_number,
        amount: item.amount,
        purpose: "Cash Advance",
        city: null,
        state: null,
        requested_at: item.requested_at,
        requested_by: item.requested_by ? (profilesMap[item.requested_by] || (isValidUUID(item.requested_by) ? null : item.requested_by)) : null,
        quantity: null,
        receipt_path: null,
        company_name: null,
        source: 'cash_advance' as const,
      }));

      // Combine and sort by date descending
      const combined = [...efsFormatted, ...cashFormatted].sort(
        (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
      );

      return combined;
    },
    staleTime: 30 * 1000,
  });

  // Delete mutation (admin only)
  const deleteMutation = useMutation({
    mutationFn: async ({ id, source }: { id: string; source: 'efs' | 'cash_advance' }) => {
      const tableName = source === 'cash_advance' ? 'driver_cash_advances' : 'efs_other_requests';
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request deleted");
      queryClient.invalidateQueries({ queryKey: ["efs-all-requests-combined"] });
      setDeleteItem(null);
    },
    onError: (error) => {
      toast.error("Failed to delete request");
      console.error("Delete error:", error);
    },
  });

  // Get unique requesters for filter dropdown
  const uniqueRequesters = useMemo(() => {
    const requesters = efsRequests
      .map(r => r.requested_by)
      .filter((name): name is string => !!name && name.length > 0);
    return [...new Set(requesters)].sort((a, b) => a.localeCompare(b));
  }, [efsRequests]);

  // Filter requests
  const filteredRequests = efsRequests.filter((request) => {
    // Dispatch-only users can only see their own requests
    if (isDispatchOnly && request.requested_by !== profile?.full_name) {
      return false;
    }

    // Purpose filter
    if (purposeFilter !== "All" && request.purpose !== purposeFilter) {
      return false;
    }

    // Requested By filter
    if (requestedByFilter !== "All" && request.requested_by !== requestedByFilter) {
      return false;
    }

    // Search filter (truck# or driver name)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTruck = request.truck_number?.toLowerCase().includes(query);
      const matchesDriver = request.driver_name.toLowerCase().includes(query);
      if (!matchesTruck && !matchesDriver) {
        return false;
      }
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handlePurposeChange = (value: string) => {
    setPurposeFilter(value);
    setCurrentPage(1);
  };

  const handleRequestedByChange = (value: string) => {
    setRequestedByFilter(value);
    setRequestedByOpen(false);
    setCurrentPage(1);
  };

  const handleDelete = (id: string, source: 'efs' | 'cash_advance') => {
    setDeleteItem({ id, source });
  };

  const confirmDelete = () => {
    if (deleteItem) {
      deleteMutation.mutate(deleteItem);
    }
  };

  const getPurposeBadgeVariant = (purpose: string) => {
    switch (purpose) {
      case "Fuel":
        return "default";
      case "Lumper":
        return "secondary";
      case "Repair":
        return "destructive";
      case "Tow":
        return "destructive";
      default:
        return "outline";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">EFS Requests</h1>
            <p className="text-muted-foreground text-sm">
              View all EFS requests made in the system
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by truck # or driver name..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={purposeFilter} onValueChange={handlePurposeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            {EFS_PURPOSES.map((purpose) => (
              <SelectItem key={purpose} value={purpose}>
                {purpose}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Requested By searchable dropdown */}
        <Popover open={requestedByOpen} onOpenChange={setRequestedByOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={requestedByOpen}
              className="w-[220px] justify-between"
            >
              {requestedByFilter === "All" ? "Requested By..." : requestedByFilter}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0">
            <Command>
              <CommandInput placeholder="Search requester..." />
              <CommandList>
                <CommandEmpty>No requester found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="All"
                    onSelect={() => handleRequestedByChange("All")}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        requestedByFilter === "All" ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All
                  </CommandItem>
                  {uniqueRequesters.map((requester) => (
                    <CommandItem
                      key={requester}
                      value={requester}
                      onSelect={() => handleRequestedByChange(requester)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          requestedByFilter === requester ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {requester}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Results count and pagination info */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {paginatedRequests.length} of {filteredRequests.length} requests
          {filteredRequests.length !== efsRequests.length && ` (${efsRequests.length} total)`}
        </div>
        {totalPages > 1 && (
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Truck #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Requested By</TableHead>
              {isAdmin && <TableHead className="w-[60px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Skeleton className="h-8 w-8" />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : paginatedRequests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 8 : 7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No EFS requests found
                </TableCell>
              </TableRow>
            ) : (
              paginatedRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(request.requested_at), "MMM d, yyyy")}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(request.requested_at), "h:mm a")}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {request.driver_name}
                  </TableCell>
                  <TableCell>{request.truck_number || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={getPurposeBadgeVariant(request.purpose)}>
                      {request.purpose}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {request.city && request.state
                      ? `${request.city}, ${request.state}`
                      : request.city || request.state || "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(request.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {request.requested_by || "-"}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(request.id, request.source)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  className="w-9"
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteItem?.source === 'cash_advance' ? 'cash advance' : 'EFS request'}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
