import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Edit, Building, Trash2, Loader2, ChevronLeft, ChevronRight, Download, DollarSign, Ban, CreditCard } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";
import { useBrokers } from "@/hooks/useBrokers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/hooks/useAuth";
import { BrokerCreditStatus } from "@/components/BrokerCreditStatus";
interface BrokerFormData {
  name: string;
  mc_number: string;
  address: string;
  credit_status: "buy" | "no_buy" | "credit_limit";
  credit_limit_amount: number | null;
}
const ITEMS_PER_PAGE = 100;
const Brokers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<BrokerFormData>({
    name: "",
    mc_number: "",
    address: "",
    credit_status: "buy",
    credit_limit_amount: null
  });
  const {
    toast
  } = useToast();
  const {
    data: brokers,
    isLoading,
    refetch
  } = useBrokers();
  const { roles } = useAuth();

  // Check if user is dispatch-only (has dispatch role but not admin/manager/accounting/supervisor)
  const isDispatchOnly = roles.includes('dispatch') && 
    !roles.includes('admin') && 
    !roles.includes('manager') && 
    !roles.includes('accounting') &&
    !roles.includes('supervisor');

  // Debounce search term to avoid filtering on every keystroke
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Memoized filtered brokers with pagination
  const {
    filteredBrokers,
    totalPages,
    paginatedBrokers
  } = useMemo(() => {
    console.log(`🔍 Brokers Page: Starting with ${brokers?.length || 0} brokers, search: "${debouncedSearchTerm}"`);
    
    const filtered = brokers?.filter(broker => broker.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) || broker.mc_number?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) || broker.address?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) || [];
    
    console.log(`✅ Brokers Page: Filtered to ${filtered.length} brokers`);
    
    // Check if test broker is in filtered results
    const testBroker = filtered.find(b => b.id === '1dda8956-e4c2-45b1-904c-d763a7d55f1b');
    console.log('🔍 Test broker (TRANSPORTATION ONE, LLC) in Brokers page:', testBroker ? 'YES' : 'NO');
    
    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    return {
      filteredBrokers: filtered,
      totalPages: total,
      paginatedBrokers: paginated
    };
  }, [brokers, debouncedSearchTerm, currentPage]);

  // Reset to page 1 when search term changes
  useMemo(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);
  const resetForm = () => {
    setFormData({
      name: "",
      mc_number: "",
      address: "",
      credit_status: "buy",
      credit_limit_amount: null
    });
    setEditingBroker(null);
  };
  const handleAddBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.mc_number.trim() || !formData.address.trim()) {
      toast({
        title: "Error",
        description: "Name, MC Number, and Address are required",
        variant: "destructive"
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const {
        error
      } = await supabase.from("brokers").insert([formData]);
      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Error",
            description: "A broker with this MC Number already exists",
            variant: "destructive"
          });
        } else {
          throw error;
        }
        return;
      }
      toast({
        title: "Success",
        description: "Broker added successfully"
      });
      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add broker",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleEditBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBroker || !formData.name.trim() || !formData.mc_number.trim() || !formData.address.trim()) {
      toast({
        title: "Error",
        description: "Name, MC Number, and Address are required",
        variant: "destructive"
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const {
        error
      } = await supabase.from("brokers").update(formData).eq("id", editingBroker.id);
      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Error",
            description: "A broker with this MC Number already exists",
            variant: "destructive"
          });
        } else {
          throw error;
        }
        return;
      }
      toast({
        title: "Success",
        description: "Broker updated successfully"
      });
      resetForm();
      setIsEditDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update broker",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteBroker = async (brokerId: string) => {
    try {
      const {
        error
      } = await supabase.from("brokers").delete().eq("id", brokerId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Broker deleted successfully"
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete broker",
        variant: "destructive"
      });
    }
  };
  const openEditDialog = (broker: any) => {
    setEditingBroker(broker);
    setFormData({
      name: broker.name || "",
      mc_number: broker.mc_number || "",
      address: broker.address || "",
      credit_status: broker.credit_status || "buy",
      credit_limit_amount: broker.credit_limit_amount || null
    });
    setIsEditDialogOpen(true);
  };

  // getCreditStatusDisplay removed - now using BrokerCreditStatus component

  const exportToExcel = () => {
    const exportData = filteredBrokers.map(broker => ({
      "Company Name": broker.name || "",
      "MC Number": broker.mc_number || "",
      "Credit Status": broker.credit_status === "credit_limit" 
        ? `Credit Limit: $${broker.credit_limit_amount?.toLocaleString() || 0}` 
        : broker.credit_status === "no_buy" ? "No Buy" : "Buy",
      "Address": broker.address || ""
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Brokers");
    XLSX.writeFile(workbook, "brokers_export.xlsx");
  };
  if (isLoading) {
    return <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>;
  }
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground px-[10px]">Brokers</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Broker
              </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Broker</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddBroker} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name *</Label>
                <Input id="name" value={formData.name} onChange={e => setFormData({
                ...formData,
                name: e.target.value
              })} placeholder="ABC Logistics" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mc_number">MC Number *</Label>
                <Input id="mc_number" value={formData.mc_number} onChange={e => setFormData({
                ...formData,
                mc_number: e.target.value
              })} placeholder="MC123456" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Full Address *</Label>
                <Input id="address" value={formData.address} onChange={e => setFormData({
                ...formData,
                address: e.target.value
              })} placeholder="123 Main St, City, State ZIP" required />
              </div>

              <div className="space-y-2">
                <Label>Credit Status *</Label>
                <Select value={formData.credit_status} onValueChange={(value: "buy" | "no_buy" | "credit_limit") => {
                  setFormData({
                    ...formData,
                    credit_status: value,
                    credit_limit_amount: value === "credit_limit" ? formData.credit_limit_amount : null
                  });
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select credit status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="no_buy">No Buy</SelectItem>
                    <SelectItem value="credit_limit">Credit Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.credit_status === "credit_limit" && (
                <div className="space-y-2">
                  <Label htmlFor="credit_limit_amount">Credit Limit Amount *</Label>
                  <Input 
                    id="credit_limit_amount" 
                    type="number" 
                    min="1"
                    value={formData.credit_limit_amount || ""} 
                    onChange={e => setFormData({
                      ...formData,
                      credit_limit_amount: e.target.value ? parseFloat(e.target.value) : null
                    })} 
                    placeholder="10000" 
                    required 
                  />
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Broker
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Broker Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="Search brokers..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col flex-1">
          <div className="flex-1">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Company Name</TableHead>
                  <TableHead className="w-[130px]">MC Number</TableHead>
                  <TableHead className="w-[160px]">Credit Status</TableHead>
                  <TableHead className="w-[300px]">Address</TableHead>
                  {!isDispatchOnly && <TableHead className="w-[120px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody className="h-full">
                {paginatedBrokers.length === 0 ? <TableRow>
                    <TableCell colSpan={isDispatchOnly ? 4 : 5} className="text-center py-8 text-muted-foreground h-[500px]">
                      {isLoading ? "Loading..." : "No brokers found"}
                    </TableCell>
                  </TableRow> : <>
                    {paginatedBrokers.map(broker => <TableRow key={broker.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{broker.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{broker.mc_number}</TableCell>
                        <TableCell>
                          <BrokerCreditStatus 
                            broker={broker} 
                            canEdit={roles.includes('admin') || roles.includes('accounting')}
                            onUpdate={refetch}
                          />
                        </TableCell>
                        <TableCell className="max-w-xs">{broker.address}</TableCell>
                        {!isDispatchOnly && (
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(broker)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete broker {broker.name}. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteBroker(broker.id)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>)}
                    {/* Add empty rows to maintain consistent height */}
                    {Array.from({
                  length: Math.max(0, ITEMS_PER_PAGE - paginatedBrokers.length)
                }).map((_, i) => <TableRow key={`empty-${i}`} className="h-[57px]">
                        <TableCell colSpan={isDispatchOnly ? 4 : 5}>&nbsp;</TableCell>
                      </TableRow>)}
                  </>}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && <div className="flex items-center justify-between px-2 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredBrokers.length)} of {filteredBrokers.length} brokers
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="text-sm">
                  Page {currentPage} of {totalPages}
                </div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Broker</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditBroker} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_name">Company Name *</Label>
              <Input id="edit_name" value={formData.name} onChange={e => setFormData({
              ...formData,
              name: e.target.value
            })} placeholder="ABC Logistics" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_mc_number">MC Number *</Label>
              <Input id="edit_mc_number" value={formData.mc_number} onChange={e => setFormData({
              ...formData,
              mc_number: e.target.value
            })} placeholder="MC123456" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_address">Full Address *</Label>
              <Input id="edit_address" value={formData.address} onChange={e => setFormData({
              ...formData,
              address: e.target.value
            })} placeholder="123 Main St, City, State ZIP" required />
            </div>

            <div className="space-y-2">
              <Label>Credit Status *</Label>
              <Select value={formData.credit_status} onValueChange={(value: "buy" | "no_buy" | "credit_limit") => {
                setFormData({
                  ...formData,
                  credit_status: value,
                  credit_limit_amount: value === "credit_limit" ? formData.credit_limit_amount : null
                });
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select credit status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="no_buy">No Buy</SelectItem>
                  <SelectItem value="credit_limit">Credit Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.credit_status === "credit_limit" && (
              <div className="space-y-2">
                <Label htmlFor="edit_credit_limit_amount">Credit Limit Amount *</Label>
                <Input 
                  id="edit_credit_limit_amount" 
                  type="number" 
                  min="1"
                  value={formData.credit_limit_amount || ""} 
                  onChange={e => setFormData({
                    ...formData,
                    credit_limit_amount: e.target.value ? parseFloat(e.target.value) : null
                  })} 
                  placeholder="10000" 
                  required 
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Broker
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>;
};
export default Brokers;