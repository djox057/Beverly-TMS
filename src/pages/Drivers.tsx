import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Edit, Phone, Mail, Trash2, Loader2 } from "lucide-react";
import { useDrivers } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DriverFormData {
  name: string;
  phone: string;
  email: string;
  license_number: string;
  home_address: string;
  home_city: string;
  home_state: string;
  home_latitude: string;
  home_longitude: string;
}

const Drivers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<DriverFormData>({
    name: "",
    phone: "",
    email: "",
    license_number: "",
    home_address: "",
    home_city: "",
    home_state: "",
    home_latitude: "",
    home_longitude: ""
  });

  const { toast } = useToast();
  const { data: drivers, isLoading, refetch } = useDrivers();

  // Filter drivers based on search term
  const filteredDrivers = drivers?.filter(driver =>
    driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.home_city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.home_state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.license_number?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      license_number: "",
      home_address: "",
      home_city: "",
      home_state: "",
      home_latitude: "",
      home_longitude: ""
    });
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('drivers')
        .insert({
          name: formData.name,
          phone: formData.phone || null,
          email: formData.email || null,
          license_number: formData.license_number || null,
          home_address: formData.home_address || null,
          home_city: formData.home_city || null,
          home_state: formData.home_state || null,
          home_latitude: formData.home_latitude ? parseFloat(formData.home_latitude) : null,
          home_longitude: formData.home_longitude ? parseFloat(formData.home_longitude) : null
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Driver added successfully",
      });

      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add driver",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          name: formData.name,
          phone: formData.phone || null,
          email: formData.email || null,
          license_number: formData.license_number || null,
          home_address: formData.home_address || null,
          home_city: formData.home_city || null,
          home_state: formData.home_state || null,
          home_latitude: formData.home_latitude ? parseFloat(formData.home_latitude) : null,
          home_longitude: formData.home_longitude ? parseFloat(formData.home_longitude) : null
        })
        .eq('id', editingDriver.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Driver updated successfully",
      });

      resetForm();
      setIsEditDialogOpen(false);
      setEditingDriver(null);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update driver",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDriver = async (driverId: string) => {
    try {
      const { error } = await supabase
        .from('drivers')
        .delete()
        .eq('id', driverId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Driver deleted successfully",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete driver",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (driver: any) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name || "",
      phone: driver.phone || "",
      email: driver.email || "",
      license_number: driver.license_number || "",
      home_address: driver.home_address || "",
      home_city: driver.home_city || "",
      home_state: driver.home_state || "",
      home_latitude: driver.home_latitude?.toString() || "",
      home_longitude: driver.home_longitude?.toString() || ""
    });
    setIsEditDialogOpen(true);
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
        <h1 className="text-3xl font-semibold text-foreground">Drivers</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Add Driver
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Driver</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddDriver} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name*</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Smith"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_number">License Number</Label>
                  <Input
                    id="license_number"
                    value={formData.license_number}
                    onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                    placeholder="DL123456789"
                  />
                </div>
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
                    placeholder="john.smith@company.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="home_address">Home Address</Label>
                <Input
                  id="home_address"
                  value={formData.home_address}
                  onChange={(e) => setFormData({ ...formData, home_address: e.target.value })}
                  placeholder="1234 Oak Street"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="home_city">Home City</Label>
                  <Input
                    id="home_city"
                    value={formData.home_city}
                    onChange={(e) => setFormData({ ...formData, home_city: e.target.value })}
                    placeholder="Chicago"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="home_state">Home State</Label>
                  <Input
                    id="home_state"
                    value={formData.home_state}
                    onChange={(e) => setFormData({ ...formData, home_state: e.target.value })}
                    placeholder="IL"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="home_latitude">Latitude</Label>
                  <Input
                    id="home_latitude"
                    type="number"
                    step="any"
                    value={formData.home_latitude}
                    onChange={(e) => setFormData({ ...formData, home_latitude: e.target.value })}
                    placeholder="41.8781"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="home_longitude">Longitude</Label>
                  <Input
                    id="home_longitude"
                    type="number"
                    step="any"
                    value={formData.home_longitude}
                    onChange={(e) => setFormData({ ...formData, home_longitude: e.target.value })}
                    placeholder="-87.6298"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Driver
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Driver Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search drivers..."
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
                  <TableHead>Name</TableHead>
                  <TableHead>License #</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Home Location</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No drivers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDrivers.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driver.name}</TableCell>
                      <TableCell>{driver.license_number || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {driver.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              {driver.phone}
                            </div>
                          )}
                          {driver.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              {driver.email}
                            </div>
                          )}
                          {!driver.phone && !driver.email && "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {driver.home_city && driver.home_state 
                          ? `${driver.home_city}, ${driver.home_state}`
                          : driver.home_city || driver.home_state || "—"
                        }
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {driver.home_latitude && driver.home_longitude
                          ? `${driver.home_latitude}, ${driver.home_longitude}`
                          : "—"
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditDialog(driver)}
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
                                  This will permanently delete driver {driver.name}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDriver(driver.id)}>
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
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditDriver} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_name">Name*</Label>
                <Input
                  id="edit_name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Smith"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_license_number">License Number</Label>
                <Input
                  id="edit_license_number"
                  value={formData.license_number}
                  onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                  placeholder="DL123456789"
                />
              </div>
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
                  placeholder="john.smith@company.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_home_address">Home Address</Label>
              <Input
                id="edit_home_address"
                value={formData.home_address}
                onChange={(e) => setFormData({ ...formData, home_address: e.target.value })}
                placeholder="1234 Oak Street"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_home_city">Home City</Label>
                <Input
                  id="edit_home_city"
                  value={formData.home_city}
                  onChange={(e) => setFormData({ ...formData, home_city: e.target.value })}
                  placeholder="Chicago"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_home_state">Home State</Label>
                <Input
                  id="edit_home_state"
                  value={formData.home_state}
                  onChange={(e) => setFormData({ ...formData, home_state: e.target.value })}
                  placeholder="IL"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_home_latitude">Latitude</Label>
                <Input
                  id="edit_home_latitude"
                  type="number"
                  step="any"
                  value={formData.home_latitude}
                  onChange={(e) => setFormData({ ...formData, home_latitude: e.target.value })}
                  placeholder="41.8781"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_home_longitude">Longitude</Label>
                <Input
                  id="edit_home_longitude"
                  type="number"
                  step="any"
                  value={formData.home_longitude}
                  onChange={(e) => setFormData({ ...formData, home_longitude: e.target.value })}
                  placeholder="-87.6298"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Driver
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Drivers;