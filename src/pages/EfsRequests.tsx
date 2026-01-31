import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Trash2, Search, CreditCard } from "lucide-react";
import { toast } from "sonner";

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
}

// Get distinct purposes for the dropdown
const EFS_PURPOSES = [
  "All",
  "Fuel",
  "Lumper",
  "Scale",
  "Toll",
  "Repair",
  "Tow",
  "Other",
];

export default function EfsRequests() {
  const { hasRole } = useAuthContext();
  const queryClient = useQueryClient();
  const isAdmin = hasRole("admin");

  const [searchQuery, setSearchQuery] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("All");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch all EFS requests
  const { data: efsRequests = [], isLoading } = useQuery({
    queryKey: ["efs-all-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efs_other_requests")
        .select("*")
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data as EfsRequest[];
    },
    staleTime: 30 * 1000,
  });

  // Delete mutation (admin only)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("efs_other_requests")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("EFS request deleted");
      queryClient.invalidateQueries({ queryKey: ["efs-all-requests"] });
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error("Failed to delete EFS request");
      console.error("Delete error:", error);
    },
  });

  // Filter requests
  const filteredRequests = efsRequests.filter((request) => {
    // Purpose filter
    if (purposeFilter !== "All" && request.purpose !== purposeFilter) {
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

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
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
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by truck # or driver name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={purposeFilter} onValueChange={setPurposeFilter}>
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
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredRequests.length} of {efsRequests.length} requests
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
            ) : filteredRequests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 8 : 7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No EFS requests found
                </TableCell>
              </TableRow>
            ) : (
              filteredRequests.map((request) => (
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
                        onClick={() => handleDelete(request.id)}
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete EFS Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this EFS request? This action
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
