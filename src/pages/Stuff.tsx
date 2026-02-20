import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, User, Truck, FileSpreadsheet, UserX } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDrivers } from "@/hooks/useDrivers";
import { DriverProfile } from "@/components/DriverProfile";
import { BulkImportDriverExcelDialog } from "@/components/BulkImportDriverExcelDialog";

export default function Stuff() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showBulkImportDialog, setShowBulkImportDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  
  const { data: drivers = [], isLoading } = useDrivers();

  // Filter drivers based on status and search
  const filteredDrivers = useMemo(() => {
    // Filter by status first
    let filtered = drivers;
    if (statusFilter === "active") {
      filtered = drivers.filter(d => d.is_active !== false);
    } else if (statusFilter === "inactive") {
      filtered = drivers.filter(d => d.is_active === false);
    }
    
    if (!searchQuery.trim()) return filtered;
    
    const query = searchQuery.toLowerCase();
    return filtered.filter((driver) => {
      const name = driver.name?.toLowerCase() || "";
      const firstName = driver.first_name?.toLowerCase() || "";
      const lastName = driver.last_name?.toLowerCase() || "";
      const truckNumber = driver.truck_info?.truck_number?.toLowerCase() || "";
      const companyName = driver.company?.name?.toLowerCase() || "";
      
      return (
        name.includes(query) ||
        firstName.includes(query) ||
        lastName.includes(query) ||
        truckNumber.includes(query) ||
        companyName.includes(query)
      );
    });
  }, [drivers, searchQuery, statusFilter]);

  // Get selected driver from URL param
  const selectedDriver = useMemo(() => {
    if (!driverId) return null;
    return drivers.find((d) => d.id === driverId) || null;
  }, [drivers, driverId]);

  // Handle back navigation
  const handleBack = () => {
    navigate("/stuff");
  };

  // Handle driver selection
  const handleSelectDriver = (id: string) => {
    navigate(`/stuff/${id}`);
  };

  // If a driver is selected via URL, show their profile
  if (selectedDriver) {
    return (
      <div className="p-6">
        <DriverProfile
          driver={{
            id: selectedDriver.id,
            name: selectedDriver.name,
            first_name: selectedDriver.first_name,
            last_name: selectedDriver.last_name,
            phone: selectedDriver.phone,
            email: selectedDriver.email,
            truck_number: selectedDriver.truck_info?.truck_number || null,
            trailer_number: selectedDriver.truck_info?.trailer_number || null,
            company_name: selectedDriver.company?.name || null,
            dispatcher_name: selectedDriver.dispatcher_info?.full_name || selectedDriver.dispatcher_info?.email || null,
            hire_date: selectedDriver.hire_date,
            cdl_expiration_date: selectedDriver.cdl_expiration_date,
            medical_card_expiration_date: selectedDriver.medical_card_expiration_date,
            weekly_payment: selectedDriver.weekly_payment,
            weeks_count: selectedDriver.weeks_count,
            agreement_start_date: selectedDriver.agreement_start_date,
          }}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Driver Profiles</h1>
          <p className="text-muted-foreground">
            View and manage driver expenses, documents, and information
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowBulkImportDialog(true)}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Bulk Import
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search drivers by name, truck, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "active" | "inactive" | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Driver Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading drivers...</div>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDrivers.map((driver) => (
              <Card
                key={driver.id}
                className={`cursor-pointer hover:bg-muted/50 transition-colors ${driver.is_active === false ? 'opacity-60' : ''}`}
                onClick={() => handleSelectDriver(driver.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${driver.is_active === false ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                      {driver.is_active === false ? (
                        <UserX className="h-5 w-5 text-destructive" />
                      ) : (
                        <User className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">
                          {driver.name || `${driver.first_name} ${driver.last_name}`}
                        </h3>
                        {driver.is_active === false && (
                          <Badge variant="destructive" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {driver.truck_info?.truck_number && (
                          <Badge variant="outline" className="text-xs">
                            <Truck className="h-3 w-3 mr-1" />
                            {driver.truck_info.truck_number}
                          </Badge>
                        )}
                        {driver.company?.name && (
                          <Badge variant="secondary" className="text-xs whitespace-nowrap">
                            {driver.company.name}
                          </Badge>
                        )}
                      </div>
                      {driver.phone && (
                        <p className="text-xs text-muted-foreground mt-1">{driver.phone}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredDrivers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No drivers found matching your search
            </div>
          )}
        </ScrollArea>
      )}

      {/* Bulk Import Dialog */}
      <BulkImportDriverExcelDialog
        open={showBulkImportDialog}
        onOpenChange={setShowBulkImportDialog}
        drivers={drivers}
      />
    </div>
  );
}