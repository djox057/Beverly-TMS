import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Wrench, Plus, Truck, Container, Search } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useRepairs, Repair, RepairFormData } from "@/hooks/useRepairs";
import { RepairDialog } from "@/components/RepairDialog";

const CHICAGO_TZ = "America/Chicago";

// Format date string (YYYY-MM-DD) for display as MM/DD/YYYY
const formatRepairDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  try {
    // Parse the date string as YYYY-MM-DD and format as MM/DD/YYYY
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  } catch {
    return '-';
  }
};

export default function Repairs() {
  const { hasRole } = useAuthContext();
  const [activeTab, setActiveTab] = useState<'truck' | 'trailer'>('truck');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState<Repair | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [paidConfirmRepair, setPaidConfirmRepair] = useState<Repair | null>(null);

  const { repairs, isLoading, createRepair, updateRepair, deleteRepair, togglePaid } = useRepairs(activeTab);

  // Check if user has allowed roles
  if (!hasRole('admin') && !hasRole('manager') && !hasRole('maintenance') && !hasRole('accounting') && !hasRole('chicago_management')) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">This page is only accessible to Admin, Manager, Maintenance, Accounting and Chicago Management roles.</p>
          </div>
        </div>
      </div>
    );
  }

  const canModify = hasRole('admin') || hasRole('manager') || hasRole('maintenance') || hasRole('accounting');

  const handleAddRepair = () => {
    setSelectedRepair(null);
    setDialogOpen(true);
  };

  const handleEditRepair = (repair: Repair) => {
    setSelectedRepair(repair);
    setDialogOpen(true);
  };

  const handleSubmit = (data: RepairFormData) => {
    if (selectedRepair) {
      updateRepair.mutate({ id: selectedRepair.id, data });
    } else {
      createRepair.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    deleteRepair.mutate(id);
  };

  const handleTogglePaid = (repair: Repair) => {
    // Show confirmation dialog
    setPaidConfirmRepair(repair);
  };

  const confirmTogglePaid = () => {
    if (paidConfirmRepair) {
      togglePaid.mutate({ id: paidConfirmRepair.id, is_paid: !paidConfirmRepair.is_paid });
      setPaidConfirmRepair(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Filter repairs by search term
  const filteredRepairs = repairs.filter((repair) => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    const matchesDriver = repair.driver_name?.toLowerCase().includes(search);
    if (activeTab === 'truck') {
      return matchesDriver || repair.truck_number?.toLowerCase().includes(search);
    } else {
      return matchesDriver || repair.trailer_number?.toLowerCase().includes(search);
    }
  });

  const renderRepairsTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Date</TableHead>
          {activeTab === 'truck' && <TableHead className="w-28">Truck #</TableHead>}
          {activeTab === 'trailer' && <TableHead className="w-28">Trailer #</TableHead>}
          <TableHead className="w-40">Driver</TableHead>
          <TableHead className="min-w-[150px]">Reason</TableHead>
          <TableHead className="min-w-[150px]">Accounting Note</TableHead>
          <TableHead className="w-32">Amount</TableHead>
          <TableHead className="w-16">Paid</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
              Loading repairs...
            </TableCell>
          </TableRow>
        ) : filteredRepairs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
              No repairs found
            </TableCell>
          </TableRow>
        ) : (
          filteredRepairs.map((repair) => (
            <TableRow
              key={repair.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleEditRepair(repair)}
            >
              <TableCell>
                {formatRepairDate(repair.repair_date)}
              </TableCell>
              {activeTab === 'truck' && <TableCell>{repair.truck_number || '-'}</TableCell>}
              {activeTab === 'trailer' && <TableCell>{repair.trailer_number || '-'}</TableCell>}
              <TableCell>{repair.driver_name || '-'}</TableCell>
              <TableCell>{repair.reason}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {repair.accounting_note || '-'}
              </TableCell>
              <TableCell>{formatCurrency(repair.amount)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={repair.is_paid}
                  onCheckedChange={() => handleTogglePaid(repair)}
                  disabled={!canModify}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Maintenance and Repairs</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={activeTab === 'truck' ? "Search Truck# or Driver..." : "Search Trailer# or Driver..."}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          {canModify && (
            <Button onClick={handleAddRepair}>
              <Plus className="h-4 w-4 mr-2" />
              Add Repair
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'truck' | 'trailer')}>
            <div className="border-b">
              <TabsList className="h-12 bg-transparent p-0">
                <TabsTrigger value="truck" className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Truck Repairs
                </TabsTrigger>
                <TabsTrigger value="trailer" className="flex items-center gap-2">
                  <Container className="h-4 w-4" />
                  Trailer Repairs
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="truck" className="m-0">
              {renderRepairsTable()}
            </TabsContent>

            <TabsContent value="trailer" className="m-0">
              {renderRepairsTable()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <RepairDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        repair={selectedRepair}
        repairType={activeTab}
        onSubmit={handleSubmit}
        onDelete={canModify ? handleDelete : undefined}
      />

      {/* Paid confirmation dialog */}
      <AlertDialog open={!!paidConfirmRepair} onOpenChange={(open) => !open && setPaidConfirmRepair(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {paidConfirmRepair?.is_paid ? 'Mark as Unpaid?' : 'Mark as Paid?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this repair as {paidConfirmRepair?.is_paid ? 'unpaid' : 'paid'}?
              <br />
              <span className="font-medium">
                {formatCurrency(paidConfirmRepair?.amount || 0)} - {paidConfirmRepair?.driver_name}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTogglePaid}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
