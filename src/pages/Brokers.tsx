import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Edit, Building, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useBrokers } from "@/hooks/useBrokers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";

interface BrokerFormData {
  name: string;
  mc_number: string;
  address: string;
  phone: string;
  email: string;
}

const ITEMS_PER_PAGE = 50;

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
    phone: "",
    email: ""
  });

  const { toast } = useToast();
  const { data: brokers, isLoading, refetch } = useBrokers();

  // Debounce search term to avoid filtering on every keystroke
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Memoized filtered brokers with pagination
  const { filteredBrokers, totalPages, paginatedBrokers } = useMemo(() => {
    const filtered = brokers?.filter(broker =>
      broker.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      broker.mc_number?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      broker.address?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      broker.city?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      broker.state?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      broker.phone?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      broker.email?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    ) || [];

    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return { filteredBrokers: filtered, totalPages: total, paginatedBrokers: paginated };
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
      phone: "",
      email: ""
    });
  };

  const handleAddBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('brokers')
        .insert({
          name: formData.name,
          mc_number: formData.mc_number || null,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Broker added successfully",
      });

      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add broker",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBroker) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('brokers')
        .update({
          name: formData.name,
          mc_number: formData.mc_number || null,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null
        })
        .eq('id', editingBroker.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Broker updated successfully",
      });

      resetForm();
      setIsEditDialogOpen(false);
      setEditingBroker(null);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update broker",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBroker = async (brokerId: string) => {
    try {
      const { error } = await supabase
        .from('brokers')
        .delete()
        .eq('id', brokerId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Broker deleted successfully",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete broker",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (broker: any) => {
    setEditingBroker(broker);
    setFormData({
      name: broker.name || "",
      mc_number: broker.mc_number || "",
      address: broker.address || "",
      phone: broker.phone || "",
      email: broker.email || ""
    });
    setIsEditDialogOpen(true);
  };

  const formatAddress = (broker: any) => {
    const parts = [];
    if (broker.address) parts.push(broker.address);
    if (broker.city) parts.push(broker.city);
    if (broker.state) parts.push(broker.state);
    if (broker.zip_code) parts.push(broker.zip_code);
    return parts.length > 0 ? parts.join(', ') : '—';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Brokers</h1>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name*</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ABC Logistics"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mc_number">MC Number</Label>
                  <Input
                    id="mc_number"
                    value={formData.mc_number}
                    onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })}
                    placeholder="MC123456"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="123 Main St"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="dispatch@company.com"
                  />
                </div>
              </div>

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Broker Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search brokers..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>MC Number</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedBrokers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {isLoading ? "Loading..." : "No brokers found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedBrokers.map((broker) => (
                    <TableRow key={broker.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{broker.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{broker.mc_number || "—"}</TableCell>
                      <TableCell className="max-w-xs">{formatAddress(broker)}</TableCell>
                      <TableCell>{broker.phone || "—"}</TableCell>
                      <TableCell>{broker.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditDialog(broker)}
                          >
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredBrokers.length)} of {filteredBrokers.length} brokers
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="text-sm">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Broker</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditBroker} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_name">Company Name*</Label>
                <Input
                  id="edit_name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ABC Logistics"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_mc_number">MC Number</Label>
                <Input
                  id="edit_mc_number"
                  value={formData.mc_number}
                  onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })}
                  placeholder="MC123456"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_address">Street Address</Label>
              <Input
                id="edit_address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Main St"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_phone">Phone</Label>
                <Input
                  id="edit_phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_email">Email</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="dispatch@company.com"
                />
              </div>
            </div>

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
    </div>
  );
};

export default Brokers;