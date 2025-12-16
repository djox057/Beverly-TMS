import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Wrench, Plus, Truck, Container } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useRepairs, Repair, RepairFormData } from "@/hooks/useRepairs";
import { RepairDialog } from "@/components/RepairDialog";
import { format } from "date-fns";

export default function Repairs() {
  const { hasRole } = useAuthContext();
  const [activeTab, setActiveTab] = useState<'truck' | 'trailer'>('truck');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState<Repair | null>(null);

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
    togglePaid.mutate({ id: repair.id, is_paid: !repair.is_paid });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const renderRepairsTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Truck #</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Trailer #</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Paid</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
              Loading repairs...
            </TableCell>
          </TableRow>
        ) : repairs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
              No repairs found
            </TableCell>
          </TableRow>
        ) : (
          repairs.map((repair) => (
            <TableRow
              key={repair.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleEditRepair(repair)}
            >
              <TableCell>
                {format(new Date(repair.created_at), 'MM/dd/yyyy')}
              </TableCell>
              <TableCell>{repair.truck_number || '-'}</TableCell>
              <TableCell>{repair.driver_name || '-'}</TableCell>
              <TableCell>{repair.trailer_number || '-'}</TableCell>
              <TableCell className="max-w-[200px] truncate">
                {repair.reason}
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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Repairs</h1>
        </div>
        {canModify && (
          <Button onClick={handleAddRepair}>
            <Plus className="h-4 w-4 mr-2" />
            Add Repair
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'truck' | 'trailer')}>
            <div className="border-b px-4">
              <TabsList className="h-12">
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
    </div>
  );
}
